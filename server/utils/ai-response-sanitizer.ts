// server/utils/ai-response-sanitizer.ts
// Sanitizes AI responses before saving to database
// Removes echoed conversation history patterns (User:/Assistant: prefixes)
// that indicate the model is repeating the prompt format in its output

/**
 * Patterns that indicate an AI response contains echoed conversation history
 * These patterns appear when models echo back the conversation format
 */
const ECHOED_HISTORY_PATTERNS = [
  // Prefixed role markers at start of lines
  /^User:\s*/gim,
  /^Assistant:\s*/gim,
  /^Human:\s*/gim,
  /^AI:\s*/gim,
  /^System:\s*/gim,
  
  // Role markers with angle brackets (some models use this format)
  /^<user>\s*/gim,
  /^<assistant>\s*/gim,
  /^<\/user>\s*/gim,
  /^<\/assistant>\s*/gim,
  
  // Role markers with colons and newlines
  /\nUser:\s*/gi,
  /\nAssistant:\s*/gi,
  /\nHuman:\s*/gi,
  /\nAI:\s*/gi,
];

/**
 * Patterns that indicate analysis/meta prompts leaked into response
 */
const ANALYSIS_PROMPT_PATTERNS = [
  /ANALYSIS TASK:/gi,
  /ANALYSIS CRITERIA:/gi,
  /CONVERSATION:/gi,
  /analyze this conversation/gi,
  /return only a json object/gi,
  /json object with this structure/gi,
];

/**
 * Sanitizes AI response content before saving to database
 * 
 * This function:
 * 1. Removes echoed conversation history markers (User:/Assistant: prefixes)
 * 2. Strips analysis prompt fragments that may have leaked
 * 3. Cleans up formatting artifacts
 * 
 * @param content - Raw AI response content
 * @param options - Optional sanitization options
 * @returns Sanitized content ready for database storage
 */
export function sanitizeAIResponseForStorage(
  content: string,
  options: {
    preserveCodeBlocks?: boolean;
    removeAnalysisPrompts?: boolean;
    logChanges?: boolean;
  } = {}
): string {
  if (!content || typeof content !== 'string') {
    return content || '';
  }

  const {
    preserveCodeBlocks = true,
    removeAnalysisPrompts = true,
    logChanges = false,
  } = options;

  let sanitized = content;
  const originalLength = sanitized.length;
  const changes: string[] = [];

  // Preserve code blocks by temporarily replacing them
  const codeBlocks: string[] = [];
  if (preserveCodeBlocks) {
    // Match fenced code blocks (``` or ~~~)
    sanitized = sanitized.replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/g, (match) => {
      const placeholder = `__CODE_BLOCK_${codeBlocks.length}__`;
      codeBlocks.push(match);
      return placeholder;
    });
  }

  // Check for and handle multi-turn response pattern
  // This is when the AI echoes the entire conversation before responding
  const multiTurnPattern = /^(?:User:[\s\S]*?(?:Assistant:|$))+/i;
  if (multiTurnPattern.test(sanitized)) {
    // Find the last "Assistant:" and take only content after it
    const lastAssistantIndex = sanitized.lastIndexOf('Assistant:');
    if (lastAssistantIndex !== -1) {
      const afterLastAssistant = sanitized.substring(lastAssistantIndex + 'Assistant:'.length).trim();
      // Only use this if there's substantial content after
      if (afterLastAssistant.length > 20) {
        changes.push(`Extracted content after last Assistant: marker (removed ${lastAssistantIndex} chars)`);
        sanitized = afterLastAssistant;
      }
    }
  }

  // Remove role prefix patterns from lines
  for (const pattern of ECHOED_HISTORY_PATTERNS) {
    const before = sanitized;
    sanitized = sanitized.replace(pattern, '');
    if (sanitized !== before) {
      changes.push(`Removed pattern: ${pattern.source}`);
    }
  }

  // Remove analysis prompt patterns if they leaked into response
  if (removeAnalysisPrompts) {
    for (const pattern of ANALYSIS_PROMPT_PATTERNS) {
      const match = pattern.exec(sanitized);
      if (match) {
        // Find the section containing analysis prompts and remove it
        const lines = sanitized.split('\n');
        const filteredLines = lines.filter(line => {
          return !ANALYSIS_PROMPT_PATTERNS.some(p => p.test(line));
        });
        if (filteredLines.length < lines.length) {
          changes.push(`Removed ${lines.length - filteredLines.length} analysis prompt lines`);
          sanitized = filteredLines.join('\n');
        }
      }
    }
  }

  // Clean up formatting artifacts
  // Remove multiple consecutive newlines (more than 2)
  sanitized = sanitized.replace(/\n{3,}/g, '\n\n');
  
  // Remove leading/trailing whitespace from each line while preserving structure
  sanitized = sanitized
    .split('\n')
    .map(line => line.trimEnd())
    .join('\n')
    .trim();

  // Restore code blocks
  if (preserveCodeBlocks && codeBlocks.length > 0) {
    codeBlocks.forEach((block, index) => {
      sanitized = sanitized.replace(`__CODE_BLOCK_${index}__`, block);
    });
  }

  // Log changes if enabled
  if (logChanges && changes.length > 0) {
    console.log(`🧹 AI Response Sanitization:`);
    console.log(`   Original length: ${originalLength}`);
    console.log(`   Sanitized length: ${sanitized.length}`);
    console.log(`   Changes made: ${changes.join(', ')}`);
  }

  return sanitized;
}

/**
 * Checks if content appears to contain echoed conversation history
 * Useful for diagnostics and logging
 * 
 * @param content - Content to check
 * @returns Object indicating if content has issues and what patterns were found
 */
export function detectConversationEchoPatterns(content: string): {
  hasEchoedHistory: boolean;
  hasAnalysisPrompts: boolean;
  detectedPatterns: string[];
} {
  if (!content || typeof content !== 'string') {
    return { hasEchoedHistory: false, hasAnalysisPrompts: false, detectedPatterns: [] };
  }

  const detectedPatterns: string[] = [];

  // Check for echoed history patterns
  for (const pattern of ECHOED_HISTORY_PATTERNS) {
    if (pattern.test(content)) {
      detectedPatterns.push(`echoed_history:${pattern.source}`);
    }
    // Reset lastIndex for global patterns
    pattern.lastIndex = 0;
  }

  // Check for analysis prompt patterns
  for (const pattern of ANALYSIS_PROMPT_PATTERNS) {
    if (pattern.test(content)) {
      detectedPatterns.push(`analysis_prompt:${pattern.source}`);
    }
    pattern.lastIndex = 0;
  }

  const hasEchoedHistory = ECHOED_HISTORY_PATTERNS.some(p => {
    p.lastIndex = 0;
    return p.test(content);
  });

  const hasAnalysisPrompts = ANALYSIS_PROMPT_PATTERNS.some(p => {
    p.lastIndex = 0;
    return p.test(content);
  });

  return {
    hasEchoedHistory,
    hasAnalysisPrompts,
    detectedPatterns
  };
}

/**
 * Sanitizes AI response for logging purposes
 * Truncates long responses and removes sensitive data
 * 
 * @param content - Content to sanitize for logging
 * @param maxLength - Maximum length to return (default 500)
 * @returns Truncated and sanitized content for safe logging
 */
export function sanitizeForLogging(content: string, maxLength: number = 500): string {
  if (!content || typeof content !== 'string') {
    return '[empty]';
  }

  let result = content;
  
  // Truncate if necessary
  if (result.length > maxLength) {
    result = result.substring(0, maxLength) + '... [truncated]';
  }

  // Remove any potential PII patterns for logging
  result = result.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[email]');
  result = result.replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, '[phone]');

  return result;
}

