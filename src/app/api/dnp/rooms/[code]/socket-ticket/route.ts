import { bearerToken, checkDnpRateLimit, dnpService, handleDnpError, jsonNoStore } from '../../../_helpers';
import { issueDnpSocketTicket } from '@/lib/dnp/socket-ticket';

function configuredSocketBase(value: string) {
  const url = new URL(value);
  if (url.protocol !== 'wss:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('DNP_WS_PUBLIC_URL must be an origin-only wss:// URL.');
  }
  return url.origin;
}

export async function POST(request: Request, context: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await context.params;
    const token = bearerToken(request);
    checkDnpRateLimit(request, token);
    const identity = await dnpService().authenticatePlayer(code, token);
    const secret = process.env.DNP_WS_TICKET_SECRET;
    const publicUrl = process.env.DNP_WS_PUBLIC_URL;
    if (!secret || !publicUrl) return jsonNoStore({ available: false, reason: 'not_configured', retryable: false });
    const base = configuredSocketBase(publicUrl);
    return jsonNoStore({ available: true, url: `${base}/rooms/${identity.roomCode}`, ticket: issueDnpSocketTicket(identity, secret), expiresInMs: 30_000 });
  } catch (error) {
    return handleDnpError(error);
  }
}
