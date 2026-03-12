/**
 * Centralized feature flag for vectorization.
 *
 * Disable vectorization by setting any of these env vars:
 * - VECTORIZATION_DISABLED=true
 * - DISABLE_VECTORIZATION=true
 * - VECTORS_ENABLED=false
 * - ENABLE_VECTORIZATION=false
 *
 * Default: disabled (returns false) to fail-safe if unset.
 */
export function isVectorizationEnabled(): boolean {
  try {
    const env = process.env || {} as any;

    const disabledRaw = String(env.VECTORIZATION_DISABLED || env.DISABLE_VECTORIZATION || '').toLowerCase();
    if (disabledRaw === '1' || disabledRaw === 'true' || disabledRaw === 'yes') return false;

    const enabledRaw = String(env.VECTORS_ENABLED || env.ENABLE_VECTORIZATION || '').toLowerCase();
    if (enabledRaw === '1' || enabledRaw === 'true' || enabledRaw === 'yes') return true;
    if (enabledRaw === '0' || enabledRaw === 'false' || enabledRaw === 'no') return false;

    // Default: off unless explicitly enabled
    return false;
  } catch {
    return false;
  }
}


