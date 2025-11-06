// Event schema definitions with versioning
// Using Zod for runtime validation (will need to import from esm.sh for Deno)

export const EVENT_SCHEMAS = {
  OrderCreated: {
    version: 1,
    schema: {
      orderId: 'string',
      customerId: 'string',
      customerName: 'string',
      items: 'array',
      totalAmount: 'number',
      correlationId: 'string',
    },
  },
  InventoryReserved: {
    version: 1,
    schema: {
      orderId: 'string',
      correlationId: 'string',
      reserved: 'boolean',
    },
  },
  InventoryFailed: {
    version: 1,
    schema: {
      orderId: 'string',
      correlationId: 'string',
      reason: 'string',
    },
  },
  PaymentAuthorized: {
    version: 1,
    schema: {
      orderId: 'string',
      correlationId: 'string',
      authorized: 'boolean',
      transactionId: 'string?',
    },
  },
  PaymentFailed: {
    version: 1,
    schema: {
      orderId: 'string',
      correlationId: 'string',
      reason: 'string',
    },
  },
  OrderShipped: {
    version: 1,
    schema: {
      orderId: 'string',
      correlationId: 'string',
      trackingNumber: 'string',
      shipped: 'boolean',
    },
  },
  OrderFailed: {
    version: 1,
    schema: {
      orderId: 'string',
      correlationId: 'string',
      reason: 'string',
      stage: 'string',
    },
  },
  CompensationStarted: {
    version: 1,
    schema: {
      orderId: 'string',
      correlationId: 'string',
      action: 'string',
    },
  },
} as const;

export function validateEventSchema(
  eventType: keyof typeof EVENT_SCHEMAS,
  payload: Record<string, any>,
  version: number = 1
): { valid: boolean; errors?: string[] } {
  const schemaDef = EVENT_SCHEMAS[eventType];
  if (!schemaDef) {
    return { valid: false, errors: [`Unknown event type: ${eventType}`] };
  }

  if (schemaDef.version !== version) {
    return {
      valid: false,
      errors: [`Version mismatch: expected ${schemaDef.version}, got ${version}`],
    };
  }

  const errors: string[] = [];
  const schema = schemaDef.schema;

  for (const [key, expectedType] of Object.entries(schema)) {
    const isOptional = key.endsWith('?');
    const cleanKey = isOptional ? key.slice(0, -1) : key;

    if (!payload.hasOwnProperty(cleanKey)) {
      if (!isOptional) {
        errors.push(`Missing required field: ${cleanKey}`);
      }
      continue;
    }

    const value = payload[cleanKey];
    const typeMatch = expectedType.replace('?', '');

    if (typeMatch === 'string' && typeof value !== 'string') {
      errors.push(`Field ${cleanKey} must be a string`);
    } else if (typeMatch === 'number' && typeof value !== 'number') {
      errors.push(`Field ${cleanKey} must be a number`);
    } else if (typeMatch === 'boolean' && typeof value !== 'boolean') {
      errors.push(`Field ${cleanKey} must be a boolean`);
    } else if (typeMatch === 'array' && !Array.isArray(value)) {
      errors.push(`Field ${cleanKey} must be an array`);
    }
  }

  return { valid: errors.length === 0, errors: errors.length > 0 ? errors : undefined };
}


