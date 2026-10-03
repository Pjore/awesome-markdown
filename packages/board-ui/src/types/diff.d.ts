// diff@7 ships no type declarations; this is the minimal surface ConflictDiff uses.
declare module 'diff' {
  export interface Change {
    value: string;
    count?: number;
    added?: boolean;
    removed?: boolean;
  }
  export function diffLines(oldStr: string, newStr: string): Change[];
}
