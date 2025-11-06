import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/order-pipeline';
const dbName = mongoUri.split('/').pop()?.split('?')[0] || 'order-pipeline';

async function setupDatabase() {
  const client = new MongoClient(mongoUri);

  try {
    await client.connect();
    console.log('Connected to MongoDB');

    const db = client.db(dbName);

    // Create collections (MongoDB creates them automatically on first insert)
    const orders = db.collection('orders');
    const orderEvents = db.collection('order_events');
    const idempotencyKeys = db.collection('idempotency_keys');
    const deadLetterQueue = db.collection('dead_letter_queue');

    // Create indexes for orders
    await orders.createIndex({ id: 1 }, { unique: true });
    await orders.createIndex({ status: 1 });
    await orders.createIndex({ createdAt: -1 });

    // Create indexes for order_events
    await orderEvents.createIndex({ orderId: 1 });
    await orderEvents.createIndex({ createdAt: -1 });
    await orderEvents.createIndex({ eventType: 1 });
    await orderEvents.createIndex({ correlationId: 1 });

    // Create indexes for idempotency_keys
    await idempotencyKeys.createIndex({ key: 1 }, { unique: true });
    await idempotencyKeys.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });

    // Create indexes for dead_letter_queue
    await deadLetterQueue.createIndex({ status: 1 });
    await deadLetterQueue.createIndex({ createdAt: -1 });

    console.log('Database setup complete!');
    console.log('Created collections: orders, order_events, idempotency_keys, dead_letter_queue');
    console.log('Created indexes for optimal query performance');

    // Insert seed data (optional)
    const seedData = process.env.SEED_DATA === 'true';
    if (seedData) {
      console.log('Inserting seed data...');
      
      const seedOrders = [
        {
          id: 'ORD-2025-001',
          customerId: 'cust_001',
          customerName: 'Alice Johnson',
          status: 'completed',
          totalAmount: 198.95,
          currentStage: 'completed',
          createdAt: new Date(),
          updatedAt: new Date(),
          metadata: {},
          items: [
            {
              id: new Date().getTime().toString(),
              productId: 'prod_101',
              productName: 'Wireless Headphones',
              quantity: 2,
              price: 79.99,
              createdAt: new Date(),
            },
            {
              id: (new Date().getTime() + 1).toString(),
              productId: 'prod_102',
              productName: 'USB-C Cable',
              quantity: 3,
              price: 12.99,
              createdAt: new Date(),
            },
          ],
        },
      ];

      await orders.insertMany(seedOrders);
      console.log('Seed data inserted');
    }

  } catch (error) {
    console.error('Error setting up database:', error);
    process.exit(1);
  } finally {
    await client.close();
    console.log('Connection closed');
  }
}

setupDatabase();

