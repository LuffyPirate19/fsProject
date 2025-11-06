import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
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
      const { data: ordersData, error: ordersError } = await supabase
        .from('orders')
        .select('*, order_items(*), order_events(*)')
        .order('created_at', { ascending: false });

      if (ordersError) throw ordersError;

      const transformedOrders: Order[] = ordersData.map((order: any) => ({
        id: order.id,
        customerId: order.customer_id,
        customerName: order.customer_name,
        status: order.status as Order['status'],
        totalAmount: parseFloat(order.total_amount),
        currentStage: order.current_stage as Order['currentStage'],
        createdAt: new Date(order.created_at),
        updatedAt: new Date(order.updated_at),
        items: (order.order_items || []).map((item: any) => ({
          productId: item.product_id,
          productName: item.product_name,
          quantity: item.quantity,
          price: parseFloat(item.price),
        })),
        events: (order.order_events || []).map((event: any) => ({
          id: event.id,
          eventType: event.event_type as OrderEvent['eventType'],
          timestamp: new Date(event.created_at),
          orderId: event.order_id,
          correlationId: event.correlation_id,
          causationId: event.causation_id,
          version: event.version,
          payload: event.payload || {},
          metadata: {
            service: event.service,
            retryCount: event.retry_count,
            error: event.error_message,
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
    const ordersChannel = supabase
      .channel('orders-changes')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'orders' },
        () => {
          // Debounce rapid updates
          clearTimeout(timeoutId);
          timeoutId = setTimeout(() => {
            fetchOrders(false);
          }, 300);
        }
      )
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'order_events' },
        () => {
          // Debounce rapid updates
          clearTimeout(timeoutId);
          timeoutId = setTimeout(() => {
            fetchOrders(false);
          }, 300);
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('Subscribed to order updates');
        }
      });

    return () => {
      clearTimeout(timeoutId);
      supabase.removeChannel(ordersChannel);
    };
  }, [fetchOrders]);

  return { orders, loading, error, refetch: fetchOrders };
};
