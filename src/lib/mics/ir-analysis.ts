import { ISO_THIRD_OCTAVES } from '@/lib/charts/frequency'
import type { FrPoint } from '@/lib/charts/frequency'
import { POLAR_FLOOR_DB } from '@/lib/charts/polar'
import type { PolarPoint } from '@/lib/charts/polar'

// Offline DSP for deriving curves from open impulse-response datasets
// (ADR 0008): far-field IR -> 1/3-octave frequency response normalised to
// 0 dB at 1 kHz, and per-angle band energy relative to 0° for polar plots.
// Only the derived points are stored, never the audio.

const FLOOR_POWER = 1e-30

function nextPowerOfTwo(n: number): number {
  let size = 1
  while (size < n) size *= 2
  return size
}

// In-place iterative radix-2 FFT.
export function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length
  if ((n & (n - 1)) !== 0) throw new Error('FFT length must be a power of two')
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      ;[re[i], re[j]] = [re[j], re[i]]
      ;[im[i], im[j]] = [im[j], im[i]]
    }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const angle = (-2 * Math.PI) / size
    const wRe = Math.cos(angle)
    const wIm = Math.sin(angle)
    for (let start = 0; start < n; start += size) {
      let curRe = 1
      let curIm = 0
      for (let k = 0; k < size / 2; k++) {
        const a = start + k
        const b = a + size / 2
        const tRe = re[b] * curRe - im[b] * curIm
        const tIm = re[b] * curIm + im[b] * curRe
        re[b] = re[a] - tRe
        im[b] = im[a] - tIm
        re[a] += tRe
        im[a] += tIm
        const nextRe = curRe * wRe - curIm * wIm
        curIm = curRe * wIm + curIm * wRe
        curRe = nextRe
      }
    }
  }
}

export interface PowerSpectrum {
  binHz: number
  power: Float64Array // bins 0..N/2
}

export function powerSpectrum(
  ir: ArrayLike<number>,
  sampleRate: number
): PowerSpectrum {
  const size = nextPowerOfTwo(Math.max(ir.length, 2))
  const re = new Float64Array(size)
  const im = new Float64Array(size)
  for (let i = 0; i < ir.length; i++) re[i] = ir[i]
  fft(re, im)
  const power = new Float64Array(size / 2 + 1)
  for (let i = 0; i < power.length; i++) {
    power[i] = re[i] * re[i] + im[i] * im[i]
  }
  return { binHz: sampleRate / size, power }
}

// Mean power in [lowHz, highHz). Falls back to the nearest bin when the band
// is narrower than one bin.
export function bandPower(
  spectrum: PowerSpectrum,
  lowHz: number,
  highHz: number
): number {
  const first = Math.ceil(lowHz / spectrum.binHz)
  const last = Math.ceil(highHz / spectrum.binHz) - 1
  if (last < first) {
    const nearest = Math.round((lowHz + highHz) / 2 / spectrum.binHz)
    return spectrum.power[Math.min(nearest, spectrum.power.length - 1)]
  }
  let sum = 0
  let count = 0
  for (let i = first; i <= last && i < spectrum.power.length; i++) {
    sum += spectrum.power[i]
    count++
  }
  return count > 0 ? sum / count : 0
}

const toDb = (power: number) => 10 * Math.log10(Math.max(power, FLOOR_POWER))

// Adding 0 turns -0 into 0.
const round2 = (value: number) => Math.round(value * 100) / 100 + 0

// 1/3-octave smoothed response, normalised to 0 dB at 1 kHz. Centres above
// Nyquist are dropped.
export function thirdOctaveResponse(
  ir: ArrayLike<number>,
  sampleRate: number
): FrPoint[] {
  const spectrum = powerSpectrum(ir, sampleRate)
  const nyquist = sampleRate / 2
  const edge = 2 ** (1 / 6)
  const levels = ISO_THIRD_OCTAVES.filter((hz) => hz * edge <= nyquist).map(
    (hz) => [hz, toDb(bandPower(spectrum, hz / edge, hz * edge))] as const
  )
  const reference = levels.find(([hz]) => hz === 1000)
  if (!reference) throw new Error('Sample rate too low to reach 1 kHz')
  return levels.map(([hz, db]) => [hz, round2(db - reference[1])] as FrPoint)
}

// Octave-band level (dB) of one IR around a centre frequency.
export function octaveBandLevelDb(
  ir: ArrayLike<number>,
  sampleRate: number,
  centreHz: number
): number {
  const spectrum = powerSpectrum(ir, sampleRate)
  return toDb(bandPower(spectrum, centreHz / Math.SQRT2, centreHz * Math.SQRT2))
}

// Polar pattern at one octave centre from IRs measured every few degrees.
// Levels are relative to the 0° IR and floored at the plot floor.
export function polarFromImpulseResponses(
  irsByAngle: ReadonlyMap<number, ArrayLike<number>>,
  sampleRate: number,
  centreHz: number
): PolarPoint[] {
  const onAxis = irsByAngle.get(0)
  if (!onAxis) throw new Error('A 0° impulse response is required')
  const reference = octaveBandLevelDb(onAxis, sampleRate, centreHz)
  const points = [...irsByAngle.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([angle, ir]): PolarPoint => [
      angle,
      round2(
        Math.max(
          POLAR_FLOOR_DB,
          octaveBandLevelDb(ir, sampleRate, centreHz) - reference
        )
      )
    ])
  const first = points[0]
  return points[points.length - 1][0] < 360
    ? [...points, [360, first[1]]]
    : points
}

export interface WavData {
  sampleRate: number
  samples: Float64Array // first channel, scaled to -1..1
}

// Minimal RIFF/WAVE reader: PCM 16/24/32-bit and 32-bit float, first channel.
export function parseWav(buffer: Uint8Array): WavData {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)
  const tag = (offset: number) =>
    String.fromCharCode(...buffer.subarray(offset, offset + 4))
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') {
    throw new Error('Not a RIFF/WAVE file')
  }
  let format: {
    code: number
    channels: number
    rate: number
    bits: number
  } | null = null
  let offset = 12
  while (offset + 8 <= buffer.length) {
    const id = tag(offset)
    const size = view.getUint32(offset + 4, true)
    const body = offset + 8
    if (id === 'fmt ') {
      let code = view.getUint16(body, true)
      if (code === 0xfffe) code = view.getUint16(body + 24, true) // extensible
      format = {
        code,
        channels: view.getUint16(body + 2, true),
        rate: view.getUint32(body + 4, true),
        bits: view.getUint16(body + 14, true)
      }
    } else if (id === 'data') {
      if (!format) throw new Error('WAV data chunk before fmt chunk')
      const { code, channels, rate, bits } = format
      const bytes = bits / 8
      const frames = Math.floor(
        Math.min(size, buffer.length - body) / (bytes * channels)
      )
      const samples = new Float64Array(frames)
      for (let i = 0; i < frames; i++) {
        const at = body + i * bytes * channels
        if (code === 3 && bits === 32) samples[i] = view.getFloat32(at, true)
        else if (code === 1 && bits === 16)
          samples[i] = view.getInt16(at, true) / 32768
        else if (code === 1 && bits === 24) {
          const raw =
            buffer[at] | (buffer[at + 1] << 8) | (buffer[at + 2] << 16)
          samples[i] = (raw & 0x800000 ? raw - 0x1000000 : raw) / 8388608
        } else if (code === 1 && bits === 32) {
          samples[i] = view.getInt32(at, true) / 2147483648
        } else
          throw new Error(`Unsupported WAV format (code ${code}, ${bits}-bit)`)
      }
      return { sampleRate: rate, samples }
    }
    offset = body + size + (size % 2)
  }
  throw new Error('WAV file has no data chunk')
}
