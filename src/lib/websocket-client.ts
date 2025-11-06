// WebSocket client for real-time order updates
import { supabase } from '@/integrations/supabase/client';

export class OrderWebSocketClient {
  private channel: any;
  private callbacks: Map<string, Set<(data: any) => void>> = new Map();

  constructor() {
    this.connect();
  }

  private connect() {
    this.channel = supabase
      .channel('order-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
        },
        (payload: any) => {
          this.notify('order', payload);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'order_events',
        },
        (payload: any) => {
          this.notify('event', payload);
        }
      )
      .subscribe();

    return this.channel;
  }

  subscribe(event: 'order' | 'event', callback: (data: any) => void) {
    if (!this.callbacks.has(event)) {
      this.callbacks.set(event, new Set());
    }
    this.callbacks.get(event)!.add(callback);

    // Return unsubscribe function
    return () => {
      this.callbacks.get(event)?.delete(callback);
    };
  }

  private notify(event: 'order' | 'event', data: any) {
    const callbacks = this.callbacks.get(event);
    if (callbacks) {
      callbacks.forEach(cb => cb(data));
    }
  }

  disconnect() {
    if (this.channel) {
      supabase.removeChannel(this.channel);
      this.channel = null;
    }
    this.callbacks.clear();
  }
}

// Singleton instance
export const orderWebSocket = new OrderWebSocketClient();


