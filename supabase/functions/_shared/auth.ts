// Authentication middleware for Supabase Edge Functions
import { verifyJWT, JWTPayload } from './jwt.ts';
import { corsResponse, errorResponse } from './cors.ts';

export interface AuthRequest extends Request {
  user?: JWTPayload;
}

/**
 * Middleware to require authentication for an endpoint
 * Returns the user payload if authenticated, or an error response if not
 */
export async function requireAuth(
  req: Request,
  supabaseUrl: string,
  supabaseKey: string
): Promise<{ user: JWTPayload } | Response> {
  // Skip auth for OPTIONS requests
  if (req.method === 'OPTIONS') {
    return { user: { sub: 'anonymous' } as JWTPayload };
  }

  const authHeader = req.headers.get('Authorization');
  const result = await verifyJWT(authHeader, supabaseUrl, supabaseKey);

  if (!result.valid) {
    return errorResponse(
      result.error || 'Unauthorized',
      401
    );
  }

  return { user: result.payload! };
}

/**
 * Middleware to optionally authenticate (doesn't fail if no token)
 */
export async function optionalAuth(
  req: Request,
  supabaseUrl: string,
  supabaseKey: string
): Promise<{ user?: JWTPayload }> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return {};
  }

  const result = await verifyJWT(authHeader, supabaseUrl, supabaseKey);
  if (result.valid) {
    return { user: result.payload };
  }

  return {};
}


