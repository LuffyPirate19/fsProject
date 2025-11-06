// Unit tests for retry logic
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { retryWithBackoff, calculateBackoffDelay, DEFAULT_RETRY_OPTIONS } from '../../supabase/functions/_shared/retry.ts';

describe('Retry Logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('calculateBackoffDelay', () => {
    it('should calculate exponential backoff correctly', () => {
      const options = DEFAULT_RETRY_OPTIONS;
      const delay1 = calculateBackoffDelay(1, options);
      const delay2 = calculateBackoffDelay(2, options);
      const delay3 = calculateBackoffDelay(3, options);

      expect(delay1).toBeGreaterThan(0);
      expect(delay2).toBeGreaterThan(delay1);
      expect(delay3).toBeGreaterThan(delay2);
    });

    it('should respect max delay', () => {
      const options = { ...DEFAULT_RETRY_OPTIONS, maxDelayMs: 1000 };
      const delay = calculateBackoffDelay(10, options); // High attempt count
      expect(delay).toBeLessThanOrEqual(1000);
    });
  });

  describe('retryWithBackoff', () => {
    it('should succeed on first attempt', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      const result = await retryWithBackoff(fn);
      
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('First attempt failed'))
        .mockResolvedValue('success');
      
      const result = await retryWithBackoff(fn, { maxAttempts: 3 });
      
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should throw after max attempts', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('Always fails'));
      
      await expect(
        retryWithBackoff(fn, { maxAttempts: 3 })
      ).rejects.toThrow('Always fails');
      
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should call onRetry callback', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('Fail'))
        .mockResolvedValue('success');
      const onRetry = vi.fn();
      
      await retryWithBackoff(fn, { maxAttempts: 3 }, onRetry);
      
      expect(onRetry).toHaveBeenCalledTimes(1);
      expect(onRetry).toHaveBeenCalledWith(1, expect.any(Error));
    });
  });
});


