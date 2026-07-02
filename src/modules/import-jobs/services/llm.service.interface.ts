export interface ILLMService {
  getLlmBaseUrl(): string;
  getLlmApiKey(): string;
  getRecognitionModel(): string;
  getRefinementModel(): string;
}
