export type ImportStatus = 'pending' | 'processing' | 'done' | 'failed'
export type SourceType = 'photo' | 'text' | 'url'

export interface ImportJobEntity {
  id: string
  status: ImportStatus
  sourceType: SourceType
  rawInput: string
  recipeId: string | null
  error: string | null
  createdAt: Date
}
