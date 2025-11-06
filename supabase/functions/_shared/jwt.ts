// JWT authentication utilities for Supabase Edge Functions
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export interface JWTPayload {
  sub: string;
  role?: string;
  email?: string;
  [key: string]: any;
}

export async function verifyJWT(
  authHeader: string | null,
  supabaseUrl: string,
  supabaseKey: string
): Promise<{ valid: boolean; payload?: JWTPayload; error?: string }> {
  if (!authHeader) {
    return { valid: false, error: 'Missing Authorization header' };
  }

  const token = authHeader.replace('Bearer ', '');
  if (!token) {
    return { valid: false, error: 'Invalid token format' };
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return { valid: false, error: error?.message || 'Invalid token' };
    }

    return {
      valid: true,
      payload: {
        sub: user.id,
        email: user.email,
        role: user.role,
      },
    };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Token verification failed',
    };
  }
}

export function requireAuth(
  request: Request,
  supabaseUrl: string,
  supabaseKey: string
): Promise<JWTPayload> {
  return new Promise(async (resolve, reject) => {
    const authHeader = request.headers.get('Authorization');
    const result = await verifyJWT(authHeader, supabaseUrl, supabaseKey);

    if (!result.valid) {
      reject(new Error(result.error || 'Unauthorized'));
    } else {
      resolve(result.payload!);
    }
  });
}


