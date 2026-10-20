import { describe, expect, it } from 'vitest'

import {
  fft,
  octaveBandLevelDb,
  parseWav,
  polarFromImpulseResponses,
  thirdOctaveResponse
} from '@/lib/mics/ir-analysis'
import {
  LINK_CHECK_USER_AGENT,
  checkLinks,
  isPathAllowed,
  parseRobots
} from '@/lib/mics/link-check'

const RATE = 48000

// Band-limited noise-free "impulse response": a unit impulse has a flat
// spectrum, so its 1/3-octave response must be flat.
function impulse(length = 4096, gain = 1) {
  const ir = new Float64Array(length)
  ir[0] = gain
  return ir
}

// An IR whose magnitude rolls off above `cutoff` (one-pole low-pass).
function lowPassed(cutoff: number, length = 8192) {
  const alpha = 1 - Math.exp((-2 * Math.PI * cutoff) / RATE)
  const ir = new Float64Array(length)
  let state = 0
  for (let i = 0; i < length; i++) {
    state += alpha * ((i === 0 ? 1 : 0) - state)
    ir[i] = state
  }
  return ir
}

function wavBytes(samples: number[], bits: 16 | 24, rate = RATE) {
  const bytes = bits / 8
  const buffer = new Uint8Array(44 + samples.length * bytes)
  const view = new DataView(buffer.buffer)
  const ascii = (offset: number, text: string) =>
    [...text].forEach((c, i) => (buffer[offset + i] = c.charCodeAt(0)))
  ascii(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * bytes, true)
  ascii(8, 'WAVE')
  ascii(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, rate, true)
  view.setUint32(28, rate * bytes, true)
  view.setUint16(32, bytes, true)
  view.setUint16(34, bits, true)
  ascii(36, 'data')
  view.setUint32(40, samples.length * bytes, true)
  samples.forEach((sample, i) => {
    const at = 44 + i * bytes
    if (bits === 16) view.setInt16(at, Math.round(sample * 32767), true)
    else {
      const value = Math.round(sample * 8388607) & 0xffffff
      buffer[at] = value & 0xff
      buffer[at + 1] = (value >> 8) & 0xff
      buffer[at + 2] = (value >> 16) & 0xff
    }
  })
  return buffer
}

describe('fft', () => {
  it('puts a pure tone in the right bin', () => {
    const n = 256
    const re = new Float64Array(n)
    const im = new Float64Array(n)
    for (let i = 0; i < n; i++) re[i] = Math.cos((2 * Math.PI * 16 * i) / n)
    fft(re, im)
    const magnitude = (k: number) => Math.hypot(re[k], im[k])
    expect(magnitude(16)).toBeCloseTo(n / 2)
    expect(magnitude(17)).toBeLessThan(1e-6)
  })

  it('rejects lengths that are not a power of two', () => {
    expect(() => fft(new Float64Array(6), new Float64Array(6))).toThrow()
  })
})

describe('thirdOctaveResponse', () => {
  it('is flat for an impulse, normalised to 0 dB at 1 kHz', () => {
    const curve = thirdOctaveResponse(impulse(), RATE)
    const at1k = curve.find(([hz]) => hz === 1000)!
    expect(at1k[1]).toBe(0)
    for (const [, db] of curve) expect(Math.abs(db)).toBeLessThan(0.5)
  })

  it('drops centres that sit above Nyquist', () => {
    const curve = thirdOctaveResponse(impulse(), 32000)
    expect(curve[curve.length - 1][0]).toBeLessThan(16000)
  })

  it('shows a high-frequency roll-off', () => {
    const curve = thirdOctaveResponse(lowPassed(2000), RATE)
    const level = (hz: number) => curve.find(([f]) => f === hz)![1]
    expect(level(10000)).toBeLessThan(-8)
    expect(Math.abs(level(250))).toBeLessThan(1)
  })

  it('scales out overall gain', () => {
    const a = thirdOctaveResponse(impulse(4096, 1), RATE)
    const b = thirdOctaveResponse(impulse(4096, 0.1), RATE)
    expect(b).toEqual(a)
  })
})

describe('polarFromImpulseResponses', () => {
  it('is relative to the 0 degree response and closes at 360', () => {
    const irs = new Map<number, Float64Array>([
      [0, impulse(4096, 1)],
      [90, impulse(4096, 0.5)],
      [180, impulse(4096, 0.001)]
    ])
    const points = polarFromImpulseResponses(irs, RATE, 1000)
    expect(points[0]).toEqual([0, 0])
    expect(points[1][1]).toBeCloseTo(-6.02, 1)
    expect(points[2][1]).toBe(-30)
    expect(points[points.length - 1]).toEqual([360, 0])
  })

  it('needs a 0 degree measurement', () => {
    expect(() =>
      polarFromImpulseResponses(new Map([[90, impulse()]]), RATE, 1000)
    ).toThrow(/0°/)
  })

  it('measures octave-band level', () => {
    expect(octaveBandLevelDb(impulse(), RATE, 1000)).toBeCloseTo(
      octaveBandLevelDb(impulse(), RATE, 4000),
      1
    )
  })
})

describe('parseWav', () => {
  it('reads 16-bit PCM', () => {
    const wav = parseWav(wavBytes([0, 0.5, -0.5], 16))
    expect(wav.sampleRate).toBe(RATE)
    expect(wav.samples[1]).toBeCloseTo(0.5, 3)
    expect(wav.samples[2]).toBeCloseTo(-0.5, 3)
  })

  it('reads 24-bit PCM, including negative values', () => {
    const wav = parseWav(wavBytes([0.25, -0.25], 24))
    expect(wav.samples[0]).toBeCloseTo(0.25, 4)
    expect(wav.samples[1]).toBeCloseTo(-0.25, 4)
  })

  it('rejects other files', () => {
    expect(() => parseWav(new Uint8Array(64))).toThrow(/RIFF/)
  })
})

describe('parseRobots / isPathAllowed', () => {
  const robots = [
    'User-agent: *',
    'Disallow: /downloadcenter/',
    'Allow: /downloadcenter/public/',
    'Crawl-delay: 30',
    '',
    'User-agent: BadBot',
    'Disallow: /'
  ].join('\n')

  it('reads the wildcard group', () => {
    const rules = parseRobots(robots)
    expect(rules.crawlDelaySeconds).toBe(30)
    expect(isPathAllowed(rules, '/downloadcenter/x.pdf')).toBe(false)
    expect(isPathAllowed(rules, '/products/u87')).toBe(true)
  })

  it('lets a longer Allow beat a Disallow', () => {
    const rules = parseRobots(robots)
    expect(isPathAllowed(rules, '/downloadcenter/public/a.pdf')).toBe(true)
  })

  it('prefers a group that names us', () => {
    const rules = parseRobots(
      'User-agent: KigumiLinkChecker\nDisallow: /secret\n\nUser-agent: *\nDisallow: /',
      'kigumilinkchecker'
    )
    expect(isPathAllowed(rules, '/')).toBe(true)
    expect(isPathAllowed(rules, '/secret/a')).toBe(false)
  })

  it('treats an empty file as no restrictions', () => {
    expect(isPathAllowed(parseRobots(''), '/anything')).toBe(true)
  })
})

describe('checkLinks', () => {
  const respond = (status: number, body = '') => new Response(body, { status })

  it('uses HEAD, an identifying user agent, and respects robots.txt', async () => {
    const calls: Array<{ url: string; method: string; agent: string | null }> =
      []
    const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers)
      calls.push({
        url: String(url),
        method: init?.method ?? 'GET',
        agent: headers.get('user-agent')
      })
      if (String(url).endsWith('/robots.txt')) {
        return respond(200, 'User-agent: *\nDisallow: /downloadcenter/')
      }
      return respond(200)
    }) as typeof fetch

    const results = await checkLinks(
      [
        'https://maker.example/specs/a.pdf',
        'https://maker.example/downloadcenter/b.pdf'
      ],
      { fetchImpl, sleep: async () => {}, minDelayMs: 0 }
    )

    expect(results.map((r) => r.state)).toEqual(['ok', 'skipped'])
    const fetched = calls.filter((c) => !c.url.endsWith('/robots.txt'))
    expect(fetched).toHaveLength(1)
    expect(fetched[0].method).toBe('HEAD')
    expect(fetched[0].agent).toBe(LINK_CHECK_USER_AGENT)
  })

  it('reports broken links and network failures', async () => {
    const fetchImpl = (async (url: string | URL) => {
      if (String(url).endsWith('/robots.txt')) return respond(404)
      if (String(url).includes('gone')) return respond(404)
      throw new Error('ECONNRESET')
    }) as typeof fetch
    const results = await checkLinks(
      ['https://a.example/gone', 'https://b.example/x', 'not a url'],
      { fetchImpl, sleep: async () => {}, minDelayMs: 0 }
    )
    expect(results.map((r) => r.state)).toEqual(['broken', 'broken', 'broken'])
  })

  it('waits for the crawl delay between requests to one host', async () => {
    const sleeps: number[] = []
    const fetchImpl = (async (url: string | URL) =>
      String(url).endsWith('/robots.txt')
        ? respond(200, 'User-agent: *\nCrawl-delay: 5')
        : respond(200)) as typeof fetch
    await checkLinks(['https://m.example/a', 'https://m.example/b'], {
      fetchImpl,
      sleep: async (ms) => {
        sleeps.push(ms)
      },
      minDelayMs: 0
    })
    expect(sleeps.some((ms) => ms > 4000)).toBe(true)
  })

  it('checks each URL once', async () => {
    let heads = 0
    const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
      if (init?.method === 'HEAD') heads++
      return String(url).endsWith('/robots.txt') ? respond(404) : respond(200)
    }) as typeof fetch
    await checkLinks(['https://m.example/a', 'https://m.example/a'], {
      fetchImpl,
      sleep: async () => {},
      minDelayMs: 0
    })
    expect(heads).toBe(1)
  })
})
