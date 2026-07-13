import { checkDnpRateLimit, dnpService, handleDnpError, jsonNoStore, readJson } from '../_helpers';

export async function POST(request: Request) {
  try {
    const body = await readJson(request);
    checkDnpRateLimit(request, body.name);
    return jsonNoStore(await dnpService().createRoom(body.name, 'private'), 201);
  } catch (error) {
    return handleDnpError(error);
  }
}
