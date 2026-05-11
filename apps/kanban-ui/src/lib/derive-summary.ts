/**
 * Derives a plain-text summary from a markdown body string.
 *
 * Returns the first non-empty, non-heading line of the body with inline
 * markdown (images, links, bold, italic, code spans) stripped to plain text.
 * Returns an empty string if no such line exists.
 */
export function deriveSummary(body: string): string {
  const lines = body.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    let cleaned = trimmed;
    // Remove images: ![alt](url)
    cleaned = cleaned.replace(/!\[([^\]]*)\]\([^)]*\)/g, '');
    // Convert links: [text](url) → text
    cleaned = cleaned.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
    // Remove bold/italic/code markers
    cleaned = cleaned.replace(/\*\*|__|\*|_|`/g, '');
    const result = cleaned.trim();
    if (result !== '') return result;
  }
  return '';
}
