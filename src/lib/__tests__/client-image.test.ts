import { describe, expect, it } from 'vitest'

import {
  MAX_IMAGE_EDGE_PX,
  fitWithin,
  outputTypeFor,
  prepareImageForUpload,
  renamedFor
} from '@/lib/client-image'

describe('fitWithin', () => {
  it('scales the long edge down to the limit, keeping the aspect ratio', () => {
    expect(fitWithin(4032, 3024)).toEqual({
      width: MAX_IMAGE_EDGE_PX,
      height: 1536
    })
    expect(fitWithin(3024, 4032)).toEqual({
      width: 1536,
      height: MAX_IMAGE_EDGE_PX
    })
  })

  it('never enlarges a small image', () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 })
  })

  it('never returns a zero dimension', () => {
    expect(fitWithin(10_000, 1)).toEqual({ width: 2048, height: 1 })
  })
})

describe('outputTypeFor / renamedFor', () => {
  it('keeps PNG and turns photos into JPEG with a matching name', () => {
    expect(outputTypeFor('image/png')).toBe('image/png')
    expect(outputTypeFor('image/webp')).toBe('image/jpeg')
    expect(renamedFor('IMG_0001.HEIC.webp', 'image/jpeg')).toBe(
      'IMG_0001.HEIC.jpg'
    )
    expect(renamedFor('desk.png', 'image/png')).toBe('desk.png')
    expect(renamedFor('.webp', 'image/jpeg')).toBe('photo.jpg')
  })
})

describe('prepareImageForUpload', () => {
  it('passes PDFs through untouched', async () => {
    const pdf = new File(['%PDF-1.7'], 'invoice.pdf', {
      type: 'application/pdf'
    })
    expect(await prepareImageForUpload(pdf)).toBe(pdf)
  })

  it('passes images through where the browser APIs are missing', async () => {
    const photo = new File([new Uint8Array([0xff, 0xd8, 0xff])], 'a.jpg', {
      type: 'image/jpeg'
    })
    expect(await prepareImageForUpload(photo)).toBe(photo)
  })
})
