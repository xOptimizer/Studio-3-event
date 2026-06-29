import dns from 'node:dns/promises';

function normalizePostgresUrl(url) {
  return url.replace(/^postgres:\/\//, 'postgresql://');
}

function isSupabasePoolerHost(hostname) {
  return hostname.endsWith('.pooler.supabase.com');
}

function isSupabaseDirectHost(hostname) {
  return hostname.endsWith('.supabase.co') && hostname.startsWith('db.');
}

function ensurePoolerParams(url) {
  const normalized = normalizePostgresUrl(url);
  let parsed;

  try {
    parsed = new URL(normalized);
  } catch {
    return url;
  }

  if (isSupabasePoolerHost(parsed.hostname)) {
    if (!parsed.searchParams.has('pgbouncer')) {
      parsed.searchParams.set('pgbouncer', 'true');
    }

    if (parsed.port === '6543') {
      console.warn(
        '[db] DATABASE_URL uses Supabase transaction pooler (port 6543). ' +
          'Checkout requires session pooler on port 5432.'
      );
    }
  }

  return parsed.toString().replace(/^postgresql:\/\//, 'postgres://');
}

export async function resolveDatabaseUrl(url) {
  if (!url) {
    return url;
  }

  const withPoolerParams = ensurePoolerParams(url);
  const normalized = normalizePostgresUrl(withPoolerParams);
  let parsed;

  try {
    parsed = new URL(normalized);
  } catch {
    return withPoolerParams;
  }

  const { hostname } = parsed;
  if (!hostname || /^\d+\.\d+\.\d+\.\d+$/.test(hostname) || hostname === 'localhost') {
    return withPoolerParams;
  }

  // Keep pooler hostnames intact — Supabase routes by hostname and Prisma
  // interactive transactions need a stable session-scoped connection.
  if (isSupabasePoolerHost(hostname)) {
    return withPoolerParams;
  }

  // Direct db.*.supabase.co hosts are IPv6-only on some networks (e.g. local dev).
  if (!isSupabaseDirectHost(hostname)) {
    return withPoolerParams;
  }

  try {
    const { address } = await dns.lookup(hostname, { family: 4 });
    parsed.hostname = address;
    return parsed.toString().replace(/^postgresql:\/\//, 'postgres://');
  } catch (error) {
    console.warn('[db] Could not resolve IPv4 for', hostname, '- using original host');
    return withPoolerParams;
  }
}
