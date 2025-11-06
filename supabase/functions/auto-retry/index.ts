// Automatic Retry Mechanism - Background job to retry failed orders
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsResponse, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { Logger } from '../_shared/logger.ts';

const logger = new Logger('auto-retry');

// Configuration
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_COOLDOWN_MS = 60000; // 1 minute between retries
const BATCH_SIZE = 10;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return corsResponse();
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get failed orders from DLQ that are eligible for retry
    const cutoffTime = new Date(Date.now() - RETRY_COOLDOWN_MS);

    // Build query for eligible DLQ items
    let query = supabase
      .from('dead_letter_queue')
      .select('*')
      .eq('status', 'failed')
      .lt('retry_count', MAX_RETRY_ATTEMPTS)
      .order('created_at', { ascending: true })
      .limit(BATCH_SIZE);

    // Filter by last_retry_at if needed
    const { data: dlqItems, error: fetchError } = await query;

    if (fetchError) {
      logger.error('Error fetching DLQ items', { error: fetchError.message });
      return errorResponse(`Failed to fetch DLQ items: ${fetchError.message}`, 500);
    }

    if (!dlqItems || dlqItems.length === 0) {
      return jsonResponse({
        message: 'No items eligible for retry',
        processed: 0,
      });
    }

    logger.info('Processing auto-retry batch', { count: dlqItems.length });

    const results = [];
    let successCount = 0;
    let failureCount = 0;
    let skippedCount = 0;

    for (const item of dlqItems) {
      try {
        // Check if order still exists and is in failed state
        const { data: order, error: orderError } = await supabase
          .from('orders')
          .select('status')
          .eq('id', item.order_id)
          .single();

        if (orderError || !order) {
          logger.warn('Order not found, skipping', { orderId: item.order_id });
          skippedCount++;
          continue;
        }

        if (order.status !== 'failed') {
          logger.info('Order no longer failed, marking as resolved', {
            orderId: item.order_id,
            currentStatus: order.status,
          });
          
          await supabase
            .from('dead_letter_queue')
            .update({ status: 'resolved' })
            .eq('id', item.id);
          
          skippedCount++;
          continue;
        }

        // Increment retry count
        const newRetryCount = (item.retry_count || 0) + 1;

        // Update DLQ item with retry attempt
        await supabase
          .from('dead_letter_queue')
          .update({
            retry_count: newRetryCount,
            last_retry_at: new Date().toISOString(),
          })
          .eq('id', item.id);

        logger.info('Attempting auto-retry', {
          dlqItemId: item.id,
          orderId: item.order_id,
          attempt: newRetryCount,
        });

        // Trigger retry
        const retryResponse = await fetch(`${supabaseUrl}/functions/v1/retry-failed-order`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ orderId: item.order_id }),
        });

        if (retryResponse.ok) {
          successCount++;
          results.push({
            dlqItemId: item.id,
            orderId: item.order_id,
            attempt: newRetryCount,
            status: 'success',
          });

          logger.info('Auto-retry successful', {
            dlqItemId: item.id,
            orderId: item.order_id,
            attempt: newRetryCount,
          });
        } else {
          failureCount++;
          const errorText = await retryResponse.text();
          results.push({
            dlqItemId: item.id,
            orderId: item.order_id,
            attempt: newRetryCount,
            status: 'failed',
            error: errorText,
          });

          // If max retries reached, mark as permanently failed
          if (newRetryCount >= MAX_RETRY_ATTEMPTS) {
            await supabase
              .from('dead_letter_queue')
              .update({ status: 'permanently_failed' })
              .eq('id', item.id);

            logger.warn('Max retries reached, marking as permanently failed', {
              dlqItemId: item.id,
              orderId: item.order_id,
            });
          }

          logger.error('Auto-retry failed', {
            dlqItemId: item.id,
            orderId: item.order_id,
            attempt: newRetryCount,
            error: errorText,
          });
        }

        // Small delay between retries to avoid overwhelming the system
        await new Promise(resolve => setTimeout(resolve, 500));

      } catch (error) {
        failureCount++;
        logger.error('Error during auto-retry', {
          dlqItemId: item.id,
          orderId: item.order_id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        results.push({
          dlqItemId: item.id,
          orderId: item.order_id,
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    logger.info('Auto-retry batch completed', {
      total: dlqItems.length,
      success: successCount,
      failed: failureCount,
      skipped: skippedCount,
    });

    return jsonResponse({
      message: 'Auto-retry batch processed',
      total: dlqItems.length,
      success: successCount,
      failed: failureCount,
      skipped: skippedCount,
      results,
    });

  } catch (error) {
    logger.error('Error in auto-retry', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return errorResponse(
      error instanceof Error ? error.message : 'Unknown error',
      500
    );
  }
});

