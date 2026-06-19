export type RecognitionInput =
  | { kind: 'text'; text: string }
  | { kind: 'photo'; buffer: Buffer; mimeType: string; caption?: string }
  | { kind: 'url'; url: string }

export interface NormalizedContent {
  text?: string
  images?: Array<{ base64: string; mimeType: string }>
  sourceUrl?: string
  coverImageUrl?: string
}

export interface IRecognitionSource {
  detect(input: RecognitionInput): boolean
  extract(input: RecognitionInput): Promise<NormalizedContent>
}

const VIDEO_HOST_RE = /(youtube\.com|youtu\.be|instagram\.com|tiktok\.com)/i

export function isVideoUrl(url: string): boolean {
  return VIDEO_HOST_RE.test(url)
}
