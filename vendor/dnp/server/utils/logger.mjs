export const logger = {
  info: (...args) => console.log('[dnp]', ...args),
  warn: (...args) => console.warn('[dnp]', ...args),
  error: (...args) => console.error('[dnp]', ...args),
};
