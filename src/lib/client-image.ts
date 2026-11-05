// Browser-side preparation of photos before upload (Phase 8, L3 and M7).
//
// Re-encoding through a canvas drops every metadata block (EXIF with GPS
// position, camera serials, XMP), applies the camera's orientation so the
// picture stays upright, and scales large phone photos down so lists and
// grids don't load 8 MB originals. PDFs and anything the browser can't decode
// go up unchanged; the server still checks type, size and magic bytes.

export const MAX_IMAGE_EDGE_PX = 2048
const JPEG_QUALITY = 0.85
const REENCODE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

// The size that fits inside a max x max box, never enlarging.
export function fitWithin(
  width: number,
  height: number,
  max = MAX_IMAGE_EDGE_PX
): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height))
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale))
  }
}

// PNG stays PNG (screenshots, transparency); photos become JPEG.
export function outputTypeFor(type: string): 'image/png' | 'image/jpeg' {
  return type === 'image/png' ? 'image/png' : 'image/jpeg'
}

export function renamedFor(name: string, type: string): string {
  const base = name.replace(/\.[^.]+$/, '') || 'photo'
  return `${base}.${type === 'image/png' ? 'png' : 'jpg'}`
}

export async function prepareImageForUpload(file: File): Promise<File> {
  if (!REENCODE_TYPES.has(file.type)) return file
  if (
    typeof createImageBitmap !== 'function' ||
    typeof document === 'undefined'
  ) {
    return file
  }
  try {
    // Modern browsers apply EXIF orientation when decoding.
    const bitmap = await createImageBitmap(file)
    const size = fitWithin(bitmap.width, bitmap.height)
    const canvas = document.createElement('canvas')
    canvas.width = size.width
    canvas.height = size.height
    const context = canvas.getContext('2d')
    if (!context) return file
    context.drawImage(bitmap, 0, 0, size.width, size.height)
    bitmap.close()

    const type = outputTypeFor(file.type)
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, type, JPEG_QUALITY)
    )
    if (!blob) return file
    return new File([blob], renamedFor(file.name, type), { type })
  } catch {
    // Undecodable here (an unusual JPEG variant, say): let the server decide.
    return file
  }
}
