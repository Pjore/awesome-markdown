import { dump, load, JSON_SCHEMA } from 'js-yaml';
import {
  ItemSchema,
  PatchItemRequestSchema,
  type Item,
  type Mutation,
} from '@awesome-markdown/contracts';
import { joinPath } from '@awesome-markdown/filter-engine';

export function serializeFrontmatter(item: Item): string {
  const { body: _body, ...metadata } = item;
  return dump(metadata, { schema: JSON_SCHEMA, noRefs: true, lineWidth: -1 });
}

export function parseFrontmatter(source: string, original: Item): Item {
  // Accept a pasted frontmatter block as well as plain YAML, but never a body.
  const yaml = source
    .trim()
    .replace(/^---\r?\n/, '')
    .replace(/\r?\n(?:---|\.\.\.)$/, '');
  const data: unknown = load(yaml, { schema: JSON_SCHEMA });
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Frontmatter must be a YAML mapping.');
  }
  if (Object.hasOwn(data, 'body')) {
    throw new Error('Edit the markdown body in the description field, not in frontmatter.');
  }
  const parsed = ItemSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(
      parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('\n')
    );
  }
  if (parsed.data.slug !== original.slug) throw new Error('The item slug cannot be changed here.');
  if (!parsed.data.title.trim()) throw new Error('Title cannot be empty.');
  // Validate all property values and paths before allowing a save or mode switch.
  frontmatterMutations(original, parsed.data);
  return parsed.data;
}

export function frontmatterMutations(original: Item, next: Item): Mutation[] {
  const mutations: unknown[] = [];
  for (const key of new Set([...Object.keys(original), ...Object.keys(next)])) {
    if (key === 'body' || key === 'updatedAt') continue;
    if (JSON.stringify(original[key]) === JSON.stringify(next[key])) continue;
    if (['__proto__', 'constructor', 'prototype'].includes(key)) {
      throw new Error(`Cannot edit reserved property: ${key}`);
    }
    const path = joinPath([key]);
    mutations.push(
      Object.hasOwn(next, key) ? { op: 'set', path, value: next[key] } : { op: 'delete', path }
    );
  }
  if (mutations.length === 0) return [];
  const result = PatchItemRequestSchema.safeParse({ mutations });
  if (!result.success)
    throw new Error('Frontmatter properties must have valid names and JSON-compatible values.');
  return result.data.mutations;
}
