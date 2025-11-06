import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getProcessingConfig, checkShouldFail, randomDelay } from '../_shared/config.ts';
import { checkIdempotency, storeIdempotencyKey } from '../_shared/idempotency.ts';
import { corsResponse, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { Logger } from '../_shared/logger.ts';

const logger = new Logger('shipping-service');

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

    logger.info('Processing shipping', { orderId, correlationId });

    // Check for duplicate event (idempotency)
    const idempotencyCheck = await checkIdempotency(
      supabase,
      'OrderShipped',
      orderId,
      correlationId
    );

    if (idempotencyCheck.isDuplicate) {
      logger.info('Shipping already processed (idempotent)', {
        orderId,
        correlationId,
        existingEventId: idempotencyCheck.existingEventId,
      });
      
      return jsonResponse({
        status: 'already_processed',
        eventId: idempotencyCheck.existingEventId,
        message: 'Shipping already processed for this order',
      });
    }

    // Get configurable failure rate (default: 5%)
    const config = getProcessingConfig();
    const shouldFail = checkShouldFail(config.shipping.failureRate);
    const delay = randomDelay(config.shipping.minDelayMs, config.shipping.maxDelayMs);

    await new Promise(resolve => setTimeout(resolve, delay));

    if (shouldFail) {
      logger.warn('Shipping failed', { orderId, correlationId });

      // Check for duplicate failure event
      const failureCheck = await checkIdempotency(
        supabase,
        'OrderFailed',
        orderId,
        correlationId
      );

      if (!failureCheck.isDuplicate) {
        const { data: failureEvent, error: failureEventError } = await supabase
          .from('order_events')
          .insert({
            event_type: 'OrderFailed',
            order_id: orderId,
            correlation_id: correlationId,
            service: 'shipping-service',
            error_message: 'Shipping unavailable',
            payload: { reason: 'Address validation failed' },
          })
          .select()
          .single();

        if (!failureEventError && failureEvent) {
          await storeIdempotencyKey(
            supabase,
            'OrderFailed',
            orderId,
            correlationId,
            failureEvent.id
          );
        }

        await supabase.from('orders').update({
          status: 'failed',
          current_stage: 'shipping',
        }).eq('id', orderId);

        // Enhanced Saga: Compensation on shipping failure
        // Refund payment and release inventory
        await supabase.from('order_events').insert({
          event_type: 'CompensationStarted',
          order_id: orderId,
          correlation_id: correlationId,
          service: 'compensation-service',
          payload: {
            action: 'refund_payment_and_release_inventory',
            reason: 'Shipping failure compensation',
          },
        });

        // Add to DLQ
        await supabase.from('dead_letter_queue').insert({
          order_id: orderId,
          event_type: 'OrderFailed',
          event_data: { correlationId },
          error_message: 'Shipping unavailable',
          status: 'failed',
        });
      }

      return jsonResponse({
        status: 'failed',
        reason: 'Shipping unavailable',
        alreadyProcessed: failureCheck.isDuplicate,
      });
    }

    // Success path - order completed
    logger.info('Order shipped successfully', { orderId, correlationId });

    const { data: event, error: eventError } = await supabase
      .from('order_events')
      .insert({
        event_type: 'OrderShipped',
        order_id: orderId,
        correlation_id: correlationId,
        service: 'shipping-service',
        payload: { shipped: true, trackingNumber: `TRK${Date.now()}` },
      })
      .select()
      .single();

    if (eventError) throw eventError;

    // Store idempotency key
    await storeIdempotencyKey(
      supabase,
      'OrderShipped',
      orderId,
      correlationId,
      event.id
    );

    await supabase.from('orders').update({
      status: 'completed',
      current_stage: 'completed',
    }).eq('id', orderId);

    return jsonResponse({ status: 'shipped', eventId: event.id });

  } catch (error) {
    logger.error('Error processing shipping', {
      error: error instanceof Error ? error.message : 'Unknown error',
      orderId,
      correlationId,
    });
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return errorResponse(errorMessage, 500);
  }
});