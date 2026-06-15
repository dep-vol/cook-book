import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { randomUUID } from 'crypto'

const s3 = new S3Client({
  endpoint: `${process.env.MINIO_USE_SSL === 'true' ? 'https' : 'http'}://${process.env.MINIO_ENDPOINT}:${process.env.MINIO_PORT}`,
  region: 'us-east-1',
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY!,
    secretAccessKey: process.env.MINIO_SECRET_KEY!,
  },
  forcePathStyle: true,
})

const BUCKET = process.env.MINIO_BUCKET!
let bucketReady = false

function isMissingBucketError(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  const statusCode = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
  return statusCode === 404 || err.name === 'NoSuchBucket' || err.name === 'NotFound'
}

function isBucketAlreadyExistsError(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  const statusCode = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
  return statusCode === 409 || err.name === 'BucketAlreadyOwnedByYou' || err.name === 'BucketAlreadyExists'
}

async function ensureBucketExists(): Promise<void> {
  if (bucketReady) return

  try {
    await s3.send(new HeadBucketCommand({ Bucket: BUCKET }))
  } catch (err) {
    if (!isMissingBucketError(err)) throw err

    try {
      await s3.send(new CreateBucketCommand({ Bucket: BUCKET }))
    } catch (createErr) {
      if (!isBucketAlreadyExistsError(createErr)) throw createErr
    }
  }

  bucketReady = true
}

export async function uploadImage(buffer: Buffer, mimeType: string): Promise<string> {
  const key = `recipes/${randomUUID()}`
  await ensureBucketExists()
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: buffer,
    ContentType: mimeType,
  }))
  return key
}

export async function getImageUrl(key: string): Promise<string> {
  // Presigned URL — работает 1 час, не требует публичного доступа к бакету
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: key })
  return getSignedUrl(s3, command, { expiresIn: 3600 })
}

export async function deleteImage(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }))
}
