import { checkDnpRateLimit, dnpService, handleDnpError, jsonNoStore, readJson } from '../../../_helpers';

export async function POST(request: Request, context: { params: Promise<{ code: string }> }) {
  try {
    const [{ code }, body] = await Promise.all([context.params, readJson(request)]);
    checkDnpRateLimit(request, body.token ?? `${code}:${String(body.name ?? '')}`);
    return jsonNoStore(await dnpService().joinRoom(code, body.name, body.token));
  } catch (error) {
    return handleDnpError(error);
  }
}
