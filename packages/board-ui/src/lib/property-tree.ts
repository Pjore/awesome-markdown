import { SYSTEM_KEYS, unsafeKey, parseSafeYaml } from '@awesome-markdown/contracts';
import type { Item, PropertyValue, Mutation } from '@awesome-markdown/contracts';

export type ValueType = 'text' | 'number' | 'boolean' | 'null' | 'group' | 'list';
export interface ValueNode {
  id: string;
  type: ValueType;
  text: string;
  checked: boolean;
  entries: { key: string; node: ValueNode }[];
}
let sequence = 0;
export const protectedRoot = (key: string): boolean =>
  key === 'body' || SYSTEM_KEYS.some((k) => k === key);
export function valueNode(value: PropertyValue): ValueNode {
  const node: ValueNode = {
    id: `property-${++sequence}`,
    type: 'null',
    text: '',
    checked: false,
    entries: [],
  };
  if (typeof value === 'string') {
    node.type = 'text';
    node.text = value;
  } else if (typeof value === 'number') {
    node.type = 'number';
    node.text = String(value);
  } else if (typeof value === 'boolean') {
    node.type = 'boolean';
    node.checked = value;
  } else if (value !== null) {
    node.type = Array.isArray(value) ? 'list' : 'group';
    node.entries = Object.entries(value).map(([key, child]) => ({ key, node: valueNode(child) }));
  }
  return node;
}
export function defaultNode(type: ValueType): ValueNode {
  const values: Record<ValueType, PropertyValue> = {
    text: '',
    number: 0,
    boolean: false,
    null: null,
    group: {},
    list: [],
  };
  return valueNode(values[type]);
}
export function propertiesNode(item: Item): ValueNode {
  return valueNode(Object.fromEntries(Object.entries(item).filter(([key]) => !protectedRoot(key))));
}
export function numericValue(text: string): number {
  if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text.trim()))
    throw new Error('Complete the number before saving or exporting.');
  const number = Number(text);
  if (!Number.isFinite(number) || (Number.isInteger(number) && !Number.isSafeInteger(number)))
    throw new Error('Use a finite number and safe integer, or store this value as text.');
  parseSafeYaml(`value: ${text.trim()}`);
  return number;
}
export function nodeValue(node: ValueNode): PropertyValue {
  switch (node.type) {
    case 'text':
      return node.text;
    case 'number':
      return numericValue(node.text);
    case 'boolean':
      return node.checked;
    case 'null':
      return null;
    case 'list':
      return node.entries.map((entry) => nodeValue(entry.node));
    case 'group':
      return Object.fromEntries(node.entries.map((entry) => [entry.key, nodeValue(entry.node)]));
  }
}
export function updateNode(
  root: ValueNode,
  id: string,
  change: (node: ValueNode) => ValueNode
): ValueNode {
  if (root.id === id) return change(root);
  return {
    ...root,
    entries: root.entries.map((entry) => ({ ...entry, node: updateNode(entry.node, id, change) })),
  };
}
export function validName(name: string, parent: ValueNode, root: boolean): string {
  const key = name.trim();
  if (!key || unsafeKey(key) || (root && protectedRoot(key)))
    throw new Error('Choose a nonblank, safe property name; root metadata and body are reserved.');
  if (parent.entries.some((entry) => entry.key === key))
    throw new Error('A property with this name already exists here.');
  return key;
}
export function draftItem(item: Item, properties: ValueNode, body: string): Item {
  const data = nodeValue(properties) as Record<string, PropertyValue>;
  // Preserve the entry snapshot's root order, replacing values without renaming keys.
  const result = Object.fromEntries(
    Object.entries(item).filter(([key]) => protectedRoot(key) || Object.hasOwn(data, key))
  ) as Item;
  for (const [key, value] of Object.entries(data)) result[key] = value;
  if (body !== (item.body ?? '') || Object.hasOwn(item, 'body')) result.body = body;
  return result;
}
export function draftMutations(before: Item, after: Item): Mutation[] {
  const mutations: Mutation[] = [];
  for (const key of Object.keys(before)) {
    if (!protectedRoot(key) && !Object.hasOwn(after, key))
      mutations.push({ op: 'delete', path: [key] });
  }
  for (const [key, value] of Object.entries(after)) {
    if (SYSTEM_KEYS.some((k) => k === key)) continue;
    if (JSON.stringify(value) !== JSON.stringify(before[key]))
      mutations.push({ op: 'set', path: [key], value });
  }
  return mutations;
}
