/**
 * Sanitize and clean up malformed AI responses, particularly from LM Studio
 * which may generate multiple responses and brackets
 */
export function sanitizeAIResponse(response: string): string {
  if (!response) return '';
  
  // Remove empty brackets patterns like "[]:" or "[]" at the start of lines
  let cleaned = response.replace(/^\[\]:\s*/gm, '');
  cleaned = cleaned.replace(/\n\[\]:\s*/g, '\n');
  cleaned = cleaned.replace(/\[\]:\s*/g, '');
  
  // Remove standalone brackets
  cleaned = cleaned.replace(/^\[\]\s*$/gm, '');
  
  // If there are multiple greeting-like sentences, keep only the first one
  // Common patterns: "Hello!", "Hi!", "Hey there!", followed by offering help
  const greetingPatterns = [
    /^(Hello|Hi|Hey|Greetings|Good\s+(morning|afternoon|evening))!?[^.!?]*[.!?]/gi,
    /^(How\s+can\s+I\s+(help|assist)|What\s+can\s+I\s+do)[^.!?]*[.!?]/gi,
    /^I'm\s+here\s+to\s+(help|assist)[^.!?]*[.!?]/gi
  ];
  
  // Split response into sentences
  const sentences = cleaned.match(/[^.!?]+[.!?]+/g) || [cleaned];
  
  // Check if we have multiple greeting patterns
  let greetingCount = 0;
  const filteredSentences: string[] = [];
  
  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    let isGreeting = false;
    
    // Check if this sentence matches a greeting pattern
    for (const pattern of greetingPatterns) {
      if (pattern.test(trimmed)) {
        isGreeting = true;
        greetingCount++;
        break;
      }
    }
    
    // Keep the first greeting or any non-greeting sentence
    if (!isGreeting || greetingCount <= 1) {
      filteredSentences.push(trimmed);
    }
  }
  
  // Join sentences back together
  cleaned = filteredSentences.join(' ').trim();
  
  // Remove multiple consecutive spaces
  cleaned = cleaned.replace(/\s+/g, ' ');
  
  // Remove trailing empty brackets or colons
  cleaned = cleaned.replace(/\[\]\s*$/, '');
  cleaned = cleaned.replace(/:\s*$/, '');
  
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