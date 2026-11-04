import { MAX_VOICE_SECONDS, VOICE_SAMPLE_RATE } from '@learnquiz/api/voice'
import { chunkLevel, isCanonicalVoiceWav, toBase64, wavDataUri, wavFromChunks, wavFromSamples, type PcmChunk } from './wav'

function chunk(samples: number[], sampleRate = VOICE_SAMPLE_RATE, channels = 1): PcmChunk {
  return { data: Int16Array.from(samples).buffer, sampleRate, channels }
}

function header(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return { channels: view.getUint16(22, true), rate: view.getUint32(24, true), bits: view.getUint16(34, true), data: view.getUint32(40, true) }
}

function samplesOf(bytes: Uint8Array): number[] {
  return Array.from(new Int16Array(bytes.buffer.slice(bytes.byteOffset + 44, bytes.byteOffset + bytes.byteLength)))
}

test('accepts a canonical mono 16-bit 24 kHz file', () => {
  const wav = wavFromSamples(Int16Array.from([0, 1000, -1000, 32767, -32768]))
  expect(wav.byteLength).toBe(44 + 10)
  expect(isCanonicalVoiceWav(wav)).toBe(true)
})

test('rejects 48 kHz', () => {
  const wav = wavFromSamples(Int16Array.from([1, 2, 3, 4]))
  const view = new DataView(wav.buffer)
  view.setUint32(24, 48_000, true)
  view.setUint32(28, 96_000, true)
  expect(isCanonicalVoiceWav(wav)).toBe(false)
})

test('rejects stereo', () => {
  const wav = wavFromSamples(Int16Array.from([1, 2, 3, 4]))
  const view = new DataView(wav.buffer)
  view.setUint16(22, 2, true)
  view.setUint32(28, VOICE_SAMPLE_RATE * 4, true)
  view.setUint16(32, 4, true)
  expect(isCanonicalVoiceWav(wav)).toBe(false)
})

test.each([
  ['RIFF size', 4, 999],
  ['data size', 40, 2],
  ['fmt size', 16, 18],
])('rejects a wrong %s', (_name, offset, value) => {
  const wav = wavFromSamples(Int16Array.from([1, 2, 3, 4]))
  new DataView(wav.buffer).setUint32(offset, value, true)
  expect(isCanonicalVoiceWav(wav)).toBe(false)
})

test('rejects an odd data length and a header-only file', () => {
  const wav = wavFromSamples(Int16Array.from([1, 2]))
  const odd = new Uint8Array(wav.byteLength + 1)
  odd.set(wav)
  const view = new DataView(odd.buffer)
  view.setUint32(4, odd.byteLength - 8, true)
  view.setUint32(40, odd.byteLength - 44, true)
  expect(isCanonicalVoiceWav(odd)).toBe(false)
  expect(isCanonicalVoiceWav(wavFromSamples(new Int16Array(0)))).toBe(false)
})

test('rejects over 60 seconds', () => {
  expect(isCanonicalVoiceWav(wavFromSamples(new Int16Array(VOICE_SAMPLE_RATE * MAX_VOICE_SECONDS)))).toBe(true)
  expect(isCanonicalVoiceWav(wavFromSamples(new Int16Array(VOICE_SAMPLE_RATE * MAX_VOICE_SECONDS + 1)))).toBe(false)
})

test('joins streamed 24 kHz chunks in order under a canonical header', () => {
  const wav = wavFromChunks([chunk([1, 2, 3]), chunk([4, 5])])!
  expect(isCanonicalVoiceWav(wav)).toBe(true)
  expect(header(wav)).toEqual({ channels: 1, rate: 24_000, bits: 16, data: 10 })
  expect(samplesOf(wav)).toEqual([1, 2, 3, 4, 5])
})

test('downmixes stereo chunks to mono', () => {
  const wav = wavFromChunks([chunk([100, 300, -200, -400], VOICE_SAMPLE_RATE, 2)])!
  expect(isCanonicalVoiceWav(wav)).toBe(true)
  expect(samplesOf(wav)).toEqual([200, -300])
})

test('resamples a 48 kHz fallback stream to 24 kHz', () => {
  const wav = wavFromChunks([chunk([0, 10, 20, 30, 40, 50, 60, 70], 48_000)])!
  expect(isCanonicalVoiceWav(wav)).toBe(true)
  expect(header(wav).rate).toBe(24_000)
  expect(samplesOf(wav)).toEqual([0, 20, 40, 60])
})

test('keeps at most 60 seconds of a longer stream', () => {
  const second = new Array<number>(VOICE_SAMPLE_RATE).fill(7)
  const wav = wavFromChunks(Array.from({ length: MAX_VOICE_SECONDS + 2 }, () => chunk(second)))!
  expect(isCanonicalVoiceWav(wav)).toBe(true)
  expect(header(wav).data).toBe(VOICE_SAMPLE_RATE * MAX_VOICE_SECONDS * 2)
})

test('returns null when nothing was captured', () => {
  expect(wavFromChunks([])).toBeNull()
  expect(wavFromChunks([chunk([])])).toBeNull()
})

test('measures the level of a chunk from its RMS', () => {
  expect(chunkLevel(Int16Array.from([0, 0, 0]).buffer)).toBe(0)
  expect(chunkLevel(Int16Array.from([16384, -16384]).buffer)).toBeCloseTo(0.5)
})

test('base64 matches the platform encoder, including padding', () => {
  for (const length of [0, 1, 2, 3, 4, 5, 9000]) {
    const bytes = Uint8Array.from({ length }, (_, i) => (i * 37 + 11) % 256)
    expect(toBase64(bytes)).toBe(Buffer.from(bytes).toString('base64'))
  }
  expect(wavDataUri(Uint8Array.from([1, 2, 3]))).toBe('data:audio/wav;base64,AQID')
})
