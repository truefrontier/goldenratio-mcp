// rateKey: which rate-limit bucket a client IP lands in. IPv6 by /64, IPv4 by the full address.
// Run after `npm run build`: imports the compiled dist/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rateKey } from '../dist/ratekey.js';

test('IPv6 addresses in one /64 share a key, however they are written', () => {
  for (const ip of ['2001:db8:1:2::1', '2001:db8:1:2:ffff:ffff:ffff:ffff', '2001:0DB8:0001:0002::3', '2001:db8:1:2:0:0:0:9']) {
    assert.equal(rateKey(ip), '2001:db8:1:2::/64', ip);
  }
  assert.equal(rateKey('2001:db8:1:3::1'), '2001:db8:1:3::/64', 'the next /64 over is its own bucket');
});

test('IPv6 edge forms', () => {
  const cases = [
    ['::1', '0:0:0:0::/64'], // loopback
    ['::', '0:0:0:0::/64'],
    ['2001:db8::', '2001:db8:0:0::/64'],
    ['fe80::1%en0', 'fe80:0:0:0::/64'], // zone id dropped
    ['64:ff9b::198.51.100.1', '64:ff9b:0:0::/64'], // NAT64: an IPv4 tail, but not the ::ffff: form
    ['1::2:3:4:5:1.2.3.4', '1:0:2:3::/64'], // an IPv4 tail after a short head fills the last two words
  ];
  for (const [ip, key] of cases) assert.equal(rateKey(ip), key, ip);
});

test('an IPv4 client reported as ::ffff:a.b.c.d keys as plain IPv4', () => {
  for (const ip of ['::ffff:198.51.100.7', '::FFFF:198.51.100.7', '::ffff:c633:6407', '0:0:0:0:0:ffff:198.51.100.7', '::ffff:198.51.100.7%en0']) {
    assert.equal(rateKey(ip), '198.51.100.7', ip);
  }
  // Two IPv4 clients never share a bucket, though both forms sit in ::/64.
  assert.equal(rateKey('::ffff:198.51.100.8'), '198.51.100.8');
});

test('anything that is not IPv6 passes through unchanged', () => {
  for (const ip of ['198.51.100.7', '?', 'not an ip', '2001:db8::1::2', '']) assert.equal(rateKey(ip), ip, JSON.stringify(ip));
});
