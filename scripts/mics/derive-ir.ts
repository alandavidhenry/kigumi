// Derives frequency-response or polar points from impulse-response WAVs of an
// open dataset (Surrey CC BY 4.0, DirPat) and prints JSON for a seed file.
// Only the derived points are kept, never the audio (ADR 0008).
//
//   tsx scripts/mics/derive-ir.ts fr <far-field.wav>
//   tsx scripts/mics/derive-ir.ts polar <dir> <centreHz> [--angle-regex "(\d+)deg"]
//
// The polar mode reads one WAV per angle from <dir>; the angle is the first
// capture group of --angle-regex applied to the file name. A 0° file is
// required.
import fs from 'node:fs'
import path from 'node:path'

import {
  parseWav,
  polarFromImpulseResponses,
  thirdOctaveResponse
} from '../../src/lib/mics/ir-analysis'

function readWav(file: string) {
  return parseWav(new Uint8Array(fs.readFileSync(file)))
}

function main() {
  const [mode, target, centre] = process.argv.slice(2)
  if (mode === 'fr' && target) {
    const { samples, sampleRate } = readWav(target)
    console.warn(JSON.stringify(thirdOctaveResponse(samples, sampleRate)))
    return
  }
  if (mode === 'polar' && target && centre) {
    const flag = process.argv.indexOf('--angle-regex')
    const pattern = new RegExp(
      flag > -1 ? process.argv[flag + 1] : '(\d+)(?:deg)?\.wav$',
      'i'
    )
    const irs = new Map<number, Float64Array>()
    let rate = 0
    for (const name of fs.readdirSync(target)) {
      const angle = pattern.exec(name)?.[1]
      if (angle === undefined) continue
      const wav = readWav(path.join(target, name))
      rate = wav.sampleRate
      irs.set(Number(angle), wav.samples)
    }
    console.warn(
      JSON.stringify(polarFromImpulseResponses(irs, rate, Number(centre)))
    )
    return
  }
  console.error(
    'Usage: derive-ir.ts fr <wav> | polar <dir> <centreHz> [--angle-regex re]'
  )
  process.exit(2)
}

main()
