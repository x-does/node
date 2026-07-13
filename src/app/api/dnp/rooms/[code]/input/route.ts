import { checkDnpRateLimit, dnpService, handleDnpError, jsonNoStore, readJson } from '../../../_helpers';

export async function POST(request: Request, context: { params: Promise<{ code: string }> }) {
  try {
    const [{ code }, body] = await Promise.all([context.params, readJson(request)]);
    checkDnpRateLimit(request, body.token);
    return jsonNoStore(await dnpService().submitInput(code, body.token, body.position, body.seq));
  } catch (error) {
    return handleDnpError(error);
  }
}
