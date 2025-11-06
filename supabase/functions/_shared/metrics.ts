// Metrics collection utility

export interface ServiceMetrics {
  service: string;
  timestamp: string;
  requests: {
    total: number;
    success: number;
    failed: number;
  };
  latency: {
    p50: number;
    p95: number;
    p99: number;
    max: number;
  };
  events: {
    produced: number;
    consumed: number;
    failed: number;
  };
}

// In-memory metrics store (in production, use Redis or similar)
const metricsStore = new Map<string, {
  requests: number[];
  successes: number;
  failures: number;
  eventsProduced: number;
  eventsConsumed: number;
  eventsFailed: number;
}>();

export function recordRequest(service: string, duration: number, success: boolean) {
  if (!metricsStore.has(service)) {
    metricsStore.set(service, {
      requests: [],
      successes: 0,
      failures: 0,
      eventsProduced: 0,
      eventsConsumed: 0,
      eventsFailed: 0,
    });
  }

  const metrics = metricsStore.get(service)!;
  metrics.requests.push(duration);
  
  // Keep only last 1000 requests for percentile calculation
  if (metrics.requests.length > 1000) {
    metrics.requests.shift();
  }

  if (success) {
    metrics.successes++;
  } else {
    metrics.failures++;
  }
}

export function recordEvent(service: string, type: 'produced' | 'consumed' | 'failed') {
  if (!metricsStore.has(service)) {
    metricsStore.set(service, {
      requests: [],
      successes: 0,
      failures: 0,
      eventsProduced: 0,
      eventsConsumed: 0,
      eventsFailed: 0,
    });
  }

  const metrics = metricsStore.get(service)!;
  if (type === 'produced') metrics.eventsProduced++;
  if (type === 'consumed') metrics.eventsConsumed++;
  if (type === 'failed') metrics.eventsFailed++;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

export function getMetrics(service: string): ServiceMetrics | null {
  const data = metricsStore.get(service);
  if (!data) return null;

  const sorted = [...data.requests].sort((a, b) => a - b);
  const total = data.successes + data.failures;

  return {
    service,
    timestamp: new Date().toISOString(),
    requests: {
      total,
      success: data.successes,
      failed: data.failures,
    },
    latency: {
      p50: percentile(sorted, 50),
      p95: percentile(sorted, 95),
      p99: percentile(sorted, 99),
      max: sorted.length > 0 ? sorted[sorted.length - 1] : 0,
    },
    events: {
      produced: data.eventsProduced,
      consumed: data.eventsConsumed,
      failed: data.eventsFailed,
    },
  };
}

export function getAllMetrics(): ServiceMetrics[] {
  const services = Array.from(metricsStore.keys());
  return services.map(service => getMetrics(service)!).filter(Boolean);
}


