import sharp from 'sharp'

// The client resizes to 512px before uploading, but the server never trusts that.
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024
const DATA_URL_RE = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/
const FORMATS: Record<string, string> = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }

export type ParsedImage = { buffer: Buffer; contentType: string }

// Validates a base64 data URL: declared type, size, and that the bytes really are a JPEG/PNG/WebP.
// Returns a human-readable message on failure.
export async function parseImageDataUrl(value: unknown): Promise<ParsedImage | string> {
  if (typeof value !== 'string') return 'The image is missing.'
  const match = DATA_URL_RE.exec(value)
  if (!match) return 'Images must be JPEG, PNG or WebP.'
  const buffer = Buffer.from(match[2], 'base64')
  if (buffer.length === 0) return 'The image is empty.'
  if (buffer.length > MAX_UPLOAD_BYTES) return 'Images must be 8MB or smaller.'
  try {
    const meta = await sharp(buffer).metadata()
    const contentType = meta.format ? FORMATS[meta.format] : undefined
    if (!contentType) return 'Images must be JPEG, PNG or WebP.'
    if (!meta.width || !meta.height) return "That image couldn't be read."
    return { buffer, contentType }
  } catch {
    return "That image couldn't be read."
  }
}
