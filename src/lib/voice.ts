// Meta's file endpoint accepts mono 16-bit WAV at 16 or 24 kHz:
// https://github.com/meta-models/meta-model-cookbook/tree/main/06_muse_voice/01_voice_api_fundamentals
export const VOICE_SAMPLE_RATE = 24_000
export const MAX_VOICE_SECONDS = 60
export const MAX_VOICE_BYTES = 44 + VOICE_SAMPLE_RATE * 2 * MAX_VOICE_SECONDS

// MediaRecorder produces WebM on Android Chrome. Decode it locally, downmix and
// resample before uploading; the Worker needs no audio codec or stored recording.
export async function recordingToWav(recording: Blob): Promise<File> {
  const context = new AudioContext()
  try {
    const decoded = await context.decodeAudioData(await recording.arrayBuffer())
    if (decoded.duration > MAX_VOICE_SECONDS + 1) throw new Error('Keep your answer under one minute.')
    const offline = new OfflineAudioContext(1, Math.min(Math.ceil(decoded.duration * VOICE_SAMPLE_RATE), VOICE_SAMPLE_RATE * MAX_VOICE_SECONDS), VOICE_SAMPLE_RATE)
    const source = offline.createBufferSource()
    source.buffer = decoded
    source.connect(offline.destination)
    source.start()
    const samples = (await offline.startRendering()).getChannelData(0)
    const bytes = new ArrayBuffer(44 + samples.length * 2)
    const view = new DataView(bytes)
    const text = (at: number, value: string) => [...value].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)))
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
    samples.forEach((sample, i) => view.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, sample)) * (sample < 0 ? 32768 : 32767)), true))
    return new File([bytes], 'answer.wav', { type: 'audio/wav' })
  } finally {
    await context.close()
  }
}

// The upload contract is the canonical WAV emitted above. Check the bytes, not
// the browser-supplied MIME type, before spending a model call.
export async function validateVoiceWav(audio: File): Promise<void> {
  if (audio.size <= 44 || audio.size > MAX_VOICE_BYTES) throw new Error('Record an answer of up to one minute.')
  const bytes = await audio.arrayBuffer()
  const view = new DataView(bytes)
  const text = (at: number, length: number) => String.fromCharCode(...new Uint8Array(bytes, at, length))
  if (
    text(0, 4) !== 'RIFF' || text(8, 8) !== 'WAVEfmt ' || text(36, 4) !== 'data' ||
    view.getUint32(4, true) !== bytes.byteLength - 8 || view.getUint32(16, true) !== 16 ||
    view.getUint16(20, true) !== 1 || view.getUint16(22, true) !== 1 ||
    view.getUint32(24, true) !== VOICE_SAMPLE_RATE || view.getUint32(28, true) !== VOICE_SAMPLE_RATE * 2 ||
    view.getUint16(32, true) !== 2 || view.getUint16(34, true) !== 16 ||
    view.getUint32(40, true) !== bytes.byteLength - 44 || (bytes.byteLength - 44) % 2 !== 0
  ) throw new Error('The recording could not be read. Please record your answer again.')
}
