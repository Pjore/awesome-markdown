/**
 * @deprecated Seed helpers were written against the old PersistenceProvider API.
 * The new provider uses slug-based entities; these seeds need to be rewritten
 * for the markdown-driven domain milestone (M5+). Kept as a stub for now.
 *
 * See: ai-docs/markdown-driven-domain-milestone-5-kanban-ui.md
 */
export async function seedM3(_provider: unknown): Promise<void> {
  console.warn('seedM3: not implemented for new provider API');
}
