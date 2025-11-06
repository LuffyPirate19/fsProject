// Configuration for failure rates and processing behavior
// These can be overridden via environment variables

export interface ProcessingConfig {
  inventory: {
    failureRate: number;
    minDelayMs: number;
    maxDelayMs: number;
  };
  payment: {
    failureRate: number;
    minDelayMs: number;
    maxDelayMs: number;
  };
  shipping: {
    failureRate: number;
    minDelayMs: number;
    maxDelayMs: number;
  };
}

export function getProcessingConfig(): ProcessingConfig {
  return {
    inventory: {
      failureRate: parseFloat(Deno.env.get('INVENTORY_FAILURE_RATE') || '0.2'),
      minDelayMs: parseInt(Deno.env.get('INVENTORY_MIN_DELAY_MS') || '1000'),
      maxDelayMs: parseInt(Deno.env.get('INVENTORY_MAX_DELAY_MS') || '3000'),
    },
    payment: {
      failureRate: parseFloat(Deno.env.get('PAYMENT_FAILURE_RATE') || '0.15'),
      minDelayMs: parseInt(Deno.env.get('PAYMENT_MIN_DELAY_MS') || '1500'),
      maxDelayMs: parseInt(Deno.env.get('PAYMENT_MAX_DELAY_MS') || '4000'),
    },
    shipping: {
      failureRate: parseFloat(Deno.env.get('SHIPPING_FAILURE_RATE') || '0.05'),
      minDelayMs: parseInt(Deno.env.get('SHIPPING_MIN_DELAY_MS') || '2000'),
      maxDelayMs: parseInt(Deno.env.get('SHIPPING_MAX_DELAY_MS') || '5000'),
    },
  };
}

export function checkShouldFail(failureRate: number): boolean {
  return Math.random() < failureRate;
}

export function randomDelay(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

