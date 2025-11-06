import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CUSTOMER_NAMES = [
  'John Doe', 'Jane Smith', 'Bob Johnson', 'Alice Williams', 'Charlie Brown',
  'Diana Prince', 'Eve Adams', 'Frank Castle', 'Grace Lee', 'Henry Ford'
];

const PRODUCTS = [
  { id: 'prod_101', name: 'Wireless Headphones', price: 79.99 },
  { id: 'prod_102', name: 'USB-C Cable', price: 12.99 },
  { id: 'prod_103', name: 'Gaming Mouse', price: 59.99 },
  { id: 'prod_104', name: 'Mechanical Keyboard', price: 149.99 },
  { id: 'prod_105', name: 'Monitor Stand', price: 34.99 },
  { id: 'prod_106', name: 'Laptop Bag', price: 44.99 },
  { id: 'prod_107', name: 'Webcam HD', price: 89.99 },
  { id: 'prod_108', name: 'Desk Lamp', price: 24.99 },
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const { count = 5, delayMs = 1000 } = await req.json();

    console.log(`Generating ${count} synthetic orders with ${delayMs}ms delay`);

    const results = [];

    for (let i = 0; i < count; i++) {
      // Random customer
      const customerName = CUSTOMER_NAMES[Math.floor(Math.random() * CUSTOMER_NAMES.length)];

      // Random 1-3 products
      const itemCount = Math.floor(Math.random() * 3) + 1;
      const items = [];
      for (let j = 0; j < itemCount; j++) {
        const product = PRODUCTS[Math.floor(Math.random() * PRODUCTS.length)];
        items.push({
          productId: product.id,
          productName: product.name,
          quantity: Math.floor(Math.random() * 3) + 1,
          price: product.price,
        });
      }

      // Create order via API
      try {
        const response = await fetch(`${supabaseUrl}/functions/v1/create-order`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ customerName, items }),
        });

        const result = await response.json();
        results.push(result);
        console.log(`Created order ${i + 1}/${count}: ${result.orderId}`);

      } catch (error) {
        console.error(`Error creating order ${i + 1}:`, error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        results.push({ error: errorMessage });
      }

      // Delay between orders
      if (i < count - 1 && delayMs > 0) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }

    return new Response(
      JSON.stringify({ 
        generated: count, 
        results,
        message: `Successfully generated ${results.filter(r => !r.error).length} orders`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in load generator:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});