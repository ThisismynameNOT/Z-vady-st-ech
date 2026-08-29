const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

export function isAllowedFormOrigin(origin, configuredSite) {
  if (!origin) return true;

  let candidate;
  let site;
  try {
    candidate = new URL(origin);
    site = new URL(configuredSite);
  } catch {
    return false;
  }

  if (candidate.origin === site.origin) return true;

  return candidate.protocol === 'http:' && LOCAL_HOSTS.has(candidate.hostname);
}
