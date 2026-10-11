import React, { useMemo } from 'react';
import { diffLines } from 'diff';
import type { Change } from 'diff';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConflictDiffProps {
  /** Repo-relative file path — used to derive the root data-testid. */
  path: string;
  oursLabel: string;
  theirsLabel: string;
  oursContent: string;
  theirsContent: string;
  oursTruncated: boolean;
  theirsTruncated: boolean;
}

type RowKind = 'equal' | 'removed' | 'added' | 'changed';

interface DiffRow {
  oursLine: string | null;
  theirsLine: string | null;
  oursLineNum: number | null;
  theirsLineNum: number | null;
  kind: RowKind;
}

// ---------------------------------------------------------------------------
// Row-building helpers
// ---------------------------------------------------------------------------

function splitLines(text: string): string[] {
  const lines = text.split('\n');
  // drop trailing empty string caused by a terminal newline
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

function buildRows(oursContent: string, theirsContent: string): DiffRow[] {
  const changes: Change[] = diffLines(oursContent, theirsContent);
  const raw: Array<{ oursLine: string | null; theirsLine: string | null; kind: RowKind }> = [];

  let i = 0;
  while (i < changes.length) {
    const chunk = changes[i]!;

    if (!chunk.added && !chunk.removed) {
      // Equal chunk — both sides advance
      for (const line of splitLines(chunk.value)) {
        raw.push({ oursLine: line, theirsLine: line, kind: 'equal' });
      }
      i++;
    } else if (chunk.removed) {
      const next = changes[i + 1];
      const oursLines = splitLines(chunk.value);

      if (next?.added) {
        // Paired remove + add: zip and pad the shorter side
        const theirsLines = splitLines(next.value);
        const maxLen = Math.max(oursLines.length, theirsLines.length);
        for (let j = 0; j < maxLen; j++) {
          const oursLine = j < oursLines.length ? (oursLines[j] ?? null) : null;
          const theirsLine = j < theirsLines.length ? (theirsLines[j] ?? null) : null;
          const kind: RowKind =
            oursLine !== null && theirsLine !== null ? 'changed'
            : oursLine !== null ? 'removed'
            : 'added';
          raw.push({ oursLine, theirsLine, kind });
        }
        i += 2;
      } else {
        // Unpaired remove — theirs column is empty
        for (const line of oursLines) {
          raw.push({ oursLine: line, theirsLine: null, kind: 'removed' });
        }
        i++;
      }
    } else {
      // Unpaired add — ours column is empty
      for (const line of splitLines(chunk.value)) {
        raw.push({ oursLine: null, theirsLine: line, kind: 'added' });
      }
      i++;
    }
  }

  // Annotate with per-side line numbers (increment only on non-null lines)
  let oursNum = 0;
  let theirsNum = 0;
  return raw.map((r) => ({
    ...r,
    oursLineNum: r.oursLine !== null ? ++oursNum : null,
    theirsLineNum: r.theirsLine !== null ? ++theirsNum : null,
  }));
}

// ---------------------------------------------------------------------------
// Cell
// ---------------------------------------------------------------------------

interface DiffCellProps {
  line: string | null;
  lineNum: number | null;
  side: 'ours' | 'theirs';
  kind: RowKind;
}

function DiffCell({ line, lineNum, side, kind }: DiffCellProps): React.ReactElement {
  if (line === null) {
    return (
      <div className="flex min-w-0 bg-gray-50" aria-hidden="true">
        <span className="w-10 flex-shrink-0 select-none" />
        <span className="flex-1 px-2 whitespace-pre font-mono text-xs" />
      </div>
    );
  }

  const isModified = kind !== 'equal';
  const cellBg = isModified
    ? side === 'ours' ? 'bg-red-50' : 'bg-green-50'
    : 'bg-white';
  const numColor = isModified
    ? side === 'ours' ? 'text-red-300' : 'text-green-300'
    : 'text-gray-300';
  const textColor = isModified
    ? side === 'ours' ? 'text-red-800' : 'text-green-800'
    : 'text-gray-700';

  return (
    <div className={`flex min-w-0 ${cellBg}`}>
      <span className={`w-10 flex-shrink-0 text-right pr-2 select-none text-xs font-mono ${numColor}`}>
        {lineNum}
      </span>
      <span className={`flex-1 px-2 whitespace-pre font-mono text-xs ${textColor}`}>
        {line}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ConflictDiff
// ---------------------------------------------------------------------------

export function ConflictDiff({
  path,
  oursLabel,
  theirsLabel,
  oursContent,
  theirsContent,
  oursTruncated,
  theirsTruncated,
}: ConflictDiffProps): React.ReactElement {
  const sanitizedPath = path.replace(/\//g, '-');
  const hasTruncation = oursTruncated || theirsTruncated;

  const rows = useMemo(
    () => buildRows(oursContent, theirsContent),
    [oursContent, theirsContent],
  );

  const truncationSides =
    oursTruncated && theirsTruncated ? 'both sides are'
    : oursTruncated ? '"ours" is'
    : '"theirs" is';

  return (
    <div
      data-testid={`conflict-diff-${sanitizedPath}`}
      className="overflow-x-auto rounded border border-gray-200"
    >
      {hasTruncation && (
        <div
          data-testid="conflict-diff-truncated"
          className="bg-amber-50 border-b border-amber-200 text-amber-700 px-3 py-1.5 text-xs"
        >
          ⚠ {truncationSides} truncated at 16 KB — diff shows partial content only.
        </div>
      )}

      {/* Sticky column headers */}
      <div className="grid grid-cols-2 sticky top-0 bg-gray-100 border-b border-gray-200 z-10">
        <div className="px-3 py-1.5 text-xs font-semibold text-gray-600 border-r border-gray-200 truncate">
          {oursLabel}
        </div>
        <div className="px-3 py-1.5 text-xs font-semibold text-gray-600 truncate">
          {theirsLabel}
        </div>
      </div>

      {/* Diff rows — grid keeps ours/theirs visually aligned */}
      <div>
        {rows.map((row, idx) => (
          <div key={idx} className="grid grid-cols-2 border-b border-gray-100 last:border-b-0">
            <DiffCell
              line={row.oursLine}
              lineNum={row.oursLineNum}
              side="ours"
              kind={row.kind}
            />
            <DiffCell
              line={row.theirsLine}
              lineNum={row.theirsLineNum}
              side="theirs"
              kind={row.kind}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
