const IP_RATE_LIMITS = new Map<string, {count: number; resetAt: number}>();
const RATE_LIMIT = 100; // requests per hour
const WINDOW = 60 * 60 * 1000; // 1 hour

export async function checkIPRateLimit(ip: string): Promise<boolean> {
  const now = Date.now();
  const record = IP_RATE_LIMITS.get(ip);

  if (!record || now > record.resetAt) {
    IP_RATE_LIMITS.set(ip, {count: 1, resetAt: now + WINDOW});
    return true;
  }

  if (record.count >= RATE_LIMIT) {
    return false;
  }

  record.count++;
  return true;
}

export function getClientIP(req: any): string {
  return req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
         req.headers["x-real-ip"] ||
         req.connection?.remoteAddress ||
         req.socket?.remoteAddress ||
         "unknown";
}
