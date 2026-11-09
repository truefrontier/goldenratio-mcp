// The rate-limit bucket for a client IP. Its own module so the tests can call it without starting the server.
import { isIPv6 } from 'node:net';

// One IPv6 client usually gets a whole /64, so it could step through addresses to reset its count.
// Bucket IPv6 by /64 and IPv4 by the full address. A dual-stack socket reports an IPv4 client as
// ::ffff:a.b.c.d, which sits in ::/64 with every other IPv4 client, so that form maps back to IPv4.
export function rateKey(ip: string) {
  const addr = ip.replace(/%.*$/, ''); // drop a zone id (fe80::1%en0)
  if (!isIPv6(addr)) return ip; // IPv4, or '?'
  const words = (part: string) =>
    part.split(':').filter(Boolean).flatMap((w) => {
      if (!w.includes('.')) return [parseInt(w, 16)];
      const [a, b, c, d] = w.split('.').map(Number); // an IPv4 tail is the last two words
      return [(a << 8) | b, (c << 8) | d];
    });
  const [head, tail = ''] = addr.split('::');
  const h = words(head), t = words(tail);
  const g = [...h, ...new Array<number>(8 - h.length - t.length).fill(0), ...t];
  if (g.slice(0, 5).every((w) => w === 0) && g[5] === 0xffff) return `${g[6] >> 8}.${g[6] & 255}.${g[7] >> 8}.${g[7] & 255}`;
  return `${g.slice(0, 4).map((w) => w.toString(16)).join(':')}::/64`;
}
