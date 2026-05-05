// speechDebug.ts - Scoped debug logging and canonical types for the speech pipeline

const SPEECH_DEBUG_KEY = 'speech_debug';

function isDebugEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return (
      localStorage.getItem(SPEECH_DEBUG_KEY) === 'true' ||
      !!(import.meta as any).env?.VITE_SPEECH_DEBUG
    );
  } catch {
    return false;
  }
}

type LogLevel = 'info' | 'warn' | 'error';

function log(tag: string, level: LogLevel, message: string, data?: any): void {
  if (level === 'error') {
    console.error(`[${tag}] ${message}`, data ?? '');
    return;
  }
  if (level === 'warn') {
    console.warn(`[${tag}] ${message}`, data ?? '');
    return;
  }
  if (isDebugEnabled()) {
    console.log(`[${tag}] ${message}`, data ?? '');
  }
}

export const speechLog = {
  info: (tag: string, msg: string, data?: any) => log(tag, 'info', msg, data),
  warn: (tag: string, msg: string, data?: any) => log(tag, 'warn', msg, data),
  error: (tag: string, msg: string, data?: any) => log(tag, 'error', msg, data),
  enable: () => { try { localStorage.setItem(SPEECH_DEBUG_KEY, 'true'); } catch {} },
  disable: () => { try { localStorage.removeItem(SPEECH_DEBUG_KEY); } catch {} },
  isEnabled: isDebugEnabled,
};

/** Canonical STT result emitted by the orchestrator — every field is always present. */
export interface CanonicalSTTResult {
  finalTranscript: string;
  interimTranscript: string;
  displayTranscript: string;
  confidence: number;
  isFinal: boolean;
}

/** Build a CanonicalSTTResult from a provider's raw SpeechRecognitionResult. */
export function normalizeSTTResult(raw: {
  transcript?: string;
  confidence?: number;
  isFinal?: boolean;
  finalTranscript?: string;
  interimTranscript?: string;
}): CanonicalSTTResult {
  const finalTranscript = raw.finalTranscript ?? (raw.isFinal ? raw.transcript ?? '' : '');
  const interimTranscript = raw.interimTranscript ?? (raw.isFinal ? '' : raw.transcript ?? '');
  return {
    finalTranscript,
    interimTranscript,
    displayTranscript: (finalTranscript + interimTranscript).trim(),
    confidence: raw.confidence ?? 0,
    isFinal: raw.isFinal ?? false,
  };
}

export type SpeechErrorCode =
  | 'NO_BROWSER_SUPPORT'
  | 'REQUIRES_HTTPS'
  | 'MIC_PERMISSION_DENIED'
  | 'MIC_BLOCKED'
  | 'MIC_NOT_FOUND'
  | 'NETWORK_ERROR'
  | 'PROVIDER_CONFIG_MISSING'
  | 'SERVICE_UNAVAILABLE'
  | 'UNKNOWN';

export interface SpeechErrorInfo {
  code: SpeechErrorCode;
  message: string;
  userMessage: string;
}

export function classifySpeechError(error: unknown): SpeechErrorInfo {
  const msg = error instanceof Error ? error.message : String(error);
  const lower = msg.toLowerCase();

  if (lower.includes('not-allowed') || lower.includes('permission denied') || lower.includes('permission is required')) {
    return {
      code: 'MIC_PERMISSION_DENIED',
      message: msg,
      userMessage: 'Microphone permission was denied. Please allow microphone access in your browser settings and try again.',
    };
  }
  if (lower.includes('service-not-allowed') || lower.includes('blocked')) {
    return {
      code: 'MIC_BLOCKED',
      message: msg,
      userMessage: 'Microphone access is blocked by your browser or system. Check your browser site settings.',
    };
  }
  if (lower.includes('audio-capture') || lower.includes('no audio')) {
    return {
      code: 'MIC_NOT_FOUND',
      message: msg,
      userMessage: 'No microphone detected. Please connect a microphone and try again.',
    };
  }
  if (lower.includes('network')) {
    return {
      code: 'NETWORK_ERROR',
      message: msg,
      userMessage: 'Network error during speech recognition. Check your internet connection.',
    };
  }
  if (lower.includes('https') || lower.includes('secure context')) {
    return {
      code: 'REQUIRES_HTTPS',
      message: msg,
      userMessage: 'Speech recognition requires a secure (HTTPS) connection. Please switch to HTTPS.',
    };
  }
  if (lower.includes('not available') || lower.includes('not supported')) {
    return {
      code: 'NO_BROWSER_SUPPORT',
      message: msg,
      userMessage: 'Your browser does not support speech recognition. Try Chrome or Edge for best results.',
    };
  }
  if (lower.includes('api key') || lower.includes('subscription') || lower.includes('endpoint')) {
    return {
      code: 'PROVIDER_CONFIG_MISSING',
      message: msg,
      userMessage: 'Speech provider is not configured. Check your API keys in settings.',
    };
  }
  if (lower.includes('unavailable') || lower.includes('not initialized')) {
    return {
      code: 'SERVICE_UNAVAILABLE',
      message: msg,
      userMessage: 'Speech services are temporarily unavailable. Please try again.',
    };
  }
  return {
    code: 'UNKNOWN',
    message: msg,
    userMessage: `Speech error: ${msg}`,
  };
}
