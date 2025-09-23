/**
 * Model Migration Utilities
 * 
 * This file contains utilities to handle model selection migrations
 * and ensure proper defaults are applied.
 */

/**
 * Clear all cached model selections to force defaults
 * This can be called from browser console if needed: clearAllModelCache()
 */
export function clearAllModelCache(): void {
  const modelKeys = [
    'lmstudio-selected-model',
    'azure-ai-selected-model', 
    'openai-selected-model',
    'gemini-selected-model',
    'hf-selected-model'
  ];
  
  console.log('🧹 Clearing all cached model selections...');
  modelKeys.forEach(key => {
    const cached = localStorage.getItem(key);
    if (cached) {
      console.log(`  - Removed: ${key}`);
      localStorage.removeItem(key);
    }
  });
  
  console.log('✅ Model cache cleared. Refresh the page to see defaults.');
}

/**
 * Force reset LM Studio to nomadic-icdu-v8 default
 */
export function resetLMStudioDefault(): void {
  console.log('🔄 Forcing LM Studio reset to nomadic-icdu-v8...');
  localStorage.removeItem('lmstudio-selected-model');
  localStorage.removeItem('lmstudio-model-migration-v1'); // Reset migration flag
  console.log('✅ LM Studio reset. Refresh the page to see nomadic-icdu-v8 default.');
}

/**
 * Check current cached model selections
 */
export function checkCurrentModelCache(): void {
  const modelKeys = [
    'lmstudio-selected-model',
    'azure-ai-selected-model', 
    'openai-selected-model',
    'gemini-selected-model',
    'hf-selected-model'
  ];
  
  console.log('📋 Current cached model selections:');
  modelKeys.forEach(key => {
    const cached = localStorage.getItem(key);
    if (cached) {
      try {
        const model = JSON.parse(cached);
        console.log(`  - ${key}: ${model.name} (${model.id})`);
      } catch {
        console.log(`  - ${key}: [Invalid JSON]`);
      }
    } else {
      console.log(`  - ${key}: [Not set]`);
    }
  });
}

// Make functions available globally for debugging
if (typeof window !== 'undefined') {
  (window as any).clearAllModelCache = clearAllModelCache;
  (window as any).resetLMStudioDefault = resetLMStudioDefault;
  (window as any).checkCurrentModelCache = checkCurrentModelCache;
}
