import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Logger } from '../_shared/logger.ts';
import { corsResponse, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { validateEventSchema, EVENT_SCHEMAS } from '../_shared/schemas.ts';
import { minimizePII, createPIIHash } from '../_shared/pii.ts';
import { recordRequest, recordEvent } from '../_shared/metrics.ts';
import { retryWithBackoff } from '../_shared/retry.ts';

const logger = new Logger('order-service');

interface CreateOrderRequest {
  customerName: string;
  items: Array<{
    productId: string;
    productName: string;
    quantity: number;
    price: number;
  }>;
}

Deno.serve(async (req) => {
  const startTime = Date.now();
  
  if (req.method === 'OPTIONS') {
    return corsResponse();
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body: CreateOrderRequest = await req.json();
    
    // Validate input
    if (!body.customerName || !body.items || body.items.length === 0) {
      const error = 'Missing required fields: customerName and items';
      logger.warn(error, { body: minimizePII(body) });
      recordRequest('order-service', Date.now() - startTime, false);
      return errorResponse(error, 400);
    }

    // Validate items
    for (const item of body.items) {
      if (!item.productName || item.quantity <= 0 || item.price <= 0) {
        const error = 'Invalid item: missing required fields or invalid values';
        logger.warn(error, { item });
        recordRequest('order-service', Date.now() - startTime, false);
        return errorResponse(error, 400);
      }
    }

    // Generate order ID
    const timestamp = Date.now();
    const orderId = `ORD-${new Date().getFullYear()}-${timestamp.toString().slice(-6)}`;
    const customerId = `cust_${Math.random().toString(36).substr(2, 9)}`;
    const correlationId = `corr_${orderId}`;

    // Calculate total
    const totalAmount = body.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    logger.info('Creating order', {
      orderId,
      correlationId,
      customerId,
      itemCount: body.items.length,
      totalAmount,
    });

    // Check for idempotency
    const idempotencyKey = `create_order_${orderId}`;
    const { data: existing } = await supabase
      .from('idempotency_keys')
      .select('event_id')
      .eq('key', idempotencyKey)
      .single();

    if (existing) {
      logger.info('Order already exists (idempotent)', { orderId, correlationId });
      recordRequest('order-service', Date.now() - startTime, true);
      return jsonResponse({ orderId, status: 'already_created', correlationId });
    }

    // Create order with retry
    await retryWithBackoff(
      async () => {
        const { error: orderError } = await supabase
          .from('orders')
          .insert({
            id: orderId,
            customer_id: customerId,
            customer_name: body.customerName,
            status: 'pending',
            total_amount: totalAmount,
            current_stage: 'order',
          });
        if (orderError) throw orderError;
      },
      { maxAttempts: 3 },
      (attempt, error) => {
        logger.warn('Retrying order creation', { orderId, attempt, error: error.message });
      }
    );

    // Create order items
    const orderItems = body.items.map(item => ({
      order_id: orderId,
      product_id: item.productId || `prod_${Date.now()}_${Math.random()}`,
      product_name: item.productName,
      quantity: item.quantity,
      price: item.price,
    }));

    const { error: itemsError } = await supabase
      .from('order_items')
      .insert(orderItems);

    if (itemsError) throw itemsError;

    // Prepare event payload with PII minimization
    const piiHash = await createPIIHash(body.customerName);
    const eventPayload = {
      orderId,
      customerId,
      customerNameHash: piiHash,
      items: body.items.map(item => ({
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity,
        price: item.price,
      })),
      totalAmount,
      correlationId,
    };

    // Validate event schema
    const schemaValidation = validateEventSchema('OrderCreated', eventPayload, 1);
    if (!schemaValidation.valid) {
      logger.error('Event schema validation failed', {
        orderId,
        errors: schemaValidation.errors,
      });
      throw new Error(`Schema validation failed: ${schemaValidation.errors?.join(', ')}`);
    }

    // Create OrderCreated event
    const { data: event, error: eventError } = await supabase
      .from('order_events')
      .insert({
        event_type: 'OrderCreated',
        order_id: orderId,
        correlation_id: correlationId,
        service: 'order-service',
        version: EVENT_SCHEMAS.OrderCreated.version,
        payload: minimizePII(eventPayload),
      })
      .select()
      .single();

    if (eventError) throw eventError;

    // Store idempotency key
    await supabase
      .from('idempotency_keys')
      .insert({
        key: idempotencyKey,
        event_id: event.id,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      });

    logger.info('Order created successfully', {
      orderId,
      correlationId,
      eventId: event.id,
    });

    recordEvent('order-service', 'produced');
    recordRequest('order-service', Date.now() - startTime, true);

    // Trigger inventory processing (async) with retry
    retryWithBackoff(
      async () => {
        const response = await fetch(`${supabaseUrl}/functions/v1/process-inventory`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ orderId, correlationId }),
        });
        if (!response.ok) {
          throw new Error(`Inventory service returned ${response.status}`);
        }
      },
      { maxAttempts: 3 },
      (attempt, error) => {
        logger.warn('Retrying inventory trigger', { orderId, attempt, error: error.message });
      }
    ).catch(err => {
      logger.error('Failed to trigger inventory after retries', {
        orderId,
        correlationId,
        error: err.message,
      });
    });

    return jsonResponse({ orderId, status: 'created', correlationId }, 201);

  } catch (error) {
    const duration = Date.now() - startTime;
    const errorObj = error instanceof Error ? error : new Error(String(error));
    
    logger.error('Error creating order', errorObj, {
      duration,
    });
    
    recordRequest('order-service', duration, false);
    recordEvent('order-service', 'failed');

    return errorResponse(
      errorObj.message,
      500,
      { timestamp: new Date().toISOString() }
    );
  }
});