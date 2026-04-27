/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PROVIDER_FS_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
