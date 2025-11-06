export type OrderStatus = 'pending' | 'processing' | 'completed' | 'failed';
export type EventType = 
  | 'OrderCreated' 
  | 'InventoryReserved' 
  | 'InventoryFailed'
  | 'PaymentAuthorized'
  | 'PaymentFailed'
  | 'OrderShipped'
  | 'OrderFailed'
  | 'CompensationStarted'
  | 'OrderRetried';

export interface OrderEvent {
  id: string;
  eventType: EventType;
  timestamp: Date;
  orderId: string;
  correlationId: string;
  causationId?: string;
  version: number;
  payload: Record<string, any>;
  metadata: {
    service: string;
    retryCount?: number;
    error?: string;
  };
}

export interface Order {
  id: string;
  customerId: string;
  customerName: string;
  status: OrderStatus;
  items: OrderItem[];
  totalAmount: number;
  createdAt: Date;
  updatedAt: Date;
  events: OrderEvent[];
  currentStage: 'order' | 'inventory' | 'payment' | 'shipping' | 'completed';
}

export interface OrderItem {
  productId: string;
  productName: string;
  quantity: number;
  price: number;
}
