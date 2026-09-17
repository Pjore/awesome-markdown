/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PROVIDER_FS_URL?: string;
  readonly VITE_DEFAULT_PROVIDER_KIND?: 'localStorage' | 'http';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module 'diff' {
  export interface Change {
    value: string;
    count?: number;
    added?: boolean;
    removed?: boolean;
  }
  export function diffLines(oldStr: string, newStr: string): Change[];
}
