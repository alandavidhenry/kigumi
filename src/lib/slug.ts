// URL-safe organisation slugs. Better Auth requires a unique slug; a short
// random suffix avoids collisions between studios with common names.
export function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '')
}

export function uniqueSlug(
  value: string,
  random: () => number = Math.random
): string {
  const suffix = Math.floor(random() * 36 ** 4)
    .toString(36)
    .padStart(4, '0')
  const base = slugify(value) || 'studio'
  return `${base}-${suffix}`
}
