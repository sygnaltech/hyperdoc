const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * Generate a 22-character base62 ID with 128 bits of entropy.
 */
export function generateId(): string {
  const bytes = randomBytes(16);
  return encodeBase62(bytes);
}

function randomBytes(n: number): Uint8Array {
  const bytes = new Uint8Array(n);
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    const nodeCrypto = require('crypto');
    const buf = nodeCrypto.randomBytes(n) as Buffer;
    for (let i = 0; i < n; i++) bytes[i] = buf[i];
  }
  return bytes;
}

function encodeBase62(bytes: Uint8Array): string {
  let big = 0n;
  for (const b of bytes) {
    big = (big << 8n) | BigInt(b);
  }
  const base = 62n;
  let out = '';
  while (big > 0n) {
    const rem = Number(big % base);
    out = ALPHABET[rem] + out;
    big = big / base;
  }
  while (out.length < 22) {
    out = ALPHABET[0] + out;
  }
  return out;
}

export function isValidId(s: unknown): s is string {
  return typeof s === 'string' && /^[0-9a-zA-Z]{22}$/.test(s);
}
