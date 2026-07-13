import { bearerToken, checkDnpRateLimit, dnpService, handleDnpError, jsonNoStore, readJson } from '../../_helpers';

export async function GET(request: Request, context: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await context.params;
    const token = bearerToken(request);
    checkDnpRateLimit(request, token);
    return jsonNoStore(await dnpService().pollRoom(code, token));
  } catch (error) {
    return handleDnpError(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ code: string }> }) {
  try {
    const [{ code }, body] = await Promise.all([context.params, readJson(request)]);
    const token = body.token ?? bearerToken(request);
    checkDnpRateLimit(request, token);
    return jsonNoStore(await dnpService().pollRoom(code, token));
  } catch (error) {
    return handleDnpError(error);
  }
}
