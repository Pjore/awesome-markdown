import { useState } from 'react';
import type { Item, Mutation } from '@awesome-markdown/contracts';
import { getBoardScopedString } from '../lib/item-board.js';
import {
  frontmatterMutations,
  parseFrontmatter,
  serializeFrontmatter,
} from '../lib/item-frontmatter.js';

export function useItemEditorDraft(boardSlug?: string) {
  const [metadata, setMetadata] = useState<Item | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [assignee, setAssignee] = useState('');
  const [rawMode, setRawMode] = useState(false);
  const [raw, setRaw] = useState('');

  function reset(item: Item): void {
    setMetadata(item);
    setTitle(item.title);
    setBody(item.body ?? '');
    setAssignee(boardSlug ? getBoardScopedString(item, boardSlug, 'assignee') : '');
    setRaw(serializeFrontmatter(item));
  }

  function fromFields(): Item {
    if (!metadata) throw new Error('Item has not loaded.');
    const next = { ...metadata, title: title.trim() };
    if (!next.title) throw new Error('Title cannot be empty.');
    if (boardSlug && assignee.trim() !== getBoardScopedString(metadata, boardSlug, 'assignee')) {
      const boards = (metadata.boards ?? []).map((entry) => ({ ...entry }));
      let entry = boards.find((entry) => entry.board === boardSlug);
      if (!entry) {
        entry = { board: boardSlug };
        boards.push(entry);
      }
      if (assignee.trim()) entry.assignee = assignee.trim();
      else delete entry.assignee;
      next.boards = boards;
    }
    return next;
  }

  function toggleMode(): void {
    if (!metadata) return;
    if (rawMode) {
      const parsed = parseFrontmatter(raw, metadata);
      setMetadata(parsed);
      setTitle(parsed.title);
      setAssignee(boardSlug ? getBoardScopedString(parsed, boardSlug, 'assignee') : '');
    } else {
      setRaw(serializeFrontmatter(fromFields()));
    }
    setRawMode(!rawMode);
  }

  function mutations(original: Item): Mutation[] {
    const next = rawMode ? parseFrontmatter(raw, original) : fromFields();
    const changes = frontmatterMutations(original, next);
    if (body !== (original.body ?? '')) changes.push({ op: 'set', path: 'body', value: body });
    return changes;
  }

  return {
    title,
    setTitle,
    body,
    setBody,
    assignee,
    setAssignee,
    rawMode,
    raw,
    setRaw,
    reset,
    toggleMode,
    mutations,
  };
}
