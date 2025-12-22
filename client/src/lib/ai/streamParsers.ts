// client/src/lib/ai/streamParsers.ts
// Reusable SSE and streaming response parsers for AI services

/**
 * Parse OpenAI-style Server-Sent Events (SSE) stream
 * Used by OpenAI, LMStudio, and Azure AI services
 * 
 * @param reader - ReadableStream reader from fetch response
 * @param onChunk - Callback for each content chunk
 * @returns Promise that resolves when stream is complete
 */
export async function parseOpenAIStyleSSE(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onChunk: (chunk: string) => void
): Promise<void> {
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      
      if (done) {
        break;
      }

      // Decode the chunk and add to buffer
      const chunk = decoder.decode(value, { stream: true });
      buffer += chunk;

      // Process complete SSE events (lines ending with \n)
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          
          if (data === '[DONE]') {
            return;
          }

          try {
            const eventData = JSON.parse(data);
            for (const choice of eventData.choices || []) {
              const content = choice.delta?.content;
              if (content) {
                onChunk(content);
              }
            }
          } catch (parseError) {
            // Skip invalid JSON, continue processing
            console.warn("Failed to parse SSE event:", parseError);
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Parse Gemini-style streaming response
 * Handles both native Gemini format and OpenAI-compatible proxy format
 * Gemini sends cumulative text, so we need to track and deduplicate
 * 
 * @param reader - ReadableStream reader from fetch response
 * @param onChunk - Callback for each NEW content chunk (deduplicated)
 * @returns Promise that resolves when stream is complete
 */
export async function parseGeminiStyleStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onChunk: (chunk: string) => void
): Promise<void> {
  const decoder = new TextDecoder();
  let buffer = '';
  let accumulatedText = ''; // Track ALL text sent so far for deduplication

  try {
    while (true) {
      const { done, value } = await reader.read();
      
      if (done) {
        break;
      }

      // Decode the chunk and add to buffer
      const chunk = decoder.decode(value, { stream: true });
      buffer += chunk;

      // Process complete lines
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        if (!line.trim()) continue;
        
        let jsonData = line;
        
        // Check if it's SSE format (with alt=sse parameter)
        if (line.startsWith('data: ')) {
          jsonData = line.slice(6).trim();
          if (jsonData === '[DONE]') {
            return;
          }
        }
        
        try {
          const data = JSON.parse(jsonData);
          
          // Extract text from Gemini native streaming response
          if (data.candidates && data.candidates[0]) {
            const candidate = data.candidates[0];
            const currentText = candidate.content?.parts?.[0]?.text || '';
            
            if (!currentText) continue;
            
            // Check if this chunk contains the accumulated text as a prefix
            // This means it's a cumulative update containing all previous text plus new
            if (currentText.startsWith(accumulatedText)) {
              // Extract only the NEW characters after what we've already sent
              const newText = currentText.substring(accumulatedText.length);
              if (newText) {
                onChunk(newText);
                accumulatedText = currentText;
              }
            } else if (accumulatedText.startsWith(currentText)) {
              // This chunk is a subset of what we already have, skip it
              continue;
            } else {
              // This is completely new text (not a continuation of accumulated)
              // Just send it as is
              onChunk(currentText);
              accumulatedText = accumulatedText + currentText;
            }
            
            // Log warning if response is truncated
            if (candidate.finishReason && candidate.finishReason !== 'STOP') {
              if (candidate.finishReason === 'MAX_TOKENS') {
                console.warn('⚠️ Gemini streaming hit token limit');
              }
            }
          } else if (data.choices && data.choices[0]) {
            // Extract text from OpenAI-style SSE (server proxy compatibility)
            const choice = data.choices[0];
            const deltaText = choice?.delta?.content || '';
            const fullMessageText = choice?.message?.content || '';

            // Prefer incremental delta when present; fallback to full message text
            const text = deltaText || fullMessageText;
            if (text) {
              onChunk(text);
              accumulatedText += text;
            }
          }
        } catch (e) {
          // Silently ignore parse errors for non-JSON lines
        }
      }
    }
    
    // Process any remaining buffer
    if (buffer.trim()) {
      try {
        const data = JSON.parse(buffer);
        if (data.candidates && data.candidates[0]) {
          const fullText = data.candidates[0].content?.parts?.[0]?.text || '';
          if (fullText && fullText.length > accumulatedText.length) {
            const newText = fullText.substring(accumulatedText.length);
            onChunk(newText);
          }
        }
      } catch (e) {
        // Ignore incomplete JSON at end
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Create a reader from a fetch response with error handling
 * 
 * @param response - Fetch response object
 * @returns ReadableStreamDefaultReader
 * @throws Error if response body is undefined
 */
export function getStreamReader(
  response: Response
): ReadableStreamDefaultReader<Uint8Array> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("The response stream is undefined");
  }
  return reader;
}

/**
 * Handle common HTTP error responses from AI APIs
 * 
 * @param response - Fetch response object
 * @param providerName - Name of the provider for error messages
 * @returns Parsed error data
 * @throws Error with appropriate message
 */
export async function handleStreamError(
  response: Response,
  providerName: string
): Promise<never> {
  // Handle credit limit errors specially
  if (response.status === 402) {
    const errorData = await response.json();
    throw new Error(`Subscription error: ${JSON.stringify(errorData)}`);
  }
  
  const errorData = await response.text();
  console.error(`❌ ${providerName} streaming error:`, errorData);
  throw new Error(`${providerName} streaming error: ${errorData}`);
}

