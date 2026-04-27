/**
 * Validates that a string is a valid http or https URL.
 * Returns the trimmed URL on success, or null on failure.
 */
export function validateUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return trimmed;
  } catch {
    return null;
  }
}

/**
 * Returns a human-readable validation message, or null if valid.
 */
export function urlValidationMessage(raw: string): string | null {
  if (!raw.trim()) return 'URL is required';
  const valid = validateUrl(raw);
  if (valid === null) return 'Must be a valid http:// or https:// URL';
  return null;
}
