import { describe, expect, it } from 'vitest';
import type { Item } from '@awesome-markdown/contracts';
import {
  frontmatterMutations,
  parseFrontmatter,
  serializeFrontmatter,
} from '../src/lib/item-frontmatter.js';

const item: Item = {
  entityType: 'item',
  slug: 'task',
  title: 'Task',
  body: 'Markdown body',
  createdAt: '2026-01-01',
  updatedAt: '2026-01-02',
  tags: ['one', 'two'],
  custom: { enabled: true, nested: { value: null } },
  boards: [{ board: 'dev', order: 'a0', assignee: 'alice', custom: ['x'] }],
};

describe('item frontmatter', () => {
  it('round-trips full metadata without including the body or coercing dates', () => {
    const yaml = serializeFrontmatter(item);
    expect(yaml).not.toContain('Markdown body');
    const { body: _body, ...metadata } = item;
    expect(parseFrontmatter(yaml, item)).toEqual(metadata);
    expect(frontmatterMutations(item, parseFrontmatter(yaml, item))).toEqual([]);
    expect(parseFrontmatter(`---\n${yaml}---`, item)).toEqual(metadata);
  });

  it('sets nested values atomically, deletes removed keys and escapes dotted keys', () => {
    const { tags: _tags, ...next } = item;
    const changes = frontmatterMutations(item, {
      ...next,
      custom: { score: 2, choices: [false, null, 'yes'] },
      boards: [{ board: 'other', assignee: 'bob' }],
      'a.b': [1, 2],
    });
    expect(changes).toEqual([
      { op: 'delete', path: 'tags' },
      { op: 'set', path: 'custom', value: { score: 2, choices: [false, null, 'yes'] } },
      { op: 'set', path: 'boards', value: [{ board: 'other', assignee: 'bob' }] },
      { op: 'set', path: 'a\\.b', value: [1, 2] },
    ]);
  });

  it.each(['[not: a mapping]', 'null', 'title: [broken', 'title: x\ntitle: y'])(
    'rejects invalid YAML or mappings: %s',
    (source) => {
      expect(() => parseFrontmatter(source, item)).toThrow();
    }
  );

  it.each([
    { slug: 'renamed' },
    { entityType: 'board' },
    { title: '' },
    { title: '   ' },
    { boards: [{ missing: 'board' }] },
    { body: 'wrong field' },
  ])('rejects invalid item metadata: %j', (change) => {
    expect(() =>
      parseFrontmatter(
        serializeFrontmatter({ ...item, ...change } as Item) +
          (Object.hasOwn(change, 'body') ? '\nbody: wrong field' : ''),
        item
      )
    ).toThrow();
  });

  it('rejects non-JSON values and reserved mutation keys', () => {
    expect(() => parseFrontmatter(serializeFrontmatter(item) + '\nvalue: .inf', item)).toThrow();
    expect(() =>
      parseFrontmatter(serializeFrontmatter(item) + '\nconstructor: unsafe', item)
    ).toThrow();
    expect(() =>
      parseFrontmatter(serializeFrontmatter(item) + '\nvalue: &loop [*loop]', item)
    ).toThrow();
  });

  it('leaves updatedAt to the provider', () => {
    expect(frontmatterMutations(item, { ...item, updatedAt: 'user value' })).toEqual([]);
  });
});
