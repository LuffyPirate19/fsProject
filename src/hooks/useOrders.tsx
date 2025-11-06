import { useEffect, useState, useCallback } from 'react';
import { apiClient } from '@/lib/api-client';
import { orderWebSocket } from '@/lib/websocket-client';
import { Order, OrderEvent } from '@/types/order';

export const useOrders = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchOrders = useCallback(async (showLoading = false) => {
    if (showLoading) {
      setLoading(true);
    }
    
    try {
      setError(null);
      const { orders: ordersData } = await apiClient.getOrders();

      // Transform to match Order type
      const transformedOrders: Order[] = ordersData.map((order: any) => ({
        id: order.id,
        customerId: order.customerId,
        customerName: order.customerName,
        status: order.status as Order['status'],
        totalAmount: order.totalAmount,
        currentStage: order.currentStage as Order['currentStage'],
        createdAt: order.createdAt instanceof Date ? order.createdAt : new Date(order.createdAt),
        updatedAt: order.updatedAt instanceof Date ? order.updatedAt : new Date(order.updatedAt),
        items: (order.items || []).map((item: any) => ({
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity,
          price: item.price,
        })),
        events: (order.events || []).map((event: any) => ({
          id: event.id,
          eventType: event.eventType as OrderEvent['eventType'],
          timestamp: event.timestamp instanceof Date ? event.timestamp : new Date(event.timestamp),
          orderId: event.orderId,
          correlationId: event.correlationId,
          causationId: event.causationId,
          version: event.version,
          payload: event.payload || {},
          metadata: {
            service: event.metadata.service,
            retryCount: event.metadata.retryCount,
            error: event.metadata.error,
          },
        })).sort((a: OrderEvent, b: OrderEvent) => 
          a.timestamp.getTime() - b.timestamp.getTime()
        ),
      }));

      setOrders(transformedOrders);
    } catch (error) {
      console.error('Error fetching orders:', error);
      setError(error instanceof Error ? error : new Error('Unknown error'));
      // Don't clear orders on error - keep existing data
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders(true);

    // Subscribe to realtime updates with debouncing
    let timeoutId: ReturnType<typeof setTimeout>;
    
    const unsubscribeOrder = orderWebSocket.subscribe('order', (data) => {
      console.log('WebSocket order event received:', data);
      // Debounce rapid updates
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        fetchOrders(false);
      }, 300);
    });

    const unsubscribeEvent = orderWebSocket.subscribe('event', (data) => {
      console.log('WebSocket event received:', data);
      // Debounce rapid updates
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        fetchOrders(false);
      }, 300);
    });

    // Also set up polling as fallback (every 1.5 seconds)
    // This ensures we always see updates even if WebSocket fails
    const pollInterval = setInterval(() => {
      fetchOrders(false);
    }, 1500);

    return () => {
      clearTimeout(timeoutId);
      clearInterval(pollInterval);
      unsubscribeOrder();
      unsubscribeEvent();
    };
  }, [fetchOrders]);

  return { orders, loading, error, refetch: fetchOrders };
};
