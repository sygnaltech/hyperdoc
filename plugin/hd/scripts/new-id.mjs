#!/usr/bin/env node
/**
 * Generate one or more 22-character base62 HD document IDs.
 * Matches the algorithm used by the VS Code editor (src/identity/base62.ts):
 * 128 bits of entropy from crypto.randomBytes, encoded in base62.
 *
 *   node new-id.mjs        # one id
 *   node new-id.mjs 5      # five ids, one per line
 */
import { randomBytes } from 'node:crypto'

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'

function generateId() {
  const bytes = randomBytes(16)
  let big = 0n
  for (const b of bytes) big = (big << 8n) | BigInt(b)
  let out = ''
  while (big > 0n) {
    out = ALPHABET[Number(big % 62n)] + out
    big = big / 62n
  }
  while (out.length < 22) out = ALPHABET[0] + out
  return out
}

const count = Math.max(1, parseInt(process.argv[2] ?? '1', 10) || 1)
for (let i = 0; i < count; i++) console.log(generateId())
