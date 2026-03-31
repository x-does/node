import crypto from 'crypto';
import { headers } from 'next/headers';

export async function getClientInfo() {
  const headerList = await headers();
  const forwarded = headerList.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() || headerList.get('x-real-ip') || 'unknown';
  const userAgent = headerList.get('user-agent') || undefined;
  const ipHash = crypto.createHash('sha256').update(ip).digest('hex');

  return { userAgent, ipHash, ip };
}
