// Unit tests for schema validation
import { describe, it, expect } from 'vitest';
import { validateEventSchema } from '../../supabase/functions/_shared/schemas.ts';

describe('Schema Validation', () => {
  describe('OrderCreated', () => {
    it('should validate valid OrderCreated event', () => {
      const payload = {
        orderId: 'ORD-123',
        customerId: 'cust_123',
        customerName: 'John Doe',
        items: [{ productId: 'prod_1', quantity: 2, price: 10 }],
        totalAmount: 20,
        correlationId: 'corr_123',
      };

      const result = validateEventSchema('OrderCreated', payload, 1);
      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it('should reject invalid OrderCreated event', () => {
      const payload = {
        orderId: 'ORD-123',
        // Missing required fields
      };

      const result = validateEventSchema('OrderCreated', payload, 1);
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors?.length).toBeGreaterThan(0);
    });

    it('should reject version mismatch', () => {
      const payload = {
        orderId: 'ORD-123',
        customerId: 'cust_123',
        customerName: 'John Doe',
        items: [],
        totalAmount: 0,
        correlationId: 'corr_123',
      };

      const result = validateEventSchema('OrderCreated', payload, 2);
      expect(result.valid).toBe(false);
      expect(result.errors?.some(e => e.includes('Version mismatch'))).toBe(true);
    });
  });

  describe('InventoryReserved', () => {
    it('should validate valid InventoryReserved event', () => {
      const payload = {
        orderId: 'ORD-123',
        correlationId: 'corr_123',
        reserved: true,
      };

      const result = validateEventSchema('InventoryReserved', payload, 1);
      expect(result.valid).toBe(true);
    });
  });
});


