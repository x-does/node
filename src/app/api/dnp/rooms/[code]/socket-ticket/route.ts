import { bearerToken, checkDnpRateLimit, dnpService, handleDnpError, jsonNoStore } from '../../../_helpers';
import { issueDnpSocketTicket } from '@/lib/dnp/socket-ticket';
import { DnpServiceError } from '@/lib/dnp/service';

export async function POST(request: Request, context: { params: Promise<{ code: string }> }) {
  try {
    const secret = process.env.DNP_WS_TICKET_SECRET;
    const publicUrl = process.env.DNP_WS_PUBLIC_URL;
    if (!secret || !publicUrl) throw new DnpServiceError(503, 'DNP realtime is not configured; using HTTP fallback.');
    const { code } = await context.params;
    const token = bearerToken(request);
    checkDnpRateLimit(request, token);
    const identity = await dnpService().authenticatePlayer(code, token);
    const base = publicUrl.replace(/\/$/, '');
    return jsonNoStore({ url: `${base}/rooms/${identity.roomCode}`, ticket: issueDnpSocketTicket(identity, secret), expiresInMs: 30_000 });
  } catch (error) {
    return handleDnpError(error);
  }
}
