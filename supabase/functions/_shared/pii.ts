// PII minimization utilities - hash sensitive data in events

// Simple hash function (for demo - use crypto.subtle in production)
export async function hashString(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
}

export function minimizePII(data: Record<string, any>): Record<string, any> {
  const sensitiveFields = ['customerName', 'email', 'address', 'phone', 'ssn', 'creditCard'];
  const minimized = { ...data };

  for (const field of sensitiveFields) {
    if (minimized[field]) {
      // Replace with tokenized version
      minimized[field] = `[REDACTED_${field.toUpperCase()}]`;
    }
  }

  return minimized;
}

export async function createPIIHash(customerName: string): Promise<string> {
  return await hashString(customerName);
}


