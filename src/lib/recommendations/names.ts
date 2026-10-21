// Display names for catalogue microphones. One place, so the UI, the audit log
// and validation agree on what a microphone is called.

export function micName(mic: { manufacturer: string; model: string }): string {
  return `${mic.manufacturer} ${mic.model}`
}
