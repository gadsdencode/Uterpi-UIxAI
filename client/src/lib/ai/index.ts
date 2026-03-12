// client/src/lib/ai/index.ts
// Barrel exports for AI service infrastructure

// Types
export type {
  BaseAIConfig,
  IAIService,
  IAIServiceStatic,
  ValidatedParams,
  CreditInfo,
  AIResponseWithCredits,
  SSEParseResult,
  AIProviderType,
  StandardMessage,
  OpenAIMessage,
  GeminiContent,
  GeminiSystemInstruction
} from './types';

// Base class
export { BaseAIService } from './BaseAIService';

// Stream parsers
export {
  parseOpenAIStyleSSE,
  parseGeminiStyleStream,
  getStreamReader,
  handleStreamError
} from './streamParsers';

