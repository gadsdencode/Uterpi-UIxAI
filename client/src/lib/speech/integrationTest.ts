// Browser console integration test for MRecordRTC audio recording

import { runAudioRecordingTests } from './testAudioRecording';

// Make the test function available globally for browser console testing
declare global {
  interface Window {
    testAudioRecording: () => Promise<void>;
  }
}

// Add to window object for browser console access
if (typeof window !== 'undefined') {
  window.testAudioRecording = runAudioRecordingTests;
}

export { runAudioRecordingTests };
