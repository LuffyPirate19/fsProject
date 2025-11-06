// REST API client for MongoDB backend
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export interface CreateOrderRequest {
  customerName: string;
  items: Array<{
    productId?: string;
    productName: string;
    quantity: number;
    price: number;
  }>;
}

export interface CreateOrderResponse {
  orderId: string;
  status: 'created' | 'already_created';
  correlationId: string;
}

export interface Order {
  id: string;
  customerId: string;
  customerName: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  totalAmount: number;
  currentStage: 'order' | 'inventory' | 'payment' | 'shipping' | 'completed';
  createdAt: Date;
  updatedAt: Date;
  metadata?: any;
  items: Array<{
    id: string;
    productId: string;
    productName: string;
    quantity: number;
    price: number;
    createdAt: Date;
  }>;
  events?: Array<{
    id: string;
    eventType: string;
    timestamp: Date;
    orderId: string;
    correlationId: string;
    causationId?: string;
    version: number;
    payload: any;
    metadata: {
      service: string;
      retryCount: number;
      error?: string;
    };
  }>;
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_URL) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(error.error || `HTTP ${response.status}`);
      }

      return response.json();
    } catch (error) {
      // Provide more helpful error messages
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new Error(`Cannot connect to API server at ${this.baseUrl}. Make sure the server is running on port 3000.`);
      }
      throw error;
    }
  }

  // Orders
  async createOrder(data: CreateOrderRequest): Promise<CreateOrderResponse> {
    return this.request<CreateOrderResponse>('/api/orders', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getOrders(): Promise<{ orders: Order[] }> {
    const data = await this.request<{ orders: any[] }>('/api/orders');
    // Transform MongoDB data to match frontend format
    return {
      orders: data.orders.map(order => ({
        ...order,
        createdAt: new Date(order.createdAt),
        updatedAt: new Date(order.updatedAt),
        items: (order.items || []).map((item: any) => ({
          ...item,
          createdAt: new Date(item.createdAt),
        })),
        events: (order.events || []).map((event: any) => ({
          id: event.id,
          eventType: event.eventType,
          timestamp: new Date(event.createdAt),
          orderId: event.orderId,
          correlationId: event.correlationId,
          causationId: event.causationId,
          version: event.version,
          payload: event.payload || {},
          metadata: {
            service: event.service,
            retryCount: event.retryCount || 0,
            error: event.errorMessage,
          },
        })),
      })),
    };
  }

  async getOrder(orderId: string): Promise<{ order: Order }> {
    const data = await this.request<{ order: any }>(`/api/orders/${orderId}`);
    // Transform MongoDB data
    const order = data.order;
    return {
      order: {
        ...order,
        createdAt: new Date(order.createdAt),
        updatedAt: new Date(order.updatedAt),
        items: (order.items || []).map((item: any) => ({
          ...item,
          createdAt: new Date(item.createdAt),
        })),
        events: (order.events || []).map((event: any) => ({
          id: event.id,
          eventType: event.eventType,
          timestamp: new Date(event.createdAt),
          orderId: event.orderId,
          correlationId: event.correlationId,
          causationId: event.causationId,
          version: event.version,
          payload: event.payload || {},
          metadata: {
            service: event.service,
            retryCount: event.retryCount || 0,
            error: event.errorMessage,
          },
        })),
      },
    };
  }

  // Processing
  async processInventory(orderId: string, correlationId: string): Promise<void> {
    await this.request('/api/process-inventory', {
      method: 'POST',
      body: JSON.stringify({ orderId, correlationId }),
    });
  }

  async processPayment(orderId: string, correlationId: string): Promise<void> {
    await this.request('/api/process-payment', {
      method: 'POST',
      body: JSON.stringify({ orderId, correlationId }),
    });
  }

  async processShipping(orderId: string, correlationId: string): Promise<void> {
    await this.request('/api/process-shipping', {
      method: 'POST',
      body: JSON.stringify({ orderId, correlationId }),
    });
  }

  // Retry
  async retryOrder(orderId: string): Promise<{ status: string; orderId: string; correlationId: string }> {
    return this.request<{ status: string; orderId: string; correlationId: string }>('/api/retry-order', {
      method: 'POST',
      body: JSON.stringify({ orderId }),
    });
  }

  // Load Generator
  async generateLoad(count: number, delayMs: number): Promise<{ message: string; created: number; requested: number }> {
    return this.request<{ message: string; created: number; requested: number }>('/api/load-generator', {
      method: 'POST',
      body: JSON.stringify({ count, delayMs }),
    });
  }

  // Diagnose
  async diagnoseOrder(orderId: string): Promise<{
    isStuck: boolean;
    timeSinceLastEvent: string;
    expectedNextStep?: string;
    likelyIssue?: string;
    recommendation: string;
    currentStage: string;
    status: string;
  }> {
    return this.request(`/api/diagnose-order/${orderId}`, {
      method: 'GET',
    });
  }
}

export const apiClient = new ApiClient();

