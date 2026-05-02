/**
 * Public barrel for the GitHub App credential module.
 *
 * Usage:
 *   import { createGitCredentialProvider, MintFailureError } from './github-app/index.js';
 */
export type { GitCredentialProvider, InstallationToken, GithubAppCredentials } from './types.js';
export { MintFailureError } from './types.js';
export type { GithubAppRuntimeConfig } from './factory.js';
export { createGitCredentialProvider } from './factory.js';
