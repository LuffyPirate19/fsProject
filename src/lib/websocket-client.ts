// WebSocket client using Socket.io for real-time order updates
import { io, Socket } from 'socket.io-client';

// Convert HTTP URL to WebSocket URL
const getWebSocketUrl = () => {
  const apiUrl = import.meta.env.VITE_WS_URL || import.meta.env.VITE_API_URL || 'http://localhost:3000';
  // Convert http:// to ws:// and https:// to wss://
  return apiUrl.replace(/^http/, 'ws');
};

const WS_URL = getWebSocketUrl();

export class OrderWebSocketClient {
  private socket: Socket | null = null;
  private callbacks: Map<string, Set<(data: any) => void>> = new Map();
  private connected: boolean = false;

  constructor() {
    this.connect();
  }

  private connect() {
    if (this.socket?.connected) {
      return;
    }

    this.socket = io(WS_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    });

    this.socket.on('connect', () => {
      this.connected = true;
      console.log('WebSocket connected');
    });

    this.socket.on('disconnect', () => {
      this.connected = false;
      console.log('WebSocket disconnected');
    });

    // Listen for order events
    this.socket.on('order:created', (data: any) => {
      this.notify('order', { eventType: 'INSERT', new: data });
    });

    this.socket.on('order:updated', (data: any) => {
      this.notify('order', { eventType: 'UPDATE', new: data });
    });

    this.socket.on('order:completed', (data: any) => {
      this.notify('order', { eventType: 'UPDATE', new: data });
    });

    // Listen for event updates
    this.socket.on('event:created', (data: any) => {
      this.notify('event', { eventType: 'INSERT', new: data });
    });
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
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.callbacks.clear();
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }
}

// Singleton instance
export const orderWebSocket = new OrderWebSocketClient();
