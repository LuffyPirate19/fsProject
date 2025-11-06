import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsResponse, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { Logger } from '../_shared/logger.ts';
import { optionalAuth } from '../_shared/auth.ts';

const logger = new Logger('retry-service');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return corsResponse();
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Optional auth (for manual retries, auth is optional but recommended)
    await optionalAuth(req, supabaseUrl, supabaseKey);

    const { orderId } = await req.json();

    if (!orderId) {
      return errorResponse('Missing orderId', 400);
    }

    logger.info('Retrying failed order', { orderId });

    // Get order details
    const { data: order } = await supabase
      .from('orders')
      .select('*, order_events(*)')
      .eq('id', orderId)
      .single();

    if (!order || order.status !== 'failed') {
      return errorResponse('Order not found or not in failed state', 400);
    }

    // Determine which stage failed
    const lastEvent = order.order_events.sort((a: any, b: any) => 
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )[0];

    const correlationId = `retry_${orderId}_${Date.now()}`;

    // Reset order status
    await supabase.from('orders').update({
      status: 'processing',
    }).eq('id', orderId);

    // Create retry event
    await supabase.from('order_events').insert({
      event_type: 'OrderRetried',
      order_id: orderId,
      correlation_id: correlationId,
      service: 'retry-service',
      payload: { previousFailure: lastEvent.event_type },
    });

    // Trigger appropriate service based on current stage
    let serviceUrl = '';
    if (order.current_stage === 'inventory') {
      serviceUrl = `${supabaseUrl}/functions/v1/process-inventory`;
    } else if (order.current_stage === 'payment') {
      serviceUrl = `${supabaseUrl}/functions/v1/process-payment`;
    } else if (order.current_stage === 'shipping') {
      serviceUrl = `${supabaseUrl}/functions/v1/process-shipping`;
    }

    if (serviceUrl) {
      fetch(serviceUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ orderId, correlationId }),
      }).catch(err => console.error('Error triggering retry:', err));
    }

    logger.info('Retry initiated', { orderId, correlationId, stage: order.current_stage });

    return jsonResponse({
      status: 'retrying',
      orderId,
      correlationId,
      stage: order.current_stage,
    });

  } catch (error) {
    logger.error('Error retrying order', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return errorResponse(errorMessage, 500);
  }
});