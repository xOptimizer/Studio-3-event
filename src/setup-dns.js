import dotenv from 'dotenv';
dotenv.config({ override: true });

import dns from 'node:dns';

// Supabase pooler resolves to IPv6 first; many networks can't route it.
dns.setDefaultResultOrder('ipv4first');
