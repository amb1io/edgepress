/**
 * ESM shim for the `debug` package on Cloudflare Workers dev (workerd).
 * Resolves `debug/src/index.js` using `module.exports` / `require`, which breaks in the Vite module runner.
 */
function humanize(ms: number): string {
  return `${ms}ms`;
}

function createLogger(namespace: string) {
  const log = (..._args: unknown[]) => {};
  log.namespace = namespace;
  log.extend = (sub: string, delimiter?: string) =>
    createLogger(namespace + (delimiter ?? ":") + sub);
  log.destroy = () => {};
  Object.defineProperty(log, "enabled", {
    enumerable: true,
    configurable: true,
    get: () => false,
    set: () => {},
  });
  log.diff = 0;
  log.prev = 0;
  log.curr = 0;
  log.useColors = false;
  log.color = "";
  return log;
}

function createDebug(namespace: string) {
  return createLogger(namespace);
}

createDebug.debug = createDebug;
createDebug.default = createDebug;
createDebug.coerce = (val: unknown) => val;
createDebug.disable = () => {};
createDebug.enable = () => {};
createDebug.enabled = (_name: string) => false;
createDebug.humanize = humanize;
createDebug.destroy = () => {};
createDebug.names = [];
createDebug.skips = [];
createDebug.formatters = {} as Record<string, (v: unknown) => string>;
createDebug.selectColor = () => "";
createDebug.useColors = () => false;
createDebug.log = (..._args: unknown[]) => {};
createDebug.namespaces = "";

export default createDebug;
