import { createHash } from 'crypto'
import { sha256Hex, tokenFingerprint } from './token-fingerprint'

test('sha256Hex matches the standard test vectors and Node crypto', () => {
  expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
  expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  expect(sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'))
    .toBe('248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1')
  for (const text of ['a'.repeat(55), 'a'.repeat(56), 'a'.repeat(64), 'a'.repeat(1000), 'Zoë 🔑 ключ', 'token-a']) {
    expect(sha256Hex(text)).toBe(createHash('sha256').update(text, 'utf8').digest('hex'))
  }
})

test('the fingerprint is a short SHA-256 prefix that never equals the token', () => {
  for (const token of ['token-a', 'Rk9vQmFyQmF6UXV4', 'ba7816bf8f01cfea', '0123456789abcdef', '']) {
    const fingerprint = tokenFingerprint(token)
    expect(fingerprint).toMatch(/^[0-9a-f]{16}$/)
    expect(fingerprint).toBe(sha256Hex(token).slice(0, 16))
    expect(fingerprint).not.toBe(token)
    if (token) expect(fingerprint).not.toContain(token)
  }
  expect(tokenFingerprint('token-a')).not.toBe(tokenFingerprint('token-b'))
})
