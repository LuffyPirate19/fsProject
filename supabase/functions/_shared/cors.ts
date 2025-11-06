// CORS headers utility

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
};

export function corsResponse(): Response {
  return new Response(null, { headers: corsHeaders });
}

export function jsonResponse(data: any, status: number = 200): Response {
  return new Response(
    JSON.stringify(data),
    {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status,
    }
  );
}

export function errorResponse(message: string, status: number = 500, details?: any): Response {
  return jsonResponse(
    {
      error: message,
      ...(details && { details }),
      timestamp: new Date().toISOString(),
    },
    status
  );
}


