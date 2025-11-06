import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getProcessingConfig, checkShouldFail, randomDelay } from '../_shared/config.ts';
import { checkIdempotency, storeIdempotencyKey } from '../_shared/idempotency.ts';
import { corsResponse, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { Logger } from '../_shared/logger.ts';

const logger = new Logger('inventory-service');

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

    logger.info('Processing inventory', { orderId, correlationId });

    // Check for duplicate event (idempotency)
    const idempotencyCheck = await checkIdempotency(
      supabase,
      'InventoryReserved',
      orderId,
      correlationId
    );

    if (idempotencyCheck.isDuplicate) {
      logger.info('Inventory already processed (idempotent)', {
        orderId,
        correlationId,
        existingEventId: idempotencyCheck.existingEventId,
      });
      
      // Return the existing result
      return jsonResponse({
        status: 'already_processed',
        eventId: idempotencyCheck.existingEventId,
        message: 'Inventory already processed for this order',
      });
    }

    // Get configurable failure rate (default: 20%)
    const config = getProcessingConfig();
    const shouldFail = checkShouldFail(config.inventory.failureRate);
    const delay = randomDelay(config.inventory.minDelayMs, config.inventory.maxDelayMs);

    await new Promise(resolve => setTimeout(resolve, delay));

    if (shouldFail) {
      console.log(`Inventory failed for order ${orderId}`);

      // Check for duplicate failure event
      const failureCheck = await checkIdempotency(
        supabase,
        'InventoryFailed',
        orderId,
        correlationId
      );

      if (!failureCheck.isDuplicate) {
        const { data: failureEvent, error: failureEventError } = await supabase
          .from('order_events')
          .insert({
            event_type: 'InventoryFailed',
            order_id: orderId,
            correlation_id: correlationId,
            service: 'inventory-service',
            error_message: 'Insufficient inventory',
            payload: { reason: 'Out of stock' },
          })
          .select()
          .single();

        if (!failureEventError && failureEvent) {
          await storeIdempotencyKey(
            supabase,
            'InventoryFailed',
            orderId,
            correlationId,
            failureEvent.id
          );
        }

        await supabase.from('orders').update({
          status: 'failed',
          current_stage: 'inventory',
        }).eq('id', orderId);

        // Add to DLQ
        await supabase.from('dead_letter_queue').insert({
          order_id: orderId,
          event_type: 'InventoryFailed',
          event_data: { correlationId },
          error_message: 'Insufficient inventory',
          status: 'failed',
        });
      }

      return jsonResponse({
        status: 'failed',
        reason: 'Insufficient inventory',
        alreadyProcessed: failureCheck.isDuplicate,
      });
    }

    // Success path
    logger.info('Inventory reserved', { orderId, correlationId });

    const { data: event, error: eventError } = await supabase
      .from('order_events')
      .insert({
        event_type: 'InventoryReserved',
        order_id: orderId,
        correlation_id: correlationId,
        service: 'inventory-service',
        payload: { reserved: true },
      })
      .select()
      .single();

    if (eventError) throw eventError;

    // Store idempotency key
    await storeIdempotencyKey(
      supabase,
      'InventoryReserved',
      orderId,
      correlationId,
      event.id
    );

    await supabase.from('orders').update({
      status: 'processing',
      current_stage: 'payment',
    }).eq('id', orderId);

    // Trigger payment processing with error handling
    // Note: Using Promise.race for timeout in Deno environment
    const paymentPromise = fetch(`${supabaseUrl}/functions/v1/process-payment`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ orderId, correlationId }),
    });

    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Payment service trigger timeout')), 10000)
    );

    Promise.race([paymentPromise, timeoutPromise])
      .then((response: any) => {
        if (response && !response.ok) {
          throw new Error(`Payment service returned ${response.status}`);
        }
      })
      .catch(err => {
        console.error('Error triggering payment:', err);
        // Update order status to failed
        supabase.from('order_events').insert({
          event_type: 'OrderFailed',
          order_id: orderId,
          correlation_id: correlationId,
          service: 'inventory-service',
          error_message: `Payment service call failed: ${err.message}`,
          payload: { reason: err.message.includes('timeout') ? 'Next service call timed out' : 'Next service call failed' },
        }).catch(console.error);
        
        supabase.from('orders').update({
          status: 'failed',
          current_stage: 'payment',
        }).eq('id', orderId).catch(console.error);
      });

      return jsonResponse({ status: 'reserved', eventId: event.id });

  } catch (error) {
    logger.error('Error processing inventory', {
      error: error instanceof Error ? error.message : 'Unknown error',
      orderId,
      correlationId,
    });
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return errorResponse(errorMessage, 500);
  }
});