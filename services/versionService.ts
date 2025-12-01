const VERSION_KEY = 'legal_app_version';
const DEFAULT_VERSION = '1.0.0';

/**
 * Retrieves the current version from local storage or returns default.
 */
export const getStoredVersion = (): string => {
  if (typeof window === 'undefined') return DEFAULT_VERSION;
  return localStorage.getItem(VERSION_KEY) || DEFAULT_VERSION;
};

/**
 * Increments the version based on the rule: 
 * x.y.z -> z++ (max 9) -> y++ (max 9) -> x++
 * Example: 1.0.9 -> 1.1.0; 1.9.9 -> 2.0.0
 */
export const incrementVersion = (currentVersion: string): string => {
  const parts = currentVersion.split('.').map(Number);
  
  // Safety check: if version format is invalid, reset or start from default
  if (parts.length !== 3 || parts.some(isNaN)) {
      const resetVersion = '1.0.1'; 
      localStorage.setItem(VERSION_KEY, resetVersion);
      return resetVersion;
  }

  let [major, minor, patch] = parts;

  patch++;
  if (patch > 9) {
    patch = 0;
    minor++;
  }
  if (minor > 9) {
    minor = 0;
    major++;
  }

  const newVersion = `${major}.${minor}.${patch}`;
  localStorage.setItem(VERSION_KEY, newVersion);
  return newVersion;
};