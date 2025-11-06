import { MongoClient, Db, Collection } from 'mongodb';
import { Logger } from '../utils/logger.js';

const logger = new Logger('mongodb');

let client: MongoClient | null = null;
let db: Db | null = null;

export interface MongoDBCollections {
  orders: Collection;
  orderEvents: Collection;
  idempotencyKeys: Collection;
  deadLetterQueue: Collection;
}

let collections: MongoDBCollections | null = null;

/**
 * Connect to MongoDB
 */
export async function connectMongoDB(): Promise<MongoDBCollections> {
  if (collections) {
    return collections;
  }

  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/order-pipeline';
  
  try {
    client = new MongoClient(mongoUri);
    await client.connect();
    
    const dbName = mongoUri.split('/').pop()?.split('?')[0] || 'order-pipeline';
    db = client.db(dbName);
    
    logger.info('Connected to MongoDB', { dbName });

    collections = {
      orders: db.collection('orders'),
      orderEvents: db.collection('order_events'),
      idempotencyKeys: db.collection('idempotency_keys'),
      deadLetterQueue: db.collection('dead_letter_queue'),
    };

    return collections;
  } catch (error) {
    logger.error('Failed to connect to MongoDB', error as Error);
    throw error;
  }
}

/**
 * Get MongoDB collections (must be called after connectMongoDB)
 */
export function getCollections(): MongoDBCollections {
  if (!collections) {
    throw new Error('MongoDB not connected. Call connectMongoDB() first.');
  }
  return collections;
}

/**
 * Close MongoDB connection
 */
export async function closeMongoDB(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    db = null;
    collections = null;
    logger.info('MongoDB connection closed');
  }
}

/**
 * Health check for MongoDB
 */
export async function checkMongoDBHealth(): Promise<{ status: string; message: string }> {
  try {
    if (!db) {
      return { status: 'unhealthy', message: 'Not connected' };
    }
    
    await db.admin().ping();
    return { status: 'healthy', message: 'Connected' };
  } catch (error) {
    return {
      status: 'unhealthy',
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

