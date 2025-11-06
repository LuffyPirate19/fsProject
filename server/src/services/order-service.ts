import { getCollections } from '../db/mongodb.js';
import { Logger } from '../utils/logger.js';
import { checkIdempotency, storeIdempotencyKey } from '../utils/idempotency.js';
import { v4 as uuidv4 } from 'uuid';

const logger = new Logger('order-service');

export interface CreateOrderRequest {
  customerName: string;
  items: Array<{
    productId: string;
    productName: string;
    quantity: number;
    price: number;
  }>;
}

export interface CreateOrderResponse {
  orderId: string;
  status: 'created' | 'already_created';
  correlationId: string;
}

/**
 * Create a new order
 */
export async function createOrder(body: CreateOrderRequest): Promise<CreateOrderResponse> {
  const startTime = Date.now();
  const collections = getCollections();

  try {
    // Validate input
    if (!body.customerName || !body.items || body.items.length === 0) {
      const error = 'Missing required fields: customerName and items';
      logger.warn(error, { body });
      throw new Error(error);
    }

    // Validate items
    for (const item of body.items) {
      if (!item.productName || item.quantity <= 0 || item.price <= 0) {
        const error = 'Invalid item: missing required fields or invalid values';
        logger.warn(error, { item });
        throw new Error(error);
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
    const existing = await collections.idempotencyKeys.findOne({ key: idempotencyKey });

    if (existing) {
      logger.info('Order already exists (idempotent)', { orderId, correlationId });
      return { orderId, status: 'already_created', correlationId };
    }

    // Create order document
    const orderDoc = {
      id: orderId,
      customerId: customerId,
      customerName: body.customerName,
      status: 'pending',
      totalAmount: totalAmount,
      currentStage: 'order',
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: {},
      items: body.items.map((item, index) => ({
        id: `${orderId}_item_${index}`,
        productId: item.productId || `prod_${Date.now()}_${Math.random()}`,
        productName: item.productName,
        quantity: item.quantity,
        price: item.price,
        createdAt: new Date(),
      })),
    };

    await collections.orders.insertOne(orderDoc);

    // Create OrderCreated event
    const eventId = uuidv4();
    const eventDoc = {
      id: eventId,
      eventType: 'OrderCreated',
      orderId: orderId,
      correlationId: correlationId,
      causationId: null,
      version: 1,
      payload: {
        orderId,
        customerId,
        customerName: body.customerName,
        items: body.items,
        totalAmount,
        correlationId,
      },
      service: 'order-service',
      retryCount: 0,
      errorMessage: null,
      createdAt: new Date(),
    };

    await collections.orderEvents.insertOne(eventDoc);

    // Store idempotency key
    await storeIdempotencyKey(
      collections.idempotencyKeys,
      'OrderCreated',
      orderId,
      correlationId,
      eventId
    );

    logger.info('Order created successfully', {
      orderId,
      correlationId,
      eventId,
      duration: Date.now() - startTime,
    });

    // Trigger inventory processing (async) - will be handled by API route
    // Return immediately to avoid blocking

    return { orderId, status: 'created', correlationId };
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorObj = error instanceof Error ? error : new Error(String(error));
    
    logger.error('Error creating order', errorObj, {
      duration,
    });
    
    throw errorObj;
  }
}

