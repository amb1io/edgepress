export function normalizeTemplateKey(path: string): string {
  let key = path.trim().replace(/^\/+/, "");
  if (key.startsWith("templates/")) {
    key = key.slice("templates/".length);
  }
  if (key.endsWith(".liquid")) {
    key = key.slice(0, -".liquid".length);
  }
  return key;
}
