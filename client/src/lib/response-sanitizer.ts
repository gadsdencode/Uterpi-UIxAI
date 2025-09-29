/**
 * Sanitize and clean up malformed AI responses, particularly from LM Studio
 * which may generate multiple responses and brackets
 */
export function sanitizeAIResponse(response: string, isGreeting: boolean = false): string {
  if (!response) return '';
  
  // Remove empty brackets patterns like "[]:" or "[]" at the start of lines
  let cleaned = response.replace(/^\[\]:\s*/gm, '');
  cleaned = cleaned.replace(/\n\[\]:\s*/g, '\n');
  cleaned = cleaned.replace(/\[\]:\s*/g, '');
  
  // Remove standalone brackets
  cleaned = cleaned.replace(/^\[\]\s*$/gm, '');
  
  // If this is the initial greeting, don't filter out greeting patterns
  // Only filter duplicate greetings in regular messages
  if (!isGreeting) {
    // If there are multiple greeting-like sentences, keep only the first one
    // This is only for non-greeting messages where the AI might repeat itself
    const greetingPatterns = [
      /^(Hello|Hi|Hey|Greetings|Good\s+(morning|afternoon|evening))!?[^.!?]*[.!?]/gi,
      /^(How\s+can\s+I\s+(help|assist)|What\s+can\s+I\s+do)[^.!?]*[.!?]/gi,
      /^I'm\s+here\s+to\s+(help|assist)[^.!?]*[.!?]/gi
    ];
    
    // Split response into sentences
    const sentences = cleaned.match(/[^.!?]+[.!?]+/g) || [cleaned];
    
    // Only filter if we have MULTIPLE greeting sentences
    let greetingCount = 0;
    const greetingIndices: number[] = [];
    
    sentences.forEach((sentence, index) => {
      const trimmed = sentence.trim();
      for (const pattern of greetingPatterns) {
        if (pattern.test(trimmed)) {
          greetingCount++;
          greetingIndices.push(index);
          break;
        }
      }
    });
    
    // If we have more than one greeting, keep only the first one
    if (greetingCount > 1) {
      const filteredSentences = sentences.filter((_, index) => {
        // Keep non-greeting sentences and the first greeting
        return !greetingIndices.includes(index) || index === greetingIndices[0];
      });
      cleaned = filteredSentences.join(' ').trim();
    } else {
      // Keep everything if there's only one or no greetings
      cleaned = sentences.join(' ').trim();
    }
  }
  
  // Remove multiple consecutive spaces
  cleaned = cleaned.replace(/\s+/g, ' ');
  
  // Remove trailing empty brackets or colons
  cleaned = cleaned.replace(/\[\]\s*$/, '');
  cleaned = cleaned.replace(/:\s*$/, '');
  
  // Make sure we don't return an empty string for actual content
  if (!cleaned && response.trim()) {
    // If sanitization removed everything but there was content, return the original
    return response.trim();
  }
  
  return cleaned;
}

/**
 * Sanitize streaming chunks in real-time
 * This handles partial content that might contain malformed patterns
 */
export function sanitizeStreamingChunk(chunk: string, buffer: string = ''): {
  sanitized: string;
  newBuffer: string;
} {
  // Combine buffer with new chunk
  const combined = buffer + chunk;
  
  // Check if we have a complete bracket pattern to remove
  const bracketPattern = /\[\]:\s*/;
  if (bracketPattern.test(combined)) {
    const cleaned = combined.replace(bracketPattern, '');
    return { sanitized: cleaned, newBuffer: '' };
  }
  
  // Check if we might be in the middle of a bracket pattern
  if (combined.endsWith('[') || combined.endsWith('[]') || combined.endsWith('[]:')) {
    // Buffer this part and don't output yet
    return { sanitized: '', newBuffer: combined };
  }
  
  // Output the content and clear buffer
  return { sanitized: combined, newBuffer: '' };
}