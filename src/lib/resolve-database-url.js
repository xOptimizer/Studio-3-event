import dns from 'node:dns/promises';

export async function resolveDatabaseUrl(url) {
  if (!url) {
    return url;
  }

  const normalized = url.replace(/^postgres:\/\//, 'postgresql://');
  let parsed;

  try {
    parsed = new URL(normalized);
  } catch {
    return url;
  }

  const { hostname } = parsed;
  if (!hostname || /^\d+\.\d+\.\d+\.\d+$/.test(hostname) || hostname === 'localhost') {
    return url;
  }

  try {
    const { address } = await dns.lookup(hostname, { family: 4 });
    parsed.hostname = address;
    return parsed.toString().replace(/^postgresql:\/\//, 'postgres://');
  } catch (error) {
    console.warn('[db] Could not resolve IPv4 for', hostname, '- using original host');
    return url;
  }
}
