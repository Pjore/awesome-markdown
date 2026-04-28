#!/usr/bin/env node
/**
 * services-status.mjs
 * Prints a status table by querying pm2 jlist and merging with the static port map.
 */

import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const OWNER_FILE = resolve(REPO_ROOT, '.run', 'owner');

const PORT_MAP = { ui: '5173', fs: '7701', sync: '7402' };

// Read owner file
const owner = existsSync(OWNER_FILE)
  ? readFileSync(OWNER_FILE, 'utf8').trim()
  : '(none)';

// Query PM2 — if daemon is not running pm2 exits non-zero; treat that as empty list
let apps = [];
try {
  const raw = execSync('pnpm exec pm2 jlist', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  // pm2 jlist can emit log lines before the JSON array; extract the JSON part
  const jsonStart = raw.indexOf('[');
  if (jsonStart !== -1) {
    apps = JSON.parse(raw.slice(jsonStart));
  }
} catch {
  // daemon not running — apps stays empty
}

// Build a map by name
const byName = {};
for (const app of apps) {
  byName[app.name] = app;
}

// Format uptime
function fmtUptime(ms) {
  if (!ms || ms < 0) return '-';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h${m % 60}m`;
  return `${Math.floor(h / 24)}d${h % 24}h`;
}

// Header
const COL = [8, 8, 7, 7, 9, 6, 0];
const header = ['NAME', 'STATUS', 'PID', 'UPTIME', 'RESTARTS', 'PORT', 'OWNER'];

function pad(str, len) {
  if (len === 0) return str;
  return String(str).padEnd(len);
}

const SEP = COL.map((w, i) => '-'.repeat(w || header[i].length + 2));
console.log(header.map((h, i) => pad(h, COL[i])).join('  '));
console.log(SEP.join('  '));

for (const name of ['ui', 'fs', 'sync']) {
  const app = byName[name];
  const status = app ? app.pm2_env?.status ?? 'unknown' : 'stopped';
  const pid = app ? String(app.pid ?? '-') : '-';
  const uptime = app ? fmtUptime(app.pm2_env?.pm_uptime ? Date.now() - app.pm2_env.pm_uptime : null) : '-';
  const restarts = app ? String(app.pm2_env?.restart_time ?? 0) : '-';
  const port = PORT_MAP[name];
  console.log(
    [pad(name, COL[0]), pad(status, COL[1]), pad(pid, COL[2]), pad(uptime, COL[3]), pad(restarts, COL[4]), pad(port, COL[5]), owner]
      .join('  ')
  );
}
