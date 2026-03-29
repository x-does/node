export const NO_STORE_CACHE_CONTROL =
  'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0';

export function withNoStoreHeaders(response) {
  response.headers.set('Cache-Control', NO_STORE_CACHE_CONTROL);
  response.headers.set('Pragma', 'no-cache');
  response.headers.set('Expires', '0');
  return response;
}
