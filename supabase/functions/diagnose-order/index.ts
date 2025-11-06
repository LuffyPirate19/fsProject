// Diagnostic endpoint to check why an order might be stuck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsResponse, jsonResponse, errorResponse } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return corsResponse();
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { orderId } = await req.json();

    if (!orderId) {
      return errorResponse('Order ID is required', 400);
    }

    // Get order with events
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*, order_events(*)')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return errorResponse('Order not found', 404);
    }

    // Sort events by timestamp
    const events = (order.order_events || []).sort((a: any, b: any) => 
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    const lastEvent = events[events.length - 1];
    const now = new Date();
    const lastEventTime = lastEvent ? new Date(lastEvent.created_at) : new Date(order.created_at);
    const timeSinceLastEvent = now.getTime() - lastEventTime.getTime();
    const secondsStuck = Math.floor(timeSinceLastEvent / 1000);

    // Determine what should happen next
    let expectedNextStep = '';
    let likelyIssue = '';
    let recommendation = '';

    if (order.status === 'processing') {
      if (order.current_stage === 'inventory') {
        expectedNextStep = 'Payment processing should be triggered';
        if (secondsStuck > 5) {
          likelyIssue = 'Payment service call may have failed or timed out';
          recommendation = 'Check Supabase logs for "Error triggering payment" or manually retry the order';
        }
      } else if (order.current_stage === 'payment') {
        expectedNextStep = 'Shipping processing should be triggered';
        if (secondsStuck > 5) {
          likelyIssue = 'Shipping service call may have failed or timed out';
          recommendation = 'Check Supabase logs for "Error triggering shipping" or manually retry the order';
        }
      } else if (order.current_stage === 'shipping') {
        expectedNextStep = 'Order should complete';
        if (secondsStuck > 10) {
          likelyIssue = 'Shipping service may have crashed or timed out';
          recommendation = 'Shipping service may need to be manually triggered or order may need retry';
        }
      }
    }

    // Check for stuck patterns
    const isStuck = order.status === 'processing' && secondsStuck > 30;
    
    const diagnostic = {
      orderId: order.id,
      currentStatus: order.status,
      currentStage: order.current_stage,
      isStuck,
      timeSinceLastEvent: `${secondsStuck} seconds`,
      lastEvent: lastEvent ? {
        type: lastEvent.event_type,
        timestamp: lastEvent.created_at,
        service: lastEvent.service,
      } : null,
      expectedNextStep,
      likelyIssue: isStuck ? likelyIssue : null,
      recommendation: isStuck ? recommendation : 'Order appears to be processing normally',
      eventCount: events.length,
      events: events.map((e: any) => ({
        type: e.event_type,
        timestamp: e.created_at,
        service: e.service,
        error: e.error_message,
      })),
    };

    return jsonResponse(diagnostic);
  } catch (error) {
    console.error('Error diagnosing order:', error);
    return errorResponse(
      error instanceof Error ? error.message : 'Unknown error',
      500
    );
  }
});


