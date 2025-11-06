// DLQ Replay API - Replay failed events from Dead Letter Queue
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsResponse, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { Logger } from '../_shared/logger.ts';
import { requireAuth } from '../_shared/auth.ts';

const logger = new Logger('dlq-replay');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return corsResponse();
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Require authentication for DLQ replay (admin operation)
    const authResult = await requireAuth(req, supabaseUrl, supabaseKey);
    if (authResult instanceof Response) {
      return authResult; // Error response
    }

    const body = await req.json();
    const { dlqItemId, orderId, eventType, batch } = body;

    // Single item replay
    if (dlqItemId) {
      logger.info('Replaying DLQ item', { dlqItemId });

      const { data: dlqItem, error: fetchError } = await supabase
        .from('dead_letter_queue')
        .select('*')
        .eq('id', dlqItemId)
        .single();

      if (fetchError || !dlqItem) {
        return errorResponse('DLQ item not found', 404);
      }

      if (dlqItem.status === 'replayed') {
        return jsonResponse({
          message: 'Item already replayed',
          dlqItemId,
          orderId: dlqItem.order_id,
        });
      }

      // Trigger retry for the failed order
      const retryResponse = await fetch(`${supabaseUrl}/functions/v1/retry-failed-order`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ orderId: dlqItem.order_id }),
      });

      if (!retryResponse.ok) {
        const error = await retryResponse.text();
        logger.error('Retry failed', { dlqItemId, error });
        return errorResponse(`Failed to retry order: ${error}`, 500);
      }

      // Mark DLQ item as replayed
      await supabase
        .from('dead_letter_queue')
        .update({
          status: 'replayed',
          replayed_at: new Date().toISOString(),
        })
        .eq('id', dlqItemId);

      logger.info('DLQ item replayed successfully', { dlqItemId, orderId: dlqItem.order_id });

      return jsonResponse({
        message: 'DLQ item replayed successfully',
        dlqItemId,
        orderId: dlqItem.order_id,
      });
    }

    // Batch replay
    if (batch) {
      logger.info('Batch replaying DLQ items', { filters: { orderId, eventType } });

      let query = supabase
        .from('dead_letter_queue')
        .select('*')
        .eq('status', 'failed');

      if (orderId) {
        query = query.eq('order_id', orderId);
      }
      if (eventType) {
        query = query.eq('event_type', eventType);
      }

      const { data: dlqItems, error: fetchError } = await query.limit(batch.limit || 100);

      if (fetchError) {
        return errorResponse(`Failed to fetch DLQ items: ${fetchError.message}`, 500);
      }

      if (!dlqItems || dlqItems.length === 0) {
        return jsonResponse({
          message: 'No DLQ items found matching criteria',
          replayed: 0,
        });
      }

      const results = [];
      let successCount = 0;
      let failureCount = 0;

      for (const item of dlqItems) {
        try {
          const retryResponse = await fetch(`${supabaseUrl}/functions/v1/retry-failed-order`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${supabaseKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ orderId: item.order_id }),
          });

          if (retryResponse.ok) {
            await supabase
              .from('dead_letter_queue')
              .update({
                status: 'replayed',
                replayed_at: new Date().toISOString(),
              })
              .eq('id', item.id);

            successCount++;
            results.push({ id: item.id, orderId: item.order_id, status: 'success' });
          } else {
            failureCount++;
            results.push({ id: item.id, orderId: item.order_id, status: 'failed' });
          }
        } catch (error) {
          failureCount++;
          results.push({
            id: item.id,
            orderId: item.order_id,
            status: 'error',
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      logger.info('Batch replay completed', {
        total: dlqItems.length,
        success: successCount,
        failed: failureCount,
      });

      return jsonResponse({
        message: 'Batch replay completed',
        total: dlqItems.length,
        success: successCount,
        failed: failureCount,
        results,
      });
    }

    // List DLQ items
    if (req.method === 'GET') {
      const url = new URL(req.url);
      const orderIdParam = url.searchParams.get('orderId');
      const eventTypeParam = url.searchParams.get('eventType');
      const statusParam = url.searchParams.get('status') || 'failed';
      const limit = parseInt(url.searchParams.get('limit') || '50');

      let query = supabase
        .from('dead_letter_queue')
        .select('*')
        .eq('status', statusParam)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (orderIdParam) {
        query = query.eq('order_id', orderIdParam);
      }
      if (eventTypeParam) {
        query = query.eq('event_type', eventTypeParam);
      }

      const { data: dlqItems, error } = await query;

      if (error) {
        return errorResponse(`Failed to fetch DLQ items: ${error.message}`, 500);
      }

      return jsonResponse({
        items: dlqItems || [],
        count: dlqItems?.length || 0,
      });
    }

    return errorResponse('Invalid request. Provide dlqItemId or batch parameter.', 400);

  } catch (error) {
    logger.error('Error in DLQ replay', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return errorResponse(
      error instanceof Error ? error.message : 'Unknown error',
      500
    );
  }
});


