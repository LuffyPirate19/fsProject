-- Create orders table
CREATE TABLE public.orders (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  total_amount DECIMAL(10, 2) NOT NULL,
  current_stage TEXT NOT NULL CHECK (current_stage IN ('order', 'inventory', 'payment', 'shipping', 'completed')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Create order_items table
CREATE TABLE public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id TEXT NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  price DECIMAL(10, 2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create order_events table (event sourcing)
CREATE TABLE public.order_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  order_id TEXT NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  correlation_id TEXT NOT NULL,
  causation_id TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  service TEXT NOT NULL,
  retry_count INTEGER DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create idempotency_keys table
CREATE TABLE public.idempotency_keys (
  key TEXT PRIMARY KEY,
  event_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

-- Create dead_letter_queue table
CREATE TABLE public.dead_letter_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_data JSONB NOT NULL,
  error_message TEXT NOT NULL,
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3,
  status TEXT NOT NULL CHECK (status IN ('pending', 'retrying', 'failed', 'resolved')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create indexes
CREATE INDEX idx_orders_status ON public.orders(status);
CREATE INDEX idx_orders_created_at ON public.orders(created_at DESC);
CREATE INDEX idx_order_events_order_id ON public.order_events(order_id);
CREATE INDEX idx_order_events_created_at ON public.order_events(created_at DESC);
CREATE INDEX idx_order_events_event_type ON public.order_events(event_type);
CREATE INDEX idx_order_items_order_id ON public.order_items(order_id);
CREATE INDEX idx_dlq_status ON public.dead_letter_queue(status);
CREATE INDEX idx_idempotency_expires ON public.idempotency_keys(expires_at);

-- Enable Row Level Security (public access for demo)
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dead_letter_queue ENABLE ROW LEVEL SECURITY;

-- Public read access for orders (demo purposes)
CREATE POLICY "Anyone can view orders"
  ON public.orders FOR SELECT
  USING (true);

CREATE POLICY "Anyone can view order items"
  ON public.order_items FOR SELECT
  USING (true);

CREATE POLICY "Anyone can view order events"
  ON public.order_events FOR SELECT
  USING (true);

CREATE POLICY "Anyone can view DLQ"
  ON public.dead_letter_queue FOR SELECT
  USING (true);

-- Service role can manage all tables
CREATE POLICY "Service role can manage orders"
  ON public.orders FOR ALL
  USING (true);

CREATE POLICY "Service role can manage order items"
  ON public.order_items FOR ALL
  USING (true);

CREATE POLICY "Service role can manage order events"
  ON public.order_events FOR ALL
  USING (true);

CREATE POLICY "Service role can manage idempotency"
  ON public.idempotency_keys FOR ALL
  USING (true);

CREATE POLICY "Service role can manage DLQ"
  ON public.dead_letter_queue FOR ALL
  USING (true);

-- Update trigger for orders
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_dlq_updated_at
  BEFORE UPDATE ON public.dead_letter_queue
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for orders and events
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.order_events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.dead_letter_queue;

-- Function to clean up expired idempotency keys
CREATE OR REPLACE FUNCTION public.cleanup_expired_idempotency_keys()
RETURNS void AS $$
BEGIN
  DELETE FROM public.idempotency_keys WHERE expires_at < now();
END;
$$ LANGUAGE plpgsql;

-- Insert seed data
INSERT INTO public.orders (id, customer_id, customer_name, status, total_amount, current_stage)
VALUES
  ('ORD-2025-001', 'cust_001', 'Alice Johnson', 'completed', 198.95, 'completed'),
  ('ORD-2025-002', 'cust_002', 'Bob Smith', 'processing', 59.99, 'payment'),
  ('ORD-2025-003', 'cust_003', 'Carol Davis', 'failed', 149.99, 'payment');

INSERT INTO public.order_items (order_id, product_id, product_name, quantity, price)
VALUES
  ('ORD-2025-001', 'prod_101', 'Wireless Headphones', 2, 79.99),
  ('ORD-2025-001', 'prod_102', 'USB-C Cable', 3, 12.99),
  ('ORD-2025-002', 'prod_201', 'Gaming Mouse', 1, 59.99),
  ('ORD-2025-003', 'prod_301', 'Mechanical Keyboard', 1, 149.99);

INSERT INTO public.order_events (event_type, order_id, correlation_id, service)
VALUES
  ('OrderCreated', 'ORD-2025-001', 'corr_ORD-2025-001', 'order-service'),
  ('InventoryReserved', 'ORD-2025-001', 'corr_ORD-2025-001', 'inventory-service'),
  ('PaymentAuthorized', 'ORD-2025-001', 'corr_ORD-2025-001', 'payment-service'),
  ('OrderShipped', 'ORD-2025-001', 'corr_ORD-2025-001', 'shipping-service'),
  ('OrderCreated', 'ORD-2025-002', 'corr_ORD-2025-002', 'order-service'),
  ('InventoryReserved', 'ORD-2025-002', 'corr_ORD-2025-002', 'inventory-service'),
  ('PaymentAuthorized', 'ORD-2025-002', 'corr_ORD-2025-002', 'payment-service'),
  ('OrderCreated', 'ORD-2025-003', 'corr_ORD-2025-003', 'order-service'),
  ('InventoryReserved', 'ORD-2025-003', 'corr_ORD-2025-003', 'inventory-service'),
  ('PaymentFailed', 'ORD-2025-003', 'corr_ORD-2025-003', 'payment-service');