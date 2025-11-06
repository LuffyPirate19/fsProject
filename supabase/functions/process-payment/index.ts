import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getProcessingConfig, checkShouldFail, randomDelay } from '../_shared/config.ts';
import { checkIdempotency, storeIdempotencyKey } from '../_shared/idempotency.ts';
import { corsResponse, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { Logger } from '../_shared/logger.ts';

const logger = new Logger('payment-service');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return corsResponse();
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { orderId, correlationId } = await req.json();

    if (!orderId || !correlationId) {
      return errorResponse('Missing orderId or correlationId', 400);
    }

    logger.info('Processing payment', { orderId, correlationId });

    // Check for duplicate event (idempotency)
    const idempotencyCheck = await checkIdempotency(
      supabase,
      'PaymentAuthorized',
      orderId,
      correlationId
    );

    if (idempotencyCheck.isDuplicate) {
      logger.info('Payment already processed (idempotent)', {
        orderId,
        correlationId,
        existingEventId: idempotencyCheck.existingEventId,
      });
      
      return jsonResponse({
        status: 'already_processed',
        eventId: idempotencyCheck.existingEventId,
        message: 'Payment already processed for this order',
      });
    }

    // Get configurable failure rate (default: 15%)
    const config = getProcessingConfig();
    const shouldFail = checkShouldFail(config.payment.failureRate);
    const delay = randomDelay(config.payment.minDelayMs, config.payment.maxDelayMs);

    await new Promise(resolve => setTimeout(resolve, delay));

    if (shouldFail) {
      console.log(`Payment failed for order ${orderId}`);

      // Check for duplicate failure event
      const failureCheck = await checkIdempotency(
        supabase,
        'PaymentFailed',
        orderId,
        correlationId
      );

      if (!failureCheck.isDuplicate) {
        const { data: failureEvent, error: failureEventError } = await supabase
          .from('order_events')
          .insert({
            event_type: 'PaymentFailed',
            order_id: orderId,
            correlation_id: correlationId,
            service: 'payment-service',
            error_message: 'Payment declined',
            payload: { reason: 'Insufficient funds' },
          })
          .select()
          .single();

        if (!failureEventError && failureEvent) {
          await storeIdempotencyKey(
            supabase,
            'PaymentFailed',
            orderId,
            correlationId,
            failureEvent.id
          );
        }

        await supabase.from('orders').update({
          status: 'failed',
          current_stage: 'payment',
        }).eq('id', orderId);

        // Compensation: Release inventory
        await supabase.from('order_events').insert({
          event_type: 'CompensationStarted',
          order_id: orderId,
          correlation_id: correlationId,
          service: 'compensation-service',
          payload: { action: 'release_inventory' },
        });

        // Add to DLQ
        await supabase.from('dead_letter_queue').insert({
          order_id: orderId,
          event_type: 'PaymentFailed',
          event_data: { correlationId },
          error_message: 'Payment declined',
          status: 'failed',
        });
      }

      return jsonResponse({
        status: 'failed',
        reason: 'Payment declined',
        alreadyProcessed: failureCheck.isDuplicate,
      });
    }

    // Success path
    logger.info('Payment authorized', { orderId, correlationId });

    const { data: event, error: eventError } = await supabase
      .from('order_events')
      .insert({
        event_type: 'PaymentAuthorized',
        order_id: orderId,
        correlation_id: correlationId,
        service: 'payment-service',
        payload: { authorized: true },
      })
      .select()
      .single();

    if (eventError) throw eventError;

    // Store idempotency key
    await storeIdempotencyKey(
      supabase,
      'PaymentAuthorized',
      orderId,
      correlationId,
      event.id
    );

    await supabase.from('orders').update({
      current_stage: 'shipping',
    }).eq('id', orderId);

    // Trigger shipping with error handling
    // Note: Using Promise.race for timeout in Deno environment
    const shippingPromise = fetch(`${supabaseUrl}/functions/v1/process-shipping`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ orderId, correlationId }),
    });

    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Shipping service trigger timeout')), 10000)
    );

    Promise.race([shippingPromise, timeoutPromise])
      .then((response: any) => {
        if (response && !response.ok) {
          throw new Error(`Shipping service returned ${response.status}`);
        }
      })
      .catch(err => {
        console.error('Error triggering shipping:', err);
        // Update order status to failed
        supabase.from('order_events').insert({
          event_type: 'OrderFailed',
          order_id: orderId,
          correlation_id: correlationId,
          service: 'payment-service',
          error_message: `Shipping service call failed: ${err.message}`,
          payload: { reason: err.message.includes('timeout') ? 'Next service call timed out' : 'Next service call failed' },
        }).catch(console.error);
        
        supabase.from('orders').update({
          status: 'failed',
          current_stage: 'shipping',
        }).eq('id', orderId).catch(console.error);
      });

      return jsonResponse({ status: 'authorized', eventId: event.id });

  } catch (error) {
    logger.error('Error processing payment', {
      error: error instanceof Error ? error.message : 'Unknown error',
      orderId,
      correlationId,
    });
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return errorResponse(errorMessage, 500);
  }
});