// Speech Service Utilities

/**
 * Check if the current page is served over HTTPS or is a development environment
 * Required for persistent microphone permissions
 */
export function isHTTPS(): boolean {
  if (typeof window === 'undefined') return false;
  
  const { protocol, hostname, port } = window.location;
  
  console.log(`[isHTTPS] Checking: protocol=${protocol}, hostname=${hostname}, port=${port}`);
  
  // HTTPS is always allowed
  if (protocol === 'https:') {
    console.log('[isHTTPS] HTTPS protocol detected - returning true');
    return true;
  }
  
  // Development environments are allowed
  const devHosts = [
    'localhost',
    '127.0.0.1',
    '0.0.0.0',
    '::1'
  ];
  
  if (devHosts.includes(hostname)) {
    console.log(`[isHTTPS] Development hostname detected (${hostname}) - returning true`);
    return true;
  }
  
  // Check for common development ports and patterns
  if (hostname.startsWith('192.168.') || 
      hostname.startsWith('10.') || 
      hostname.startsWith('172.')) {
    console.log(`[isHTTPS] Private network detected (${hostname}) - returning true`);
    return true;
  }
  
  console.log(`[isHTTPS] No secure context detected - returning false`);
  return false;
}

/**
 * Check if Web Speech API is available
 */
export function isWebSpeechAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  
  const hasSpeechRecognition = 'SpeechRecognition' in window || 
                               'webkitSpeechRecognition' in window;
  const hasSpeechSynthesis = 'speechSynthesis' in window;
  
  return hasSpeechRecognition || hasSpeechSynthesis;
}

/**
 * Get browser info for debugging
 */
export function getBrowserInfo(): { name: string; version: string; isMobile: boolean } {
  const ua = navigator.userAgent;
  let name = 'Unknown';
  let version = 'Unknown';
  
  if (ua.includes('Chrome')) {
    name = 'Chrome';
    version = ua.match(/Chrome\/(\d+)/)?.[1] || 'Unknown';
  } else if (ua.includes('Firefox')) {
    name = 'Firefox';
    version = ua.match(/Firefox\/(\d+)/)?.[1] || 'Unknown';
  } else if (ua.includes('Safari') && !ua.includes('Chrome')) {
    name = 'Safari';
    version = ua.match(/Version\/(\d+)/)?.[1] || 'Unknown';
  } else if (ua.includes('Edge')) {
    name = 'Edge';
    version = ua.match(/Edge\/(\d+)/)?.[1] || 'Unknown';
  }
  
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  
  return { name, version, isMobile };
}

/**
 * Format duration in seconds to MM:SS
 */
export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Debounce function for reducing API calls
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;
  
  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Convert blob to base64 for API transmission
 */
export async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      // Remove data URL prefix
      const base64Data = base64.split(',')[1];
      resolve(base64Data);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Get microphone permission status
 */
export async function getMicrophonePermission(): Promise<PermissionState | 'unsupported'> {
  if (!navigator.permissions || !navigator.permissions.query) {
    return 'unsupported';
  }
  
  try {
    const result = await navigator.permissions.query({ name: 'microphone' as PermissionName });
    return result.state;
  } catch (error) {
    console.warn('Failed to query microphone permission:', error);
    return 'unsupported';
  }
}

/**
 * Request microphone permission
 */
export async function requestMicrophonePermission(): Promise<boolean> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    // Stop the stream immediately after getting permission
    stream.getTracks().forEach(track => track.stop());
    return true;
  } catch (error) {
    console.error('Microphone permission denied:', error);
    return false;
  }
}

/**
 * Get HTTPS requirement message for user
 */
export function getHTTPSRequirementMessage(): string {
  const { protocol, hostname } = window.location;
  
  if (protocol === 'https:') {
    return 'HTTPS is enabled. Speech recognition should work.';
  }
  
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'Running on localhost. Speech recognition should work.';
  }
  
  return `Speech recognition requires HTTPS. Current URL: ${protocol}//${hostname}. Please use HTTPS or run on localhost for development.`;
}

/**
 * Check if we can request microphone permission despite HTTP
 */
export async function canRequestMicrophoneOnHTTP(): Promise<boolean> {
  if (isHTTPS()) return true;
  
  try {
    // Try to request permission even on HTTP
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach(track => track.stop());
    return true;
  } catch (error) {
    console.warn('Cannot request microphone on HTTP:', error);
    return false;
  }
}
