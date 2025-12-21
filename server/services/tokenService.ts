// Token Service - Token Estimation and Credit Deduction
// Handles token counting and credit management for AI operations

import { trackAIUsage } from "../stripe-consolidated";
import type { CreditDeductionResult, AuthenticatedRequest } from "../types/ai";

/**
 * Token Service - Token estimation and credit management
 */
export class TokenService {
  // Average characters per token for English text
  private readonly avgCharsPerToken: number = 4;

  /**
   * Estimate token count from text
   * This is a rough approximation - for production, use proper tokenizer libraries
   */
  estimateTokenCount(text: string): number {
    if (!text) return 0;
    
    // Rough estimation: 1 token ≈ 4 characters for English text
    // This varies by model and language, but gives a reasonable approximation
    return Math.ceil(text.length / this.avgCharsPerToken);
  }

  /**
   * Count tokens from messages array
   */
  countTokensFromMessages(messages: any[]): number {
    if (!Array.isArray(messages)) return 0;
    
    return messages.reduce((total, message) => {
      const content = message.content || '';
      return total + this.estimateTokenCount(content);
    }, 0);
  }

  /**
   * Estimate tokens for an AI request
   */
  estimateRequestTokens(messages: any[], systemPrompt?: string): number {
    let total = this.countTokensFromMessages(messages);
    if (systemPrompt) {
      total += this.estimateTokenCount(systemPrompt);
    }
    // Add some overhead for message formatting
    total += messages.length * 4; // ~4 tokens per message for role markers
    return total;
  }

  /**
   * Deduct credits after AI response
   */
  async deductCreditsAfterResponse(
    req: AuthenticatedRequest, 
    inputTokens: number, 
    outputTokens: number, 
    modelUsed: string = 'unknown'
  ): Promise<CreditDeductionResult | null> {
    if (!req.user) {
      console.warn('⚠️ Cannot deduct credits - no user in request');
      return null;
    }

    if (req.user.freeMessageUsed) {
      console.log(`⏭️ Skipping credit deduction for user ${req.user.id} - free message was used`);
      return null;
    }

    if (req.user.needsCreditDeduction) {
      const totalTokens = inputTokens + outputTokens;
      console.log(`💳 Deducting credits for user ${req.user.id}: ${inputTokens} input + ${outputTokens} output = ${totalTokens} total tokens`);
      
      try {
        const result = await trackAIUsage({
          userId: req.user.id,
          operationType: req.user.needsCreditDeduction.operationType as any,
          modelUsed,
          tokensConsumed: totalTokens,
        });
        
        console.log(`✅ Credits deducted for user ${req.user.id}: ${result.creditsUsed} credits used, ${result.remainingBalance} remaining`);
        return result;
      } catch (error) {
        console.error(`❌ Error deducting credits for user ${req.user.id}:`, error);
        // Don't fail the request if credit deduction fails - log and continue
        return null;
      }
    }
    
    return null;
  }

  /**
   * Calculate required credits for an operation
   */
  calculateRequiredCredits(
    estimatedTokens: number, 
    operationType: string = 'chat_completion'
  ): number {
    // Credit costs per 1000 tokens based on operation type
    const creditRates: Record<string, number> = {
      'chat_completion': 1,
      'code_generation': 2,
      'image_analysis': 3,
      'embeddings': 0.5,
      'fine_tuning': 5,
      'default': 1
    };

    const rate = creditRates[operationType] || creditRates['default'];
    return Math.ceil((estimatedTokens / 1000) * rate);
  }

  /**
   * Estimate credits needed for messages
   */
  estimateCreditsForMessages(
    messages: any[], 
    estimatedOutputTokens: number = 500,
    operationType: string = 'chat_completion'
  ): number {
    const inputTokens = this.countTokensFromMessages(messages);
    const totalTokens = inputTokens + estimatedOutputTokens;
    return this.calculateRequiredCredits(totalTokens, operationType);
  }
}

// Export singleton instance
export const tokenService = new TokenService();

// Export functions for backwards compatibility
export function estimateTokenCount(text: string): number {
  return tokenService.estimateTokenCount(text);
}

export function countTokensFromMessages(messages: any[]): number {
  return tokenService.countTokensFromMessages(messages);
}

export async function deductCreditsAfterResponse(
  req: AuthenticatedRequest, 
  inputTokens: number, 
  outputTokens: number, 
  modelUsed: string = 'unknown'
): Promise<CreditDeductionResult | null> {
  return tokenService.deductCreditsAfterResponse(req, inputTokens, outputTokens, modelUsed);
}

