import { Order, OrderEvent, OrderStatus } from "@/types/order";

const generateEvent = (
  orderId: string,
  eventType: OrderEvent['eventType'],
  service: string,
  minutesAgo: number,
  error?: string
): OrderEvent => ({
  id: `evt_${Math.random().toString(36).substr(2, 9)}`,
  eventType,
  timestamp: new Date(Date.now() - minutesAgo * 60000),
  orderId,
  correlationId: `corr_${orderId}`,
  version: 1,
  payload: {},
  metadata: {
    service,
    ...(error && { error }),
  },
});

export const mockOrders: Order[] = [
  {
    id: 'ORD-2025-001',
    customerId: 'cust_001',
    customerName: 'Alice Johnson',
    status: 'completed',
    items: [
      { productId: 'prod_101', productName: 'Wireless Headphones', quantity: 2, price: 79.99 },
      { productId: 'prod_102', productName: 'USB-C Cable', quantity: 3, price: 12.99 },
    ],
    totalAmount: 198.95,
    createdAt: new Date(Date.now() - 45 * 60000),
    updatedAt: new Date(Date.now() - 5 * 60000),
    currentStage: 'completed',
    events: [
      generateEvent('ORD-2025-001', 'OrderCreated', 'order-service', 45),
      generateEvent('ORD-2025-001', 'InventoryReserved', 'inventory-service', 43),
      generateEvent('ORD-2025-001', 'PaymentAuthorized', 'payment-service', 40),
      generateEvent('ORD-2025-001', 'OrderShipped', 'shipping-service', 5),
    ],
  },
  {
    id: 'ORD-2025-002',
    customerId: 'cust_002',
    customerName: 'Bob Smith',
    status: 'processing',
    items: [
      { productId: 'prod_201', productName: 'Gaming Mouse', quantity: 1, price: 59.99 },
    ],
    totalAmount: 59.99,
    createdAt: new Date(Date.now() - 25 * 60000),
    updatedAt: new Date(Date.now() - 2 * 60000),
    currentStage: 'payment',
    events: [
      generateEvent('ORD-2025-002', 'OrderCreated', 'order-service', 25),
      generateEvent('ORD-2025-002', 'InventoryReserved', 'inventory-service', 23),
      generateEvent('ORD-2025-002', 'PaymentAuthorized', 'payment-service', 2),
    ],
  },
  {
    id: 'ORD-2025-003',
    customerId: 'cust_003',
    customerName: 'Carol Davis',
    status: 'failed',
    items: [
      { productId: 'prod_301', productName: 'Mechanical Keyboard', quantity: 1, price: 149.99 },
    ],
    totalAmount: 149.99,
    createdAt: new Date(Date.now() - 60 * 60000),
    updatedAt: new Date(Date.now() - 15 * 60000),
    currentStage: 'payment',
    events: [
      generateEvent('ORD-2025-003', 'OrderCreated', 'order-service', 60),
      generateEvent('ORD-2025-003', 'InventoryReserved', 'inventory-service', 58),
      generateEvent('ORD-2025-003', 'PaymentFailed', 'payment-service', 15, 'Card declined'),
      generateEvent('ORD-2025-003', 'CompensationStarted', 'order-service', 14),
    ],
  },
  {
    id: 'ORD-2025-004',
    customerId: 'cust_004',
    customerName: 'David Wilson',
    status: 'processing',
    items: [
      { productId: 'prod_401', productName: 'Monitor Stand', quantity: 1, price: 34.99 },
      { productId: 'prod_402', productName: 'HDMI Cable', quantity: 2, price: 9.99 },
    ],
    totalAmount: 54.97,
    createdAt: new Date(Date.now() - 15 * 60000),
    updatedAt: new Date(Date.now() - 10 * 60000),
    currentStage: 'inventory',
    events: [
      generateEvent('ORD-2025-004', 'OrderCreated', 'order-service', 15),
    ],
  },
  {
    id: 'ORD-2025-005',
    customerId: 'cust_005',
    customerName: 'Emma Brown',
    status: 'pending',
    items: [
      { productId: 'prod_501', productName: 'Laptop Bag', quantity: 1, price: 44.99 },
    ],
    totalAmount: 44.99,
    createdAt: new Date(Date.now() - 5 * 60000),
    updatedAt: new Date(Date.now() - 5 * 60000),
    currentStage: 'order',
    events: [
      generateEvent('ORD-2025-005', 'OrderCreated', 'order-service', 5),
    ],
  },
];
