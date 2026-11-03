// Web Push (RFC 8291 / RFC 8292), using only Workers WebCrypto.
const utf8 = new TextEncoder()

export function decodeKey(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))
}

export function encodeKey(value: Uint8Array): string {
  return btoa(String.fromCharCode(...value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function concat(...values: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const result = new Uint8Array(values.reduce((n, value) => n + value.length, 0))
  let offset = 0
  for (const value of values) {
    result.set(value, offset)
    offset += value.length
  }
  return result
}

async function hkdf(key: Uint8Array<ArrayBuffer>, salt: Uint8Array<ArrayBuffer>, info: Uint8Array<ArrayBuffer>, bytes: number) {
  const imported = await crypto.subtle.importKey('raw', key, 'HKDF', false, ['deriveBits'])
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, imported, bytes * 8))
}

export async function importSubscriberKey(p256dh: string) {
  return crypto.subtle.importKey('raw', decodeKey(p256dh), { name: 'ECDH', namedCurve: 'P-256' }, false, [])
}

export async function encryptPayload(keys: { p256dh: string; auth: string }, payload: string) {
  const plaintext = utf8.encode(payload)
  // One record, comfortably within push services' 4096-byte body limit.
  if (plaintext.length > 3900) throw new Error('Push payload is too large')
  const recipient = await importSubscriberKey(keys.p256dh)
  const sender = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
  const publicKey = new Uint8Array(await crypto.subtle.exportKey('raw', sender.publicKey))
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: recipient }, sender.privateKey, 256))
  const ikm = await hkdf(shared, decodeKey(keys.auth), concat(utf8.encode('WebPush: info\0'), decodeKey(keys.p256dh), publicKey), 32)
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const cek = await hkdf(ikm, salt, utf8.encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(ikm, salt, utf8.encode('Content-Encoding: nonce\0'), 12)
  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt'])
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aes, concat(plaintext, new Uint8Array([2]))))
  const header = new Uint8Array(5)
  new DataView(header.buffer).setUint32(0, 4096)
  header[4] = publicKey.length
  return concat(salt, header, publicKey, encrypted)
}

export type VapidConfig = { publicKey: string; privateKey: string; subject: string }

export async function vapidAuthorization(endpoint: string, config: VapidConfig) {
  const publicKey = decodeKey(config.publicKey)
  const privateKey = decodeKey(config.privateKey)
  if (publicKey.length !== 65 || publicKey[0] !== 4 || privateKey.length !== 32) throw new Error('Invalid VAPID keys')
  const subject = new URL(config.subject)
  if (!['mailto:', 'https:'].includes(subject.protocol)) throw new Error('Invalid VAPID subject')
  const key = await crypto.subtle.importKey('jwk', {
    kty: 'EC', crv: 'P-256', x: encodeKey(publicKey.slice(1, 33)), y: encodeKey(publicKey.slice(33)), d: config.privateKey,
  }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  const header = encodeKey(utf8.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const claims = encodeKey(utf8.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60, sub: config.subject })))
  const unsigned = `${header}.${claims}`
  const signature = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, utf8.encode(unsigned)))
  return `vapid t=${unsigned}.${encodeKey(signature)}, k=${config.publicKey}`
}
