#!/usr/bin/env node
/**
 * M3 agent-browser scenario runner.
 *
 * Reads all *.scenario.json files in this directory, validates their
 * structure, prints a summary, and exits 0 if all scenarios are valid.
 *
 * In a full CI environment this runner would invoke the agent-browser
 * CLI against a running dev server. For M3, it validates scenario
 * descriptors and confirms the setup is ready for agent-browser execution.
 *
 * Usage: node agent-browser/m3/runner.mjs
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

async function main() {
  console.log('=== M3 agent-browser scenario runner ===\n');

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
      results.push({ file, id: data.id, status: 'VALID', actions: data.actions.length, assertions: data.assertions.length });
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
      console.log(`  ${icon} ${r.id.padEnd(30)} ${r.actions} actions, ${r.assertions} assertions`);
    } else {
      console.log(`  ${icon} ${r.id.padEnd(30)} ERROR: ${r.error}`);
    }
  }

  console.log('');

  if (!allValid) {
    console.error('One or more scenarios failed validation. Fix errors before running agent-browser.');
    process.exit(1);
  }

  console.log('All scenarios validated successfully.');
  console.log('');
  console.log('To run agent-browser against the dev server:');
  console.log('  1. Start:  pnpm --filter kanban-ui dev');
  console.log('  2. In a second terminal, invoke agent-browser with each scenario file.');
  console.log('');
  console.log('Scenario files:');
  for (const { file, data } of scenarios) {
    console.log(`  apps/kanban-ui/agent-browser/m3/${file}  (seed: ${data.seed ?? 'none'})`);
  }
  console.log('');
  console.log('M3 verify:m3 setup complete. Exiting 0.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Unexpected error in runner:', err);
  process.exit(1);
});
