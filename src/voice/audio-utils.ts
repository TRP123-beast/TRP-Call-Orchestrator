// Audio conversion utilities for the chained voice pipeline.
//
// Twilio Media Streams carry G.711 μ-law @ 8 kHz (base64 frames). Whisper wants
// a normal WAV (we send 16-bit PCM @ 8 kHz). Kokoro TTS returns raw PCM 16-bit
// @ 24 kHz. So we need μ-law ⇆ PCM, resampling, and a WAV container builder.
//
// The G.711 μ-law encode/decode here are the standard reference algorithms
// (ITU-T G.711). WAV container generation uses the `wavefile` package.
import { WaveFile } from 'wavefile';

const BIAS = 0x84; // 132
const CLIP = 32635;

// ─────────────────────────── G.711 μ-law codec ───────────────────────────

/** Decode one μ-law byte → signed 16-bit PCM sample. */
function muLawDecodeSample(uVal: number): number {
  uVal = ~uVal & 0xff;
  let t = ((uVal & 0x0f) << 3) + BIAS;
  t <<= (uVal & 0x70) >> 4;
  return (uVal & 0x80) ? BIAS - t : t - BIAS;
}

/** Encode one signed 16-bit PCM sample → μ-law byte. */
function muLawEncodeSample(sample: number): number {
  let sign = sample < 0 ? 0x80 : 0;
  if (sign) sample = -sample;
  if (sample > CLIP) sample = CLIP;
  sample += BIAS;

  let exponent = 7;
  for (let mask = 0x4000; (sample & mask) === 0 && exponent > 0; exponent--, mask >>= 1) {
    /* find the exponent */
  }
  const mantissa = (sample >> (exponent + 3)) & 0x0f;
  return ~(sign | (exponent << 4) | mantissa) & 0xff;
}

/**
 * Decode a μ-law buffer (8 kHz from Twilio) into 16-bit PCM samples (8 kHz).
 * Returns an Int16Array of linear samples.
 */
export function mulawToPcm(mulawBuffer: Buffer): Int16Array {
  const out = new Int16Array(mulawBuffer.length);
  for (let i = 0; i < mulawBuffer.length; i++) {
    out[i] = muLawDecodeSample(mulawBuffer[i]);
  }
  return out;
}

/**
 * Convert 16-bit PCM (at `inputRate`) to μ-law @ `outputRate` (8 kHz for Twilio).
 * `pcmBuffer` is little-endian 16-bit PCM (e.g. Kokoro's 24 kHz output).
 */
export function pcmToMulaw(pcmBuffer: Buffer, inputRate = 24000, outputRate = 8000): Buffer {
  const samples = bufferToInt16(pcmBuffer);
  const resampled = inputRate === outputRate ? samples : resample(samples, inputRate, outputRate);
  const out = Buffer.allocUnsafe(resampled.length);
  for (let i = 0; i < resampled.length; i++) {
    out[i] = muLawEncodeSample(resampled[i]);
  }
  return out;
}

// ─────────────────────────────── Resampling ───────────────────────────────

/**
 * Linear-interpolation resampler for 16-bit PCM samples. Good enough for
 * telephony-band speech (8 kHz target). Returns a new Int16Array at `toRate`.
 */
export function resample(samples: Int16Array, fromRate: number, toRate: number): Int16Array {
  if (fromRate === toRate || samples.length === 0) return samples;
  const ratio = toRate / fromRate;
  const outLength = Math.max(1, Math.floor(samples.length * ratio));
  const out = new Int16Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const srcPos = i / ratio;
    const idx = Math.floor(srcPos);
    const frac = srcPos - idx;
    const a = samples[idx] ?? 0;
    const b = samples[idx + 1] ?? a;
    out[i] = (a + (b - a) * frac) | 0;
  }
  return out;
}

// ──────────────────────────── WAV container ────────────────────────────

/**
 * Wrap raw 16-bit PCM samples in a WAV container (for Whisper). `rawBuffer` is
 * either a little-endian 16-bit PCM Buffer or an Int16Array of samples.
 */
export function bufferToWav(rawBuffer: Buffer | Int16Array, sampleRate = 8000, channels = 1): Buffer {
  const samples = rawBuffer instanceof Int16Array ? rawBuffer : bufferToInt16(rawBuffer);
  const wav = new WaveFile();
  // fromScratch(numChannels, sampleRate, bitDepth, samples)
  wav.fromScratch(channels, sampleRate, '16', samples);
  return Buffer.from(wav.toBuffer());
}

// ──────────────────────────────── Helpers ────────────────────────────────

/** Read a little-endian 16-bit PCM Buffer into an Int16Array (handles odd byte alignment). */
export function bufferToInt16(buf: Buffer): Int16Array {
  const sampleCount = buf.length >> 1; // 2 bytes per sample
  const out = new Int16Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    out[i] = buf.readInt16LE(i * 2);
  }
  return out;
}

/**
 * Mean absolute amplitude (0..32767) of a μ-law frame — a cheap energy measure
 * used for voice-activity / silence detection in the pipeline.
 */
export function mulawFrameEnergy(mulawBuffer: Buffer): number {
  if (mulawBuffer.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < mulawBuffer.length; i++) {
    sum += Math.abs(muLawDecodeSample(mulawBuffer[i]));
  }
  return sum / mulawBuffer.length;
}
