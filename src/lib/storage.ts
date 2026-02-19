import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'

const storageConfig = {
  bucket: process.env.BUCKET,
  accessKeyId: process.env.ACCESS_KEY_ID,
  secretAccessKey: process.env.SECRET_ACCESS_KEY,
  endpoint: process.env.ENDPOINT,
  region: process.env.REGION || 'auto',
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
}

let s3Client: S3Client | null = null

function getClient(): S3Client {
  if (!s3Client) {
    if (!storageConfig.accessKeyId || !storageConfig.secretAccessKey || !storageConfig.endpoint) {
      throw new Error('S3 storage not configured. Set BUCKET, ACCESS_KEY_ID, SECRET_ACCESS_KEY, ENDPOINT env vars.')
    }
    s3Client = new S3Client({
      region: storageConfig.region,
      endpoint: storageConfig.endpoint,
      forcePathStyle: storageConfig.forcePathStyle,
      credentials: {
        accessKeyId: storageConfig.accessKeyId,
        secretAccessKey: storageConfig.secretAccessKey,
      },
    })
  }
  return s3Client
}

export function isStorageEnabled(): boolean {
  return !!(storageConfig.bucket && storageConfig.accessKeyId && storageConfig.secretAccessKey && storageConfig.endpoint)
}

export async function uploadFile(key: string, body: Buffer | Uint8Array, contentType: string): Promise<void> {
  const client = getClient()
  await client.send(
    new PutObjectCommand({
      Bucket: storageConfig.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  )
}

export async function deleteFile(key: string): Promise<void> {
  const client = getClient()
  await client.send(
    new DeleteObjectCommand({
      Bucket: storageConfig.bucket,
      Key: key,
    })
  )
}

export async function getFile(key: string): Promise<{ body: ReadableStream; contentType: string } | null> {
  const client = getClient()
  try {
    const response = await client.send(
      new GetObjectCommand({
        Bucket: storageConfig.bucket,
        Key: key,
      })
    )
    if (!response.Body) return null
    return {
      body: response.Body.transformToWebStream(),
      contentType: response.ContentType || 'application/octet-stream',
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'NoSuchKey') return null
    throw err
  }
}

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png'])
const MAX_FILE_SIZE = 2 * 1024 * 1024 // 2 MB

export function validateImageFile(file: File): string | null {
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return `Invalid file type "${file.type}". Allowed: JPEG, PNG.`
  }
  if (file.size > MAX_FILE_SIZE) {
    return `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum: 2 MB.`
  }
  return null
}

export function getExtensionFromMime(mimeType: string): string {
  switch (mimeType) {
    case 'image/jpeg': return 'jpg'
    case 'image/png': return 'png'
    default: return 'bin'
  }
}
