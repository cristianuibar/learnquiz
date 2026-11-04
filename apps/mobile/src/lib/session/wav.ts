import { MAX_VOICE_BYTES, MAX_VOICE_SECONDS, VOICE_SAMPLE_RATE } from '@learnquiz/api/voice'

// The upload contract of POST /sessions/:id/transcribe: a canonical PCM WAV,
// mono, 16-bit, 24 kHz, at most MAX_VOICE_SECONDS. The checks mirror the
// server's validateVoiceWav byte for byte, so a file that passes here is not
// refused there.

export const WAV_HEADER_BYTES = 44
export const MAX_VOICE_SAMPLES = VOICE_SAMPLE_RATE * MAX_VOICE_SECONDS

export type PcmChunk = {
  data: ArrayBuffer // little-endian int16, interleaved when channels > 1
  sampleRate: number
  channels: number
}

export function isCanonicalVoiceWav(bytes: Uint8Array): boolean {
  if (bytes.byteLength <= WAV_HEADER_BYTES || bytes.byteLength > MAX_VOICE_BYTES) return false
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const text = (at: number, length: number) => String.fromCharCode(...bytes.subarray(at, at + length))
  return text(0, 4) === 'RIFF' && text(8, 8) === 'WAVEfmt ' && text(36, 4) === 'data' &&
    view.getUint32(4, true) === bytes.byteLength - 8 && view.getUint32(16, true) === 16 &&
    view.getUint16(20, true) === 1 && view.getUint16(22, true) === 1 &&
    view.getUint32(24, true) === VOICE_SAMPLE_RATE && view.getUint32(28, true) === VOICE_SAMPLE_RATE * 2 &&
    view.getUint16(32, true) === 2 && view.getUint16(34, true) === 16 &&
    view.getUint32(40, true) === bytes.byteLength - WAV_HEADER_BYTES && (bytes.byteLength - WAV_HEADER_BYTES) % 2 === 0
}

// Writes the 44-byte header in front of mono 24 kHz int16 samples.
export function wavFromSamples(samples: Int16Array): Uint8Array {
  const bytes = new Uint8Array(WAV_HEADER_BYTES + samples.length * 2)
  const view = new DataView(bytes.buffer)
  const text = (at: number, value: string) => { for (let i = 0; i < value.length; i++) bytes[at + i] = value.charCodeAt(i) }
  text(0, 'RIFF')
  view.setUint32(4, bytes.byteLength - 8, true)
  text(8, 'WAVEfmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, VOICE_SAMPLE_RATE, true)
  view.setUint32(28, VOICE_SAMPLE_RATE * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  text(36, 'data')
  view.setUint32(40, samples.length * 2, true)
  for (let i = 0; i < samples.length; i++) view.setInt16(WAV_HEADER_BYTES + i * 2, samples[i], true)
  return bytes
}

// Mono int16 frames of one chunk; stereo or wider input is averaged.
function monoFrames(chunk: PcmChunk): Int16Array {
  const channels = Math.max(1, Math.floor(chunk.channels))
  const input = new Int16Array(chunk.data, 0, Math.floor(chunk.data.byteLength / 2))
  if (channels === 1) return input
  const frames = new Int16Array(Math.floor(input.length / channels))
  for (let f = 0; f < frames.length; f++) {
    let sum = 0
    for (let c = 0; c < channels; c++) sum += input[f * channels + c]
    frames[f] = Math.round(sum / channels)
  }
  return frames
}

// Seconds of audio in one chunk at its own rate.
export function chunkSeconds(chunk: PcmChunk): number {
  const channels = Math.max(1, Math.floor(chunk.channels))
  return chunk.sampleRate > 0 ? Math.floor(chunk.data.byteLength / 2 / channels) / chunk.sampleRate : 0
}

// Builds the canonical WAV from streamed chunks: downmix to mono, resample to
// 24 kHz when the device delivered another rate (linear interpolation), and
// keep at most MAX_VOICE_SECONDS. Returns null when there is no audio.
export function wavFromChunks(chunks: readonly PcmChunk[]): Uint8Array | null {
  const usable = chunks.filter((chunk) => chunk.sampleRate > 0 && chunk.data.byteLength >= 2)
  if (usable.length === 0) return null
  const rate = usable[0].sampleRate
  const parts = usable.map(monoFrames)
  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const source = new Int16Array(total)
  let at = 0
  for (const part of parts) { source.set(part, at); at += part.length }

  let samples: Int16Array
  if (rate === VOICE_SAMPLE_RATE) {
    samples = source.subarray(0, Math.min(source.length, MAX_VOICE_SAMPLES))
  } else {
    const length = Math.min(Math.floor(source.length * VOICE_SAMPLE_RATE / rate), MAX_VOICE_SAMPLES)
    samples = new Int16Array(length)
    const step = rate / VOICE_SAMPLE_RATE
    for (let i = 0; i < length; i++) {
      const position = i * step
      const index = Math.floor(position)
      const next = Math.min(index + 1, source.length - 1)
      const fraction = position - index
      samples[i] = Math.round(source[index] + (source[next] - source[index]) * fraction)
    }
  }
  return samples.length > 0 ? wavFromSamples(samples) : null
}

// Root mean square of an int16 chunk, scaled to 0..1.
export function chunkLevel(data: ArrayBuffer): number {
  const samples = new Int16Array(data, 0, Math.floor(data.byteLength / 2))
  if (samples.length === 0) return 0
  let sum = 0
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i]
  return Math.min(1, Math.sqrt(sum / samples.length) / 32768)
}

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

// Base64 without building one huge argument list (a minute of audio is ~2.9 MB).
export function toBase64(bytes: Uint8Array): string {
  const out: string[] = []
  let line = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0
    line += BASE64[a >> 2] + BASE64[((a & 3) << 4) | (b >> 4)] +
      (i + 1 < bytes.length ? BASE64[((b & 15) << 2) | (c >> 6)] : '=') +
      (i + 2 < bytes.length ? BASE64[c & 63] : '=')
    if (line.length >= 8192) { out.push(line); line = '' }
  }
  out.push(line)
  return out.join('')
}

// An in-memory file reference for FormData: React Native's Android networking
// decodes data: URIs itself, so the recording never touches the disk.
export function wavDataUri(bytes: Uint8Array): string {
  return `data:audio/wav;base64,${toBase64(bytes)}`
}
