// Canonical entity Markdown uses the same isomorphic YAML rules as item exports.

import {
  AxisSchema,
  BoardSchema,
  ItemSchema,
  itemMarkdown,
  parseSafeYaml,
  ITEM_LIMITS,
  utf8Bytes,
} from '@awesome-markdown/contracts';
import type { Axis, Board, Item } from '@awesome-markdown/contracts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Entity = Item | Board | Axis;

export type ParsedEntity =
  | { entityType: 'item'; slug: string; data: Item }
  | { entityType: 'board'; slug: string; data: Board }
  | { entityType: 'axis'; slug: string; data: Axis };

/**
 * Why a markdown document did not yield an entity:
 * - `frontmatter` — the frontmatter block could not be parsed
 * - `no_entity_type` — no `entityType` key (not an awesome-markdown entity)
 * - `invalid` — Zod validation against the entity schema failed
 * - `unknown_entity_type` — `entityType` is not `item | board | axis`
 */
export type ParseEntityFailure =
  | 'frontmatter'
  | 'no_entity_type'
  | 'invalid'
  | 'unknown_entity_type';

export type ParseEntityResult =
  | { ok: true; entity: ParsedEntity }
  | {
      ok: false;
      reason: ParseEntityFailure;
      message: string;
      /** Set for `invalid`: the entity type whose schema rejected the document. */
      entityType?: ParsedEntity['entityType'];
      cause?: unknown;
    };

// ---------------------------------------------------------------------------
// Serialize
// ---------------------------------------------------------------------------

/**
 * Serialize an entity to canonical markdown-with-frontmatter.
 *
 * Items: everything except `body` goes into frontmatter; `body` becomes the
 * markdown content. Boards and axes: the whole entity is frontmatter with an
 * empty content section.
 */
export function serializeEntity(entity: Entity): string {
  if (entity.entityType === 'item') ItemSchema.parse(entity);
  return itemMarkdown(entity);
}

// ---------------------------------------------------------------------------
// Parse
// ---------------------------------------------------------------------------

function invalid(entityType: ParsedEntity['entityType'], message: string): ParseEntityResult {
  return { ok: false, reason: 'invalid', message, entityType };
}

/**
 * Parse a markdown document into a validated entity, reporting why it was
 * rejected otherwise. Item `body` is the exact Markdown content; board and
 * axis content sections are ignored.
 */
export function parseEntityResult(markdown: string): ParseEntityResult {
  let parsed: { data: Record<string, unknown>; content: string };
  try {
    if (utf8Bytes(markdown) > ITEM_LIMITS.bytes) throw new Error('Document exceeds 512 KiB');
    const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(markdown);
    if (!match) return { ok: false, reason: 'no_entity_type', message: 'Missing frontmatter' };
    parsed = { data: parseSafeYaml(match[1]!), content: markdown.slice(match[0].length) };
  } catch (err) {
    return { ok: false, reason: 'frontmatter', message: 'Failed to parse frontmatter', cause: err };
  }

  const entityType = parsed.data['entityType'];
  if (entityType === undefined || entityType === null) {
    return { ok: false, reason: 'no_entity_type', message: 'Missing entityType' };
  }

  if (entityType === 'item') {
    if (Object.hasOwn(parsed.data, 'body'))
      return invalid(
        'item',
        'Frontmatter body collides with document content; move it into the Markdown document'
      );
    const body = parsed.content;
    const result = ItemSchema.safeParse({ ...parsed.data, body });
    if (!result.success) return invalid('item', result.error.message);
    return { ok: true, entity: { entityType: 'item', slug: result.data.slug, data: result.data } };
  }

  if (entityType === 'board') {
    const result = BoardSchema.safeParse(parsed.data);
    if (!result.success) return invalid('board', result.error.message);
    return { ok: true, entity: { entityType: 'board', slug: result.data.slug, data: result.data } };
  }

  if (entityType === 'axis') {
    const result = AxisSchema.safeParse(parsed.data);
    if (!result.success) return invalid('axis', result.error.message);
    return { ok: true, entity: { entityType: 'axis', slug: result.data.slug, data: result.data } };
  }

  return {
    ok: false,
    reason: 'unknown_entity_type',
    message: `Unknown entityType ${String(entityType)}`,
  };
}

/**
 * Parse a markdown document into a validated entity, or `null`.
 *
 * Malformed frontmatter and schema violations are logged with
 * `console.warn` (naming `filePathForLogs` when given); documents without an
 * `entityType`, or with an unknown one, are silently ignored.
 */
export function parseEntity(markdown: string, filePathForLogs?: string): ParsedEntity | null {
  const result = parseEntityResult(markdown);
  if (result.ok) return result.entity;
  const where = filePathForLogs ?? '<markdown>';
  if (result.reason === 'frontmatter') {
    console.warn(`[parseEntity] Failed to parse frontmatter in ${where}:`, result.cause);
  } else if (result.reason === 'invalid') {
    console.warn(
      `[parseEntity] Invalid ${result.entityType ?? 'entity'} at ${where}:`,
      result.message
    );
  }
  return null;
}
