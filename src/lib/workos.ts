import { WorkOS } from '@workos-inc/node';
import { getWorkosApiKey, getWorkosClientId } from './env';

let _workos: WorkOS | null = null;

export function getWorkOS(): WorkOS {
  if (!_workos) {
    const apiKey = getWorkosApiKey();
    const clientId = getWorkosClientId();

    if (!apiKey || !clientId) {
      throw new Error('WorkOS missing required env: WORKOS_API_KEY / WORKOS_CLIENT_ID');
    }

    _workos = new WorkOS(apiKey, {
      clientId,
    });
  }

  return _workos;
}
