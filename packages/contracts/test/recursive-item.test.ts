import { describe, it, expect } from 'vitest';
import {
  ItemSchema,
  MutationSchema,
  itemMarkdown,
  itemYaml,
  parseSafeYaml,
  utf8Bytes,
  validateValues,
  itemLabel,
} from '../src/index.js';

const metadata = {
  entityType: 'item',
  slug: 'test',
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
};

describe('recursive item contract', () => {
  it('accepts metadata-only and heterogeneous properties without name-based schemas', () => {
    expect(ItemSchema.parse(metadata)).toEqual(metadata);
    const item = {
      ...metadata,
      title: { title: null },
      boards: false,
      order: 0,
      axes: ['003', 3, false, 'false', '', null, {}, [], { slug: 'editable', body: 'nested' }],
      body: ' document\n',
    };
    expect(ItemSchema.parse(item)).toEqual(item);
    expect(itemLabel(item)).toBe('test');
    expect(itemLabel({ ...item, title: '  ' })).toBe('test');
    expect(itemLabel({ ...item, title: 'A title' })).toBe('A title');
  });
  it('preserves root property insertion order rather than grouping metadata first', () => {
    const source = { first: null, title: '', ...metadata, last: [] };
    expect(Object.keys(ItemSchema.parse(source))).toEqual(Object.keys(source));
  });
  it.each([NaN, Infinity, -Infinity, 9007199254740992, undefined, new Date(), new Map()])(
    'rejects unsupported property %s',
    (value) => {
      expect(ItemSchema.safeParse({ ...metadata, value }).success).toBe(false);
    }
  );
  it('rejects unsafe names, accessors and cycles without executing them', () => {
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    expect(ItemSchema.safeParse({ ...metadata, cycle }).success).toBe(false);
    for (const key of ['__proto__', 'prototype', 'constructor']) {
      expect(
        ItemSchema.safeParse(
          JSON.parse(
            `{"entityType":"item","slug":"test","createdAt":"x","updatedAt":"x","${key}":1}`
          )
        ).success
      ).toBe(false);
      expect(MutationSchema.safeParse({ op: 'set', path: ['safe', key], value: 1 }).success).toBe(
        false
      );
    }
    let called = false;
    const input = Object.defineProperty({ ...metadata }, 'hidden', {
      enumerable: true,
      get() {
        called = true;
        return 1;
      },
    });
    expect(ItemSchema.safeParse(input).success).toBe(false);
    expect(called).toBe(false);
  });
  it('enforces exactly 16 container levels', () => {
    let nested: unknown = 'leaf';
    for (let i = 0; i < 15; i++) nested = { child: nested };
    expect(() => validateValues({ nested })).not.toThrow();
    expect(() => validateValues({ nested: { child: nested } })).toThrow(/16/);
  });
  it('counts each container and scalar once, including metadata and API body', () => {
    const item = { ...metadata, body: '', values: Array(4993).fill(null) };
    expect(ItemSchema.safeParse(item).success).toBe(true); // root + 4 metadata + body + list + 4993
    expect(ItemSchema.safeParse({ ...item, values: [...item.values, null] }).success).toBe(false);
  });
  it('enforces UTF-8 bytes at and over 512 KiB, including multibyte text', () => {
    const base = { ...metadata, body: '' };
    const available = 524288 - utf8Bytes(itemMarkdown(base));
    const item = {
      ...base,
      body: 'é'.repeat(Math.floor(available / 2)) + 'x'.repeat(available % 2),
    };
    expect(utf8Bytes(itemMarkdown(item))).toBe(524288);
    expect(ItemSchema.safeParse(item).success).toBe(true);
    expect(ItemSchema.safeParse({ ...item, body: `${item.body}x` }).success).toBe(false);
  });
  it('quotes keys/text, preserves dates, decimals, empties and order, excludes body from YAML', () => {
    const item = {
      ...metadata,
      'a.b\\c': ['003', false, null, {}, [], 0.1, '2026-01-01', 'line\nnext'],
      body: 'markdown',
    };
    const { body: _body, ...properties } = item;
    expect(parseSafeYaml(itemYaml(item))).toEqual(properties);
    expect(Object.keys(parseSafeYaml(itemYaml(item)))).toEqual(Object.keys(properties));
    expect(itemYaml(item)).not.toContain('markdown');
  });
  it.each(['9007199254740993', '9007199254740991.1', '1e100', '.inf', '.nan'])(
    'rejects unsafe numeric source %s before conversion',
    (literal) => {
      expect(() => parseSafeYaml(`value: ${literal}`)).toThrow();
    }
  );
  it('rejects aliases and duplicate keys instead of normalizing existing source', () => {
    expect(() => parseSafeYaml('a: 1\na: 2')).toThrow();
    expect(() => parseSafeYaml('a: &a [1]\nb: *a')).toThrow();
    expect(parseSafeYaml('a: 0.1\nb: "9007199254740993"')).toEqual({
      a: 0.1,
      b: '9007199254740993',
    });
  });
});
