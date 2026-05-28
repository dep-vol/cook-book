export interface ILLMService {
  getTextGenerationUrl(): string;
  getTextGenerationApiKey(): string;
  getTextGenerationModel(): string;
  getImgGenerationUrl(): string;
  getImgGenerationApiKey(): string;
  getImgGenerationModel(): string;
}
