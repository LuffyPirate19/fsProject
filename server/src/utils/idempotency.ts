// Idempotency utilities for MongoDB
import { Collection, ObjectId } from 'mongodb';
import { Logger } from './logger.js';

const logger = new Logger('idempotency');

export interface IdempotencyCheckResult {
  isDuplicate: boolean;
  existingEventId?: string;
  existingEvent?: any;
}

/**
 * Check if an event has already been processed (idempotency check)
 */
export async function checkIdempotency(
  idempotencyKeys: Collection,
  orderEvents: Collection,
  eventType: string,
  orderId: string,
  correlationId: string
): Promise<IdempotencyCheckResult> {
  // Generate idempotency key: eventType_orderId_correlationId
  const idempotencyKey = `${eventType}_${orderId}_${correlationId}`;

  try {
    // Check if this event was already processed
    const existing = await idempotencyKeys.findOne({ key: idempotencyKey });

    if (existing) {
      logger.info('Event already processed (idempotent)', {
        eventType,
        orderId,
        correlationId,
        existingEventId: existing.eventId,
      });

      // Get the existing event details
      const existingEvent = await orderEvents.findOne({ id: existing.eventId });

      return {
        isDuplicate: true,
        existingEventId: existing.eventId,
        existingEvent: existingEvent || undefined,
      };
    }

    return { isDuplicate: false };
  } catch (error) {
    logger.error('Unexpected error in idempotency check', error as Error, {
      eventType,
      orderId,
      correlationId,
    });
    // Fail open - proceed with processing
    return { isDuplicate: false };
  }
}

/**
 * Store idempotency key after successfully processing an event
 */
export async function storeIdempotencyKey(
  idempotencyKeys: Collection,
  eventType: string,
  orderId: string,
  correlationId: string,
  eventId: string,
  ttlHours: number = 24
): Promise<void> {
  const idempotencyKey = `${eventType}_${orderId}_${correlationId}`;
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

  try {
    await idempotencyKeys.insertOne({
      key: idempotencyKey,
      eventId: eventId,
      createdAt: new Date(),
      expiresAt: expiresAt,
    });
  } catch (error: any) {
    // If key already exists, that's okay (race condition handled)
    if (error.code !== 11000) { // Duplicate key error
      logger.error('Error storing idempotency key', error as Error, {
        eventType,
        orderId,
        correlationId,
      });
    }
  }
}

