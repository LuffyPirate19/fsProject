// Exponential backoff retry utility

export interface RetryOptions {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitter: boolean;
}

export const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  jitter: true,
};

export async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function calculateBackoffDelay(attempt: number, options: RetryOptions): number {
  let delay = options.initialDelayMs * Math.pow(options.backoffMultiplier, attempt - 1);
  
  if (delay > options.maxDelayMs) {
    delay = options.maxDelayMs;
  }

  if (options.jitter) {
    // Add ±20% jitter to prevent thundering herd
    const jitterAmount = delay * 0.2 * (Math.random() * 2 - 1);
    delay = delay + jitterAmount;
  }

  return Math.max(0, Math.floor(delay));
}

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {},
  onRetry?: (attempt: number, error: Error) => void
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: Error;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < opts.maxAttempts) {
        const delay = calculateBackoffDelay(attempt, opts);
        if (onRetry) {
          onRetry(attempt, lastError);
        }
        await sleep(delay);
      }
    }
  }

  throw lastError!;
}


