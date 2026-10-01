import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Axis, Board, Item } from '@awesome-markdown/contracts';
import { parseEntity, parseEntityResult, serializeEntity } from '../src/markdown.js';

const T = '2024-01-01T00:00:00.000Z';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('serializeEntity', () => {
  it('writes item body as markdown content, not frontmatter', () => {
    const item: Item = { entityType: 'item', slug: 'i', title: 'I', body: 'Hello', createdAt: T, updatedAt: T };
    const md = serializeEntity(item);
    expect(md.startsWith('---\nentityType: item\n')).toBe(true);
    expect(md).not.toMatch(/^body:/m);
    expect(md.endsWith('---\nHello\n')).toBe(true);
  });

  it('writes boards and axes as frontmatter with empty content', () => {
    const board: Board = { entityType: 'board', slug: 'b', title: 'B', columns: ['c'], createdAt: T, updatedAt: T };
    expect(serializeEntity(board)).toMatch(/^---\n[\s\S]*\ncolumns:\n {2}- c\n[\s\S]*---\n\n$/);
    const axis: Axis = { entityType: 'axis', slug: 'a', title: 'A', filter: { property: 's', equals: 'x' } };
    expect(serializeEntity(axis).endsWith('---\n\n')).toBe(true);
  });
});

describe('parseEntity / parseEntityResult', () => {
  it('round-trips items, boards and axes', () => {
    const item: Item = {
      entityType: 'item', slug: 'i', title: 'I', body: 'Body text', createdAt: T, updatedAt: T,
      status: 'todo', boards: [{ board: 'b', order: 'a0' }],
    };
    const board: Board = { entityType: 'board', slug: 'b', title: 'B', columns: ['a'], createdAt: T, updatedAt: T };
    const axis: Axis = { entityType: 'axis', slug: 'a', title: 'A', order: { by: 'boards.$board.order', direction: 'asc' } };
    expect(parseEntity(serializeEntity(item))).toEqual({ entityType: 'item', slug: 'i', data: item });
    expect(parseEntity(serializeEntity(board))).toEqual({ entityType: 'board', slug: 'b', data: board });
    expect(parseEntity(serializeEntity(axis))).toEqual({ entityType: 'axis', slug: 'a', data: axis });
  });

  it('trims item bodies and ignores board content', () => {
    const item = parseEntity(`---\nentityType: item\nslug: i\ntitle: I\ncreatedAt: '${T}'\nupdatedAt: '${T}'\n---\n\n  text  \n\n`);
    expect(item?.entityType === 'item' && item.data.body).toBe('text');
    const board = parseEntity(`---\nentityType: board\nslug: b\ntitle: B\ncreatedAt: '${T}'\nupdatedAt: '${T}'\n---\nprose\n`);
    expect(board?.data).not.toHaveProperty('body');
  });

  it('reports no_entity_type silently', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(parseEntityResult('---\ntitle: x\n---\n')).toMatchObject({ ok: false, reason: 'no_entity_type' });
    expect(parseEntity('# just markdown')).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  it('reports unknown_entity_type silently', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(parseEntityResult('---\nentityType: widget\n---\n')).toMatchObject({ ok: false, reason: 'unknown_entity_type' });
    expect(parseEntity('---\nentityType: widget\n---\n')).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  it('reports invalid entities and logs them with the source path', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const md = '---\nentityType: item\nslug: i\n---\n';
    expect(parseEntityResult(md)).toMatchObject({ ok: false, reason: 'invalid', entityType: 'item' });
    expect(parseEntity(md, 'content/i.md')).toBeNull();
    expect(warn).toHaveBeenCalledWith('[parseEntity] Invalid item at content/i.md:', expect.any(String));
  });

  it('reports unparseable frontmatter and logs it', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Distinct inputs: gray-matter caches by input string, even on failure.
    expect(parseEntityResult('---\nslug: [unclosed\n---\n')).toMatchObject({ ok: false, reason: 'frontmatter' });
    expect(parseEntity('---\nentityType: item\nslug: [unclosed\n---\n', 'bad.md')).toBeNull();
    expect(warn).toHaveBeenCalledWith('[parseEntity] Failed to parse frontmatter in bad.md:', expect.anything());
  });
});
