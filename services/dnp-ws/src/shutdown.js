export function installGracefulShutdown({ app, processRef = process, timeoutMs = 10000, logger = console }) {
  let started = false;
  let done;
  const shutdown = () => {
    if (started) return done;
    started = true;
    done = new Promise(resolve => {
      let settled = false;
      const finish = (ok, message) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (message) logger.error(message);
        processRef.exitCode = ok ? 0 : 1;
        resolve(ok);
      };
      const timer = setTimeout(() => {
        finish(false, 'dnp-ws graceful shutdown timed out');
        processRef.exit?.(1);
      }, timeoutMs);
      let closing;
      try { closing = app.close(); } catch { closing = Promise.reject(); }
      Promise.resolve(closing).then(
        () => finish(true),
        () => finish(false, 'dnp-ws graceful shutdown failed'),
      );
    });
    return done;
  };
  processRef.on('SIGTERM', shutdown);
  processRef.on('SIGINT', shutdown);
  return {
    shutdown,
    get done() { return done; },
    dispose() { processRef.off('SIGTERM', shutdown); processRef.off('SIGINT', shutdown); },
  };
}