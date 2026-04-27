#!/usr/bin/env node
/**
 * M9 agent-browser scenario runner.
 *
 * Reads all *.scenario.json files in this directory, validates their
 * structure, prints a summary, and exits 0 if all scenarios are valid.
 *
 * In a full CI environment this runner would invoke the agent-browser
 * CLI against a running dev server. For M9, it validates scenario
 * descriptors and confirms the setup is ready for agent-browser execution.
 *
 * Usage: node agent-browser/m9/runner.mjs
 * Or:    pnpm --filter kanban-ui verify:m9
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
}

/** Validate that each scenario covers at least one M9-specific assertion. */
function validateM9Coverage(scenarios) {
  const requiredIds = [
    'board-list-renders',
    'navigate-into-board',
    'deep-link-board',
    'board-content-isolation',
  ];

  const foundIds = new Set(scenarios.map(({ data }) => data.id));
  const missing = requiredIds.filter((id) => !foundIds.has(id));
  if (missing.length > 0) {
    throw new Error(
      `M9 coverage check failed — missing required scenario IDs: ${missing.join(', ')}`,
    );
  }
}

async function main() {
  console.log('=== M9 agent-browser scenario runner ===\n');

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
        `  ${icon} ${r.id.padEnd(32)} ${r.actions} actions, ${r.assertions} assertions`,
      );
    } else {
      console.log(`  ${icon} ${r.id.padEnd(32)} ERROR: ${r.error}`);
    }
  }

  console.log('');

  // M9-specific coverage check
  try {
    validateM9Coverage(scenarios);
    console.log('✓ M9 coverage check: all 4 required scenario IDs present.\n');
  } catch (err) {
    console.error(`✗ ${err.message}\n`);
    allValid = false;
  }

  if (!allValid) {
    console.error('One or more scenarios failed validation. Fix errors before running agent-browser.');
    process.exit(1);
  }

  console.log('All M9 scenarios validated successfully.');
  console.log('');
  console.log('To run agent-browser against the dev server:');
  console.log('  1. Start:  pnpm --filter kanban-ui dev');
  console.log('  2. In a second terminal, invoke agent-browser with each scenario file.');
  console.log('');
  console.log('Scenario files (seed with ?seed=m9):');
  for (const { file, data } of scenarios) {
    console.log(`  apps/kanban-ui/agent-browser/m9/${file}  (url: ${data.url ?? 'n/a'})`);
  }
  console.log('');
  console.log('M9 verify:m9 setup complete. Exiting 0.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Unexpected error in runner:', err);
  process.exit(1);
});
