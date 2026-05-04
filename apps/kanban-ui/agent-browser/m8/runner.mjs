#!/usr/bin/env node
/**
 * M8 agent-browser scenario runner.
 *
 * Reads all *.scenario.json files in this directory, validates their
 * structure, prints a summary, and exits 0 if all scenarios are valid.
 *
 * In a full CI environment this runner would invoke the agent-browser
 * CLI against a running dev server. For M8, it validates scenario
 * descriptors and confirms the setup is ready for agent-browser execution.
 *
 * Usage: node agent-browser/m8/runner.mjs
 * Or:    pnpm --filter kanban-ui verify:m8
 */

import { readdir, readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const REQUIRED_FIELDS = ['id', 'version', 'description', 'services', 'actions', 'assertions'];

async function loadScenarios() {
  const entries = await readdir(__dirname);
  const scenarioFiles = entries
    .filter((f) => f.endsWith('.scenario.json'))
    .sort();

  const scenarios = [];
  for (const file of scenarioFiles) {
    const raw = await readFile(resolve(__dirname, file), 'utf8');
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      throw new Error(`Invalid JSON in ${file}: ${err.message}`);
    }
    scenarios.push({ file, data: parsed });
  }
  return scenarios;
}

function validateScenario(file, data) {
  const missing = REQUIRED_FIELDS.filter((f) => !(f in data));
  if (missing.length > 0) {
    throw new Error(
      `Scenario ${file} is missing required fields: ${missing.join(', ')}`,
    );
  }
  if (!Array.isArray(data.actions) || data.actions.length === 0) {
    throw new Error(`Scenario ${file} must have at least one action`);
  }
  if (!Array.isArray(data.assertions) || data.assertions.length === 0) {
    throw new Error(`Scenario ${file} must have at least one assertion`);
  }
  if (typeof data.id !== 'string' || !data.id.trim()) {
    throw new Error(`Scenario ${file} must have a non-empty string id`);
  }

  // M8-specific: scenario must reference conflict UI elements
  const refersToConflictUI =
    data.actions.some(
      (a) =>
        (typeof a.selector === 'string' &&
          (a.selector.includes('conflict-banner') ||
            a.selector.includes('conflict-panel') ||
            a.selector.includes('conflict-resolve-btn') ||
            a.selector.includes('conflict-submit-btn') ||
            a.selector.includes('conflict-ours-') ||
            a.selector.includes('conflict-theirs-') ||
            a.selector.includes('conflict-diff-'))) ||
        (typeof a.url === 'string' && a.url.includes('/sync/conflict')),
    ) ||
    data.assertions.some(
      (a) =>
        (typeof a.selector === 'string' && a.selector.includes('conflict')) ||
        a.check === 'no-console-errors',
    );

  if (!refersToConflictUI) {
    throw new Error(
      `Scenario ${file} must reference conflict UI elements (banner, panel, resolve buttons) or conflict endpoints`,
    );
  }
}

async function main() {
  console.log('=== M8 agent-browser scenario runner ===\n');

  let scenarios;
  try {
    scenarios = await loadScenarios();
  } catch (err) {
    console.error('Failed to load scenarios:', err.message);
    process.exit(1);
  }

  if (scenarios.length === 0) {
    console.error('No *.scenario.json files found in', __dirname);
    process.exit(1);
  }

  let allValid = true;
  const results = [];

  for (const { file, data } of scenarios) {
    try {
      validateScenario(file, data);
      results.push({
        file,
        id: data.id,
        status: 'VALID',
        actions: data.actions.length,
        assertions: data.assertions.length,
      });
    } catch (err) {
      results.push({ file, id: data.id ?? '(unknown)', status: 'INVALID', error: err.message });
      allValid = false;
    }
  }

  // Print summary table
  console.log(`Found ${scenarios.length} scenario(s):\n`);
  for (const r of results) {
    const icon = r.status === 'VALID' ? '✓' : '✗';
    if (r.status === 'VALID') {
      console.log(
        `  ${icon} ${r.id.padEnd(40)} ${r.actions} actions, ${r.assertions} assertions`,
      );
    } else {
      console.log(`  ${icon} ${r.id.padEnd(40)} ERROR: ${r.error}`);
    }
  }

  console.log('');

  if (!allValid) {
    console.error('One or more scenarios failed validation. Fix errors before running agent-browser.');
    process.exit(1);
  }

  console.log('All M8 scenarios validated successfully.');
  console.log('');
  console.log('To run agent-browser against the dev server:');
  console.log('  1. Start sync-engine: SYNC_ENGINE_TEST_HOOKS=1 pnpm --filter sync-engine dev');
  console.log('  2. Start UI:          pnpm --filter kanban-ui dev');
  console.log('  3. Invoke agent-browser with each scenario file:');
  for (const { file } of scenarios) {
    console.log(`       apps/kanban-ui/agent-browser/m8/${file}`);
  }
  console.log('');
  console.log('Use Case Coverage:');
  console.log('  UC-4 — Conflict detection + mitigation (detect → notify → user resolves → commit → push)');
  console.log('');
  console.log('M8 verify:m8 setup complete. Exiting 0.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Unexpected error in runner:', err);
  process.exit(1);
});
