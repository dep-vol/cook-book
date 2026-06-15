import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
}))

vi.mock('@aws-sdk/client-s3', () => {
  class S3Client {
    send = mocks.send
  }

  class Command {
    constructor(public readonly input: unknown) {}
  }

  return {
    S3Client,
    PutObjectCommand: class PutObjectCommand extends Command {},
    GetObjectCommand: class GetObjectCommand extends Command {},
    DeleteObjectCommand: class DeleteObjectCommand extends Command {},
    HeadBucketCommand: class HeadBucketCommand extends Command {},
    CreateBucketCommand: class CreateBucketCommand extends Command {},
  }
})

vi.mock('crypto', () => ({ randomUUID: () => 'test-uuid' }))

describe('MinIO image storage', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    process.env.MINIO_ENDPOINT = 'localhost'
    process.env.MINIO_PORT = '9000'
    process.env.MINIO_ACCESS_KEY = 'minioadmin'
    process.env.MINIO_SECRET_KEY = 'minioadmin'
    process.env.MINIO_BUCKET = 'recipes'
    process.env.MINIO_USE_SSL = 'false'
  })

  it('creates the configured bucket before uploading when it is missing', async () => {
    const commandNames: string[] = []
    mocks.send.mockImplementation(async (command) => {
      commandNames.push(command.constructor.name)
      if (command.constructor.name === 'HeadBucketCommand') {
        throw Object.assign(new Error('bucket missing'), {
          name: 'NotFound',
          $metadata: { httpStatusCode: 404 },
        })
      }
      return {}
    })

    const { uploadImage } = await import('@/lib/minio')

    const key = await uploadImage(Buffer.from('fake-image'), 'image/jpeg')

    expect(commandNames).toEqual(['HeadBucketCommand', 'CreateBucketCommand', 'PutObjectCommand'])
    expect(key).toBe('recipes/test-uuid')
  })
})
