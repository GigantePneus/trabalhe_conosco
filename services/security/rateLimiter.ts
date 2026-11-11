import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds?: number;
  serviceUnavailable?: boolean;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

/**
 * Rate Limiter em memória para fallback ou testes locais rápidos.
 */
export class MemoryRateLimiter {
  private requests = new Map<string, RateLimitEntry>();
  private readonly maxRequests: number;
  private readonly windowMs: number;

  constructor(maxRequests = 15, windowMs = 60 * 1000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  isAllowed(ip: string): RateLimitResult {
    const now = Date.now();
    const entry = this.requests.get(ip);

    if (!entry || now > entry.resetAt) {
      this.requests.set(ip, {
        count: 1,
        resetAt: now + this.windowMs
      });
      return { allowed: true, remaining: this.maxRequests - 1 };
    }

    if (entry.count >= this.maxRequests) {
      const retryAfterSeconds = Math.ceil((entry.resetAt - now) / 1000);
      return { allowed: false, remaining: 0, retryAfterSeconds };
    }

    entry.count += 1;
    return { allowed: true, remaining: this.maxRequests - entry.count };
  }

  reset(ip: string) {
    this.requests.delete(ip);
  }

  clear() {
    this.requests.clear();
  }
}

export const candidaturasRateLimiter = new MemoryRateLimiter(15, 60 * 1000);

let adminClientCached: SupabaseClient | null = null;

function getSupabaseClient(): SupabaseClient | null {
  if (adminClientCached) return adminClientCached;
  const supaUrl = process.env.SUPABASE_INTERNAL_URL || process.env.VITE_SUPABASE_URL;
  const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (supaUrl && supaKey) {
    adminClientCached = createClient(supaUrl, supaKey, {
      auth: { persistSession: false }
    });
    return adminClientCached;
  }
  return null;
}

/**
 * Rate Limiter Distribuído para ambientes Serverless (Vercel / AWS Lambda).
 * Utiliza PostgreSQL atômico com RPC check_rate_limit na tabela public.rate_limits.
 * Em caso de falha de conexão com o banco, faz fallback automático para o RateLimiter em memória.
 */
export async function checkDistributedRateLimit(
  key: string,
  maxRequests = 15,
  windowSeconds = 60,
  clientOverride?: SupabaseClient | null
): Promise<RateLimitResult> {
  const supa = clientOverride || getSupabaseClient();
  const isProd = process.env.NODE_ENV === 'production' || !!process.env.VERCEL;

  if (supa) {
    try {
      const { data, error } = await supa.rpc('check_rate_limit', {
        p_key: key,
        p_max_requests: maxRequests,
        p_window_seconds: windowSeconds
      });

      if (!error && data && typeof data.allowed === 'boolean') {
        return {
          allowed: data.allowed,
          remaining: Number(data.remaining) || 0,
          retryAfterSeconds: data.allowed ? 0 : Number(data.retryAfterSeconds) || windowSeconds
        };
      }

      console.error('[RateLimiter] Erro na RPC check_rate_limit:', error?.message);
    } catch (err: any) {
      console.error('[RateLimiter] Exceção na chamada de rate limit:', err?.message);
    }
  } else {
    console.warn('[RateLimiter] Supabase Client indisponível para rate limiting.');
  }

  // Comportamento FAIL-CLOSED em produção: se a infraestrutura distribuída falhar, rejeita com 503 e Retry-After
  if (isProd) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 30,
      serviceUnavailable: true
    };
  }

  // Fallback em memória exclusivo para testes e desenvolvimento local offline
  return candidaturasRateLimiter.isAllowed(key);
}
