import { z } from 'zod';
import { stringify, parseDocument, isMap, isSeq, isScalar } from 'yaml';

export type PropertyValue =
  | string
  | number
  | boolean
  | null
  | PropertyValue[]
  | { [key: string]: PropertyValue };
export const ITEM_LIMITS = { depth: 16, values: 5000, bytes: 524288 } as const;
export const SYSTEM_KEYS = ['entityType', 'slug', 'createdAt', 'updatedAt'] as const;
export const unsafeKey = (key: string): boolean =>
  ['__proto__', 'prototype', 'constructor'].includes(key);

/** Validate without traversing prototypes, invoking accessors, or accepting cycles. */
export function validateValues(value: unknown): void {
  const active = new Set<object>();
  let count = 0;
  function visit(v: unknown, depth: number): void {
    if (++count > ITEM_LIMITS.values) throw new Error('Item exceeds 5,000 values');
    if (v === null || typeof v === 'string' || typeof v === 'boolean') return;
    if (typeof v === 'number') {
      if (!Number.isFinite(v) || (Number.isInteger(v) && !Number.isSafeInteger(v))) {
        throw new Error(
          'Numbers must be finite; integers must be safe. Store exact identifiers as text.'
        );
      }
      return;
    }
    if (typeof v !== 'object') throw new Error('Unsupported property value');
    if (depth > ITEM_LIMITS.depth) throw new Error('Item exceeds 16 container levels');
    if (active.has(v)) throw new Error('Cyclic values are unsupported');
    if (
      !Array.isArray(v) &&
      Object.getPrototypeOf(v) !== Object.prototype &&
      Object.getPrototypeOf(v) !== null
    ) {
      throw new Error('Only plain mappings and lists are supported');
    }
    if (Object.getOwnPropertySymbols(v).length)
      throw new Error('Symbol properties are unsupported');
    active.add(v);
    for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(v))) {
      if (Array.isArray(v) && key === 'length') continue;
      if (unsafeKey(key) || !('value' in descriptor) || !descriptor.enumerable)
        throw new Error(`Unsafe property: ${key}`);
      if (Array.isArray(v) && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= v.length))
        throw new Error('Lists may only contain indexed entries');
      visit(descriptor.value, depth + 1);
    }
    if (Array.isArray(v) && Object.keys(v).length !== v.length)
      throw new Error('Sparse lists are unsupported');
    active.delete(v);
  }
  visit(value, 1);
}

export const PropertyValueSchema = z.custom<PropertyValue>((value) => {
  try {
    validateValues(value);
    return true;
  } catch {
    return false;
  }
}, 'Unsupported, unsafe, or oversized property value');

export function utf8Bytes(text: string): number {
  let bytes = 0;
  for (const char of text) {
    const code = char.codePointAt(0)!;
    bytes += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4;
  }
  return bytes;
}

export function itemYaml(item: Record<string, unknown>): string {
  const { body: _body, ...properties } = item;
  return stringify(properties, {
    defaultStringType: 'QUOTE_DOUBLE',
    defaultKeyType: 'PLAIN',
    aliasDuplicateObjects: false,
    lineWidth: 0,
  });
}
export function itemMarkdown(item: Record<string, unknown>): string {
  return `---\n${itemYaml(item)}---\n${typeof item.body === 'string' ? item.body : ''}`;
}
export function validateItemBounds(item: Record<string, unknown>): void {
  validateValues(item);
  if (utf8Bytes(itemMarkdown(item)) > ITEM_LIMITS.bytes) {
    throw new Error('Item Markdown exceeds 512 KiB');
  }
}

/** Parse numeric source tokens before JS conversion can round unsafe integers. */
export function parseSafeYaml(
  source: string,
  store: boolean | 'transport' = false
): Record<string, unknown> {
  const doc = parseDocument(source, { schema: 'core', uniqueKeys: true });
  if (doc.errors.length || doc.warnings.length)
    throw new Error((doc.errors[0] ?? doc.warnings[0])!.message);
  let count = 0;
  function inspect(node: unknown, depth: number): void {
    if (
      ++count > (store ? 1000000 : ITEM_LIMITS.values) ||
      depth > (store === 'transport' ? 64 : ITEM_LIMITS.depth + (store ? 2 : 1))
    )
      throw new Error('Source exceeds item bounds');
    if (isScalar(node)) {
      if (typeof node.value === 'number') {
        if (
          !Number.isFinite(node.value) ||
          (Number.isInteger(node.value) && !Number.isSafeInteger(node.value))
        ) {
          throw new Error('Unsafe numeric source; quote exact identifiers');
        }
        // A decimal integer literal may round to a safe integer (e.g. 9007199254740991.1).
        const token = node.source ?? '';
        if (Number.isInteger(node.value) && /^[+-]?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(token)) {
          const [mantissa = '', exponent = '0'] = token.toLowerCase().split('e');
          const fraction = mantissa.split('.')[1]?.length ?? 0;
          const digits = mantissa.replace('.', '').replace(/^\+/, '');
          const shift = Number(exponent) - fraction;
          if (Math.abs(shift) > 10000) throw new Error('Numeric source exponent is too large');
          const magnitude = BigInt(digits.replace(/^-/, ''));
          const limit = BigInt(Number.MAX_SAFE_INTEGER);
          if (
            (shift < 0 && magnitude > limit * 10n ** BigInt(-shift)) ||
            (shift >= 0 && magnitude * 10n ** BigInt(shift) > limit)
          )
            throw new Error('Unsafe numeric source; quote exact identifiers');
        }
      }
    } else if (isMap(node)) {
      for (const pair of node.items) {
        if (!isScalar(pair.key) || typeof pair.key.value !== 'string')
          throw new Error('Mapping keys must be text');
        if (unsafeKey(pair.key.value)) throw new Error(`Unsafe property: ${pair.key.value}`);
        inspect(pair.value, depth + 1);
      }
    } else if (isSeq(node)) {
      for (const child of node.items) inspect(child, depth + 1);
    } else if (node !== null && node !== undefined) throw new Error('YAML aliases are unsupported');
  }
  inspect(doc.contents, 1);
  const value: unknown = doc.toJS({ maxAliasCount: 0 });
  if (!store) validateValues(value);
  else if (store === true && value && typeof value === 'object')
    Object.values(value).forEach(validateValues);
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Frontmatter must be a mapping');
  return value as Record<string, unknown>;
}

export function itemLabel(item: { slug: string; [key: string]: unknown }): string {
  return typeof item.title === 'string' && item.title.trim() ? item.title : item.slug;
}
