import { corsResponse, jsonResponse } from '../_shared/cors.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getMetrics, getAllMetrics } from '../_shared/metrics.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return corsResponse();
  }

  const url = new URL(req.url);
  const path = url.pathname.split('/').pop();
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // General health check
  if (path === 'health' || path === '') {
    const checks = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        database: await checkDatabase(supabaseUrl, supabaseKey),
        functions: {
          'create-order': 'operational',
          'process-inventory': 'operational',
          'process-payment': 'operational',
          'process-shipping': 'operational',
          'retry-failed-order': 'operational',
        },
      },
    };

    const allHealthy = checks.services.database.status === 'healthy';
    return jsonResponse(checks, allHealthy ? 200 : 503);
  }

  // Metrics endpoint
  if (path === 'metrics') {
    const service = url.searchParams.get('service');
    const metrics = service ? getMetrics(service) : getAllMetrics();
    
    if (!metrics) {
      return jsonResponse({ error: 'Service not found' }, 404);
    }

    return jsonResponse(metrics);
  }

  // Readiness check
  if (path === 'ready') {
    const dbHealthy = await checkDatabase(supabaseUrl, supabaseKey);
    return jsonResponse(
      { ready: dbHealthy.status === 'healthy' },
      dbHealthy.status === 'healthy' ? 200 : 503
    );
  }

  // Liveness check
  if (path === 'live') {
    return jsonResponse({ alive: true });
  }

  return jsonResponse({ error: 'Not found' }, 404);
});

async function checkDatabase(supabaseUrl: string, supabaseKey: string) {
  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { error } = await supabase.from('orders').select('id').limit(1);
    
    return {
      status: error ? 'unhealthy' : 'healthy',
      message: error ? error.message : 'Connected',
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    };
  }
}


