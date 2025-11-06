import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { connectMongoDB, closeMongoDB, checkMongoDBHealth } from './db/mongodb.js';
import { Logger } from './utils/logger.js';
import { createOrder } from './services/order-service.js';
import { Server as SocketServer } from 'socket.io';
import { createServer } from 'http';

dotenv.config();

const logger = new Logger('api-server');
const app = express();
const httpServer = createServer(app);
const io = new SocketServer(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    methods: ['GET', 'POST'],
  },
});

const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:8080',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());

// Health check endpoint
app.get('/health', async (req, res) => {
  const dbHealth = await checkMongoDBHealth();
  res.json({
    status: dbHealth.status === 'healthy' ? 'healthy' : 'unhealthy',
    database: dbHealth,
    timestamp: new Date().toISOString(),
  });
});

// Create order endpoint
app.post('/api/orders', async (req, res) => {
  try {
    const result = await createOrder(req.body);
    
    // Emit realtime update via WebSocket
    io.emit('order:created', result);
    
    // Trigger inventory processing (async)
    const apiUrl = process.env.API_URL || `http://localhost:${PORT}`;
    fetch(`${apiUrl}/api/process-inventory`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        orderId: result.orderId,
        correlationId: result.correlationId,
      }),
    }).catch(err => {
      logger.error('Failed to trigger inventory processing', err as Error);
    });

    res.status(201).json(result);
  } catch (error) {
    logger.error('Error in create order endpoint', error as Error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    });
  }
});

// Get all orders
app.get('/api/orders', async (req, res) => {
  try {
    const { getCollections } = await import('./db/mongodb.js');
    const collections = getCollections();
    
    const orders = await collections.orders
      .find({})
      .sort({ createdAt: -1 })
      .toArray();

    // Fetch events for each order
    const ordersWithEvents = await Promise.all(
      orders.map(async (order) => {
        const events = await collections.orderEvents
          .find({ orderId: order.id })
          .sort({ createdAt: 1 })
          .toArray();

        return {
          ...order,
          events,
        };
      })
    );

    res.json({ orders: ordersWithEvents });
  } catch (error) {
    logger.error('Error fetching orders', error as Error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Get single order
app.get('/api/orders/:orderId', async (req, res) => {
  try {
    const { getCollections } = await import('./db/mongodb.js');
    const collections = getCollections();
    
    const order = await collections.orders.findOne({ id: req.params.orderId });
    
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const events = await collections.orderEvents
      .find({ orderId: order.id })
      .sort({ createdAt: 1 })
      .toArray();

    res.json({ order: { ...order, events } });
  } catch (error) {
    logger.error('Error fetching order', error as Error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Process inventory endpoint
app.post('/api/process-inventory', async (req, res) => {
  try {
    const { processInventory } = await import('./services/inventory-service.js');
    await processInventory(req.body);
    
    // Emit realtime update
    io.emit('order:updated', { orderId: req.body.orderId });
    io.emit('event:created', { orderId: req.body.orderId, eventType: 'InventoryReserved' });
    
    res.json({ status: 'processed' });
  } catch (error) {
    logger.error('Error processing inventory', error as Error);
    // Still emit update even on error
    io.emit('order:updated', { orderId: req.body.orderId });
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Process payment endpoint
app.post('/api/process-payment', async (req, res) => {
  try {
    const { processPayment } = await import('./services/payment-service.js');
    await processPayment(req.body);
    
    // Emit realtime update
    io.emit('order:updated', { orderId: req.body.orderId });
    io.emit('event:created', { orderId: req.body.orderId, eventType: 'PaymentAuthorized' });
    
    res.json({ status: 'processed' });
  } catch (error) {
    logger.error('Error processing payment', error as Error);
    // Still emit update even on error
    io.emit('order:updated', { orderId: req.body.orderId });
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Process shipping endpoint
app.post('/api/process-shipping', async (req, res) => {
  try {
    const { processShipping } = await import('./services/shipping-service.js');
    await processShipping(req.body);
    
    // Emit realtime update
    io.emit('order:updated', { orderId: req.body.orderId });
    io.emit('order:completed', { orderId: req.body.orderId });
    io.emit('event:created', { orderId: req.body.orderId, eventType: 'OrderShipped' });
    
    res.json({ status: 'processed' });
  } catch (error) {
    logger.error('Error processing shipping', error as Error);
    // Still emit update even on error
    io.emit('order:updated', { orderId: req.body.orderId });
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Retry order endpoint
app.post('/api/retry-order', async (req, res) => {
  try {
    const { orderId } = req.body;
    if (!orderId) {
      return res.status(400).json({ error: 'Missing orderId' });
    }

    const { getCollections } = await import('./db/mongodb.js');
    const collections = getCollections();
    
    // Get the order
    const order = await collections.orders.findOne({ id: orderId });
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (order.status !== 'failed') {
      return res.status(400).json({ error: 'Order is not in failed state' });
    }

    // Get the last correlation ID from events
    const lastEvent = await collections.orderEvents
      .find({ orderId })
      .sort({ createdAt: -1 })
      .limit(1)
      .toArray();

    const correlationId = lastEvent[0]?.correlationId || `corr_${orderId}_retry_${Date.now()}`;

    // Create OrderRetried event
    const { v4: uuidv4 } = await import('uuid');
    await collections.orderEvents.insertOne({
      id: uuidv4(),
      eventType: 'OrderRetried',
      orderId,
      correlationId,
      causationId: null,
      version: 1,
      payload: { retryReason: 'Manual retry' },
      service: 'retry-service',
      retryCount: 0,
      errorMessage: null,
      createdAt: new Date(),
    });

    // Update order status back to pending
    await collections.orders.updateOne(
      { id: orderId },
      {
        $set: {
          status: 'pending',
          currentStage: 'order',
          updatedAt: new Date(),
        },
      }
    );

    // Emit realtime update
    io.emit('order:updated', { orderId });
    io.emit('event:created', { orderId, eventType: 'OrderRetried' });
    
    // Trigger inventory processing (async)
    const apiUrl = process.env.API_URL || `http://localhost:${PORT}`;
    fetch(`${apiUrl}/api/process-inventory`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ orderId, correlationId }),
    }).catch(err => {
      logger.error('Failed to trigger inventory after retry', err as Error);
    });
    
    res.json({ status: 'retry_initiated', orderId, correlationId });
  } catch (error) {
    logger.error('Error retrying order', error as Error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Diagnose order endpoint
app.get('/api/diagnose-order/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    const { getCollections } = await import('./db/mongodb.js');
    const collections = getCollections();
    
    const order = await collections.orders.findOne({ id: orderId });
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const events = await collections.orderEvents
      .find({ orderId })
      .sort({ createdAt: -1 })
      .limit(1)
      .toArray();

    const lastEvent = events[0];
    const timeSinceLastEvent = lastEvent 
      ? Date.now() - new Date(lastEvent.createdAt).getTime()
      : 0;

    const isStuck = order.status === 'processing' && timeSinceLastEvent > 30000;

    let likelyIssue = null;
    let recommendation = null;
    let expectedNextStep = null;

    if (isStuck) {
      likelyIssue = `Order has been processing for ${Math.floor(timeSinceLastEvent / 1000)} seconds. The next service in the pipeline may have failed or timed out.`;
      recommendation = 'Try retrying the order or check the service logs.';
      
      if (order.currentStage === 'inventory') {
        expectedNextStep = 'Payment processing';
      } else if (order.currentStage === 'payment') {
        expectedNextStep = 'Shipping processing';
      } else if (order.currentStage === 'shipping') {
        expectedNextStep = 'Order completion';
      }
    } else {
      recommendation = 'Order appears to be processing normally.';
    }

    res.json({
      isStuck,
      timeSinceLastEvent: `${Math.floor(timeSinceLastEvent / 1000)} seconds`,
      expectedNextStep,
      likelyIssue,
      recommendation,
      currentStage: order.currentStage,
      status: order.status,
    });
  } catch (error) {
    logger.error('Error diagnosing order', error as Error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Load generator endpoint
app.post('/api/load-generator', async (req, res) => {
  try {
    const { count = 10, delayMs = 500 } = req.body;
    
    if (count > 100) {
      return res.status(400).json({ error: 'Maximum 100 orders allowed' });
    }

    const { createOrder } = await import('./services/order-service.js');
    
    // Generate random orders
    const products = [
      { name: 'Wireless Headphones', price: 79.99 },
      { name: 'USB-C Cable', price: 12.99 },
      { name: 'Gaming Mouse', price: 59.99 },
      { name: 'Mechanical Keyboard', price: 149.99 },
      { name: 'Laptop Stand', price: 39.99 },
    ];

    const customers = ['Alice', 'Bob', 'Carol', 'David', 'Eve'];

    let created = 0;
    const apiUrl = process.env.API_URL || `http://localhost:${PORT}`;
    
    for (let i = 0; i < count; i++) {
      const customer = customers[Math.floor(Math.random() * customers.length)];
      const product = products[Math.floor(Math.random() * products.length)];
      const quantity = Math.floor(Math.random() * 3) + 1;

      try {
        const result = await createOrder({
          customerName: `${customer} ${i + 1}`,
          items: [{
            productName: product.name,
            quantity,
            price: product.price,
          }],
        });
        
        // Emit realtime update via WebSocket
        io.emit('order:created', result);
        
        // Trigger inventory processing (async) - same as /api/orders endpoint
        fetch(`${apiUrl}/api/process-inventory`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            orderId: result.orderId,
            correlationId: result.correlationId,
          }),
        }).catch(err => {
          logger.error('Failed to trigger inventory processing in load generator', err as Error, {
            orderId: result.orderId,
          });
        });
        
        created++;
      } catch (error) {
        logger.error('Error creating order in load generator', error as Error);
      }

      if (delayMs > 0 && i < count - 1) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }

    res.json({ 
      message: `Successfully created ${created} out of ${count} orders`,
      created,
      requested: count,
    });
  } catch (error) {
    logger.error('Error in load generator', error as Error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// WebSocket connection handling
io.on('connection', (socket) => {
  logger.info('WebSocket client connected', { socketId: socket.id });

  socket.on('disconnect', () => {
    logger.info('WebSocket client disconnected', { socketId: socket.id });
  });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await closeMongoDB();
  httpServer.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

// Start server
async function startServer() {
  try {
    // Connect to MongoDB
    await connectMongoDB();
    
    httpServer.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
      logger.info(`Health check: http://localhost:${PORT}/health`);
      logger.info(`API: http://localhost:${PORT}/api`);
    });
  } catch (error) {
    logger.error('Failed to start server', error as Error);
    process.exit(1);
  }
}

startServer();

