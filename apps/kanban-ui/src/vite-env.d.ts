/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PROVIDER_FS_URL?: string;
  readonly VITE_DEFAULT_PROVIDER_KIND?: 'localStorage' | 'http';
  readonly VITE_SYNC_ENGINE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
