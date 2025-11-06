// Client-side schema validation using Zod
import { z } from 'zod';

export const OrderItemSchema = z.object({
  productId: z.string().optional(),
  productName: z.string().min(1, 'Product name is required'),
  quantity: z.number().int().positive('Quantity must be positive'),
  price: z.number().positive('Price must be positive'),
});

export const CreateOrderSchema = z.object({
  customerName: z.string().min(1, 'Customer name is required').max(100),
  items: z.array(OrderItemSchema).min(1, 'At least one item is required'),
});

export type CreateOrderInput = z.infer<typeof CreateOrderSchema>;
export type OrderItemInput = z.infer<typeof OrderItemSchema>;


