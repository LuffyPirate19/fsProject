// Idempotency utilities for event deduplication
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Logger } from './logger.ts';

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
  supabase: SupabaseClient,
  eventType: string,
  orderId: string,
  correlationId: string
): Promise<IdempotencyCheckResult> {
  // Generate idempotency key: eventType_orderId_correlationId
  const idempotencyKey = `${eventType}_${orderId}_${correlationId}`;

  try {
    // Check if this event was already processed
    const { data: existing, error } = await supabase
      .from('idempotency_keys')
      .select('event_id')
      .eq('key', idempotencyKey)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
      logger.error('Error checking idempotency', {
        eventType,
        orderId,
        correlationId,
        error: error.message,
      });
      // On error, proceed (fail open) but log the error
      return { isDuplicate: false };
    }

    if (existing) {
      logger.info('Event already processed (idempotent)', {
        eventType,
        orderId,
        correlationId,
        existingEventId: existing.event_id,
      });

      // Get the existing event details
      const { data: existingEvent } = await supabase
        .from('order_events')
        .select('*')
        .eq('id', existing.event_id)
        .single();

      return {
        isDuplicate: true,
        existingEventId: existing.event_id,
        existingEvent: existingEvent || undefined,
      };
    }

    return { isDuplicate: false };
  } catch (error) {
    logger.error('Unexpected error in idempotency check', {
      eventType,
      orderId,
      correlationId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    // Fail open - proceed with processing
    return { isDuplicate: false };
  }
}

/**
 * Store idempotency key after successfully processing an event
 */
export async function storeIdempotencyKey(
  supabase: SupabaseClient,
  eventType: string,
  orderId: string,
  correlationId: string,
  eventId: string,
  ttlHours: number = 24
): Promise<void> {
  const idempotencyKey = `${eventType}_${orderId}_${correlationId}`;
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

  try {
    const { error } = await supabase
      .from('idempotency_keys')
      .insert({
        key: idempotencyKey,
        event_id: eventId,
        expires_at: expiresAt.toISOString(),
      });

    if (error) {
      // If key already exists, that's okay (race condition handled)
      if (error.code !== '23505') { // Unique violation
        logger.error('Error storing idempotency key', {
          eventType,
          orderId,
          correlationId,
          error: error.message,
        });
      }
    }
  } catch (error) {
    logger.error('Unexpected error storing idempotency key', {
      eventType,
      orderId,
      correlationId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}


