import { Message } from '../types';

/**
 * Generates a formatted text transcript from chat messages
 * @param messages Array of chat messages
 * @param excludeWelcomeMessage Whether to exclude the initial welcome message (default: true)
 * @returns Formatted transcript string
 */
export function generateTranscript(
  messages: Message[], 
  excludeWelcomeMessage: boolean = true
): string {
  const exportTime = new Date();
  const header = `NomadAI Chat Transcript
Generated: ${exportTime.toLocaleString()}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

`;

  // Filter messages based on excludeWelcomeMessage flag
  const filteredMessages = excludeWelcomeMessage 
    ? messages.filter(msg => msg.id !== "1")
    : messages;

  if (filteredMessages.length === 0) {
    return header + "No messages to export.\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nEnd of transcript";
  }

  const messageTexts = filteredMessages.map(message => {
    const timestamp = message.timestamp.toLocaleTimeString();
    const role = message.role === 'user' ? 'You' : 'NomadAI';
    
    let messageText = `[${timestamp}] ${role}:\n${message.content}`;
    
    // Add attachments if present
    if (message.attachments && message.attachments.length > 0) {
      messageText += '\n📎 Attachments: ' + message.attachments.join(', ');
    }
    
    return messageText;
  });

  const content = messageTexts.join('\n\n');
  const footer = `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nEnd of transcript`;

  return header + content + footer;
}

/**
 * Generates a filename for the transcript with timestamp
 * @returns Filename string
 */
export function generateTranscriptFilename(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const day = now.getDate().toString().padStart(2, '0');
  const hours = now.getHours().toString().padStart(2, '0');
  const minutes = now.getMinutes().toString().padStart(2, '0');
  const seconds = now.getSeconds().toString().padStart(2, '0');
  
  return `nomadai-transcript-${year}-${month}-${day}-${hours}${minutes}${seconds}.txt`;
}

/**
 * Downloads a text transcript as a .txt file
 * @param messages Array of chat messages
 * @param excludeWelcomeMessage Whether to exclude the initial welcome message
 */
export function downloadTranscript(
  messages: Message[], 
  excludeWelcomeMessage: boolean = true
): void {
  try {
    const transcriptText = generateTranscript(messages, excludeWelcomeMessage);
    const filename = generateTranscriptFilename();
    
    // Create blob and download
    const blob = new Blob([transcriptText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    
    // Create temporary anchor element for download
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = 'none';
    
    // Trigger download
    document.body.appendChild(anchor);
    anchor.click();
    
    // Clean up
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Failed to download transcript:', error);
    throw new Error('Failed to download transcript. Please try again.');
  }
}

/**
 * Copies transcript text to clipboard
 * @param messages Array of chat messages
 * @param excludeWelcomeMessage Whether to exclude the initial welcome message
 * @returns Promise that resolves when copy is complete
 */
export async function copyTranscriptToClipboard(
  messages: Message[], 
  excludeWelcomeMessage: boolean = true
): Promise<void> {
  try {
    const transcriptText = generateTranscript(messages, excludeWelcomeMessage);
    
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(transcriptText);
    } else {
      // Fallback for older browsers or non-secure contexts
      const textArea = document.createElement('textarea');
      textArea.value = transcriptText;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);
      
      if (!successful) {
        throw new Error('Copy command failed');
      }
    }
  } catch (error) {
    console.error('Failed to copy transcript to clipboard:', error);
    throw new Error('Failed to copy transcript. Please try again.');
  }
}

/**
 * Shares transcript using Web Share API if available, otherwise copies to clipboard
 * @param messages Array of chat messages
 * @param excludeWelcomeMessage Whether to exclude the initial welcome message
 * @returns Promise that resolves when sharing is complete
 */
export async function shareTranscript(
  messages: Message[], 
  excludeWelcomeMessage: boolean = true
): Promise<{ method: 'share' | 'clipboard' }> {
  try {
    const transcriptText = generateTranscript(messages, excludeWelcomeMessage);
    const filename = generateTranscriptFilename();
    
    // Check if Web Share API is available and supports text sharing
    if (navigator.share && navigator.canShare) {
      const shareData = {
        title: 'NomadAI Chat Transcript',
        text: transcriptText,
        url: undefined // Don't include URL to focus on text content
      };
      
      if (navigator.canShare(shareData)) {
        await navigator.share(shareData);
        return { method: 'share' };
      }
    }
    
    // Fallback to clipboard
    await copyTranscriptToClipboard(messages, excludeWelcomeMessage);
    return { method: 'clipboard' };
  } catch (error) {
    console.error('Failed to share transcript:', error);
    throw new Error('Failed to share transcript. Please try again.');
  }
}

/**
 * Checks if Web Share API is available and functional
 * @returns Boolean indicating if sharing is supported
 */
export function isWebShareSupported(): boolean {
  if (typeof navigator === 'undefined' || !navigator.share) {
    return false;
  }
  
  // Test if canShare function exists and works with a minimal share data object
  try {
    if (navigator.canShare) {
      return navigator.canShare({ text: 'test' });
    }
    return true; // share exists but canShare might not be available (older implementations)
  } catch {
    return false;
  }
} 