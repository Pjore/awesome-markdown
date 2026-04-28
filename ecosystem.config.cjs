'use strict';

// Allow a SERVICES_CWD env var so `services switch` can redirect to another worktree.
// Default: the directory that contains this config file (repo root).
const ROOT = process.env.SERVICES_CWD || __dirname;

module.exports = {
  apps: [
    {
      name: 'ui',
      script: 'pnpm',
      args: '--filter kanban-ui dev',
      cwd: ROOT,
      env: {
        PORT: '5173',
      },
      autorestart: true,
      watch: false,
      kill_timeout: 5000,
    },
    {
      name: 'fs',
      script: 'pnpm',
      args: '--filter provider-fs dev',
      cwd: ROOT,
      env: {
        PORT: '7701',
      },
      autorestart: true,
      watch: false,
      kill_timeout: 5000,
    },
    {
      name: 'sync',
      script: 'pnpm',
      args: '--filter sync-engine dev',
      cwd: ROOT,
      env: {
        PORT: '7402',
        SYNC_ENGINE_REPO_ROOT: ROOT,
      },
      autorestart: true,
      watch: false,
      kill_timeout: 5000,
    },
  ],
};
