#!/usr/bin/env node
// Live extension of the M3 suite. Requires an isolated provider-fs content root.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const ui = process.env.UI_URL ?? 'http://127.0.0.1:5183';
const api = process.env.PROVIDER_URL ?? 'http://127.0.0.1:7713';
const session = `properties-${process.pid}`;
const slug = `properties-smoke-${Date.now()}`;
const run = (...args) =>
  execFileSync('agent-browser', ['--session', session, ...args], {
    encoding: 'utf8',
    timeout: 30000,
  }).trim();
const evaluate = (source) => run('eval', source);
const check = (expression, message) => {
  if (evaluate(`Boolean(${expression})`) !== 'true') throw new Error(message);
};
// Explicitly scroll the app's inner scrolling surface before pointer interactions.
function target(text) {
  evaluate(`{ document.querySelector('[data-live-target]')?.removeAttribute('data-live-target');
    const button=[...document.querySelectorAll('button')].find(e=>e.textContent.trim()===${JSON.stringify(text)});
    if(!button) throw Error('Missing button: '+${JSON.stringify(text)});
    button.setAttribute('data-live-target','yes'); button.scrollIntoView({block:'center'}); }`);
  run('scrollintoview', '[data-live-target=yes]');
  run('wait', '100');
  return '[data-live-target=yes]';
}
function click(text) {
  run('click', target(text));
  run('wait', '150');
}
async function clickDialog(text, accept) {
  target(text);
  // Defer this click so CDP can return before the synchronous native dialog opens.
  evaluate(`setTimeout(()=>document.querySelector('[data-live-target=yes]').click(),100)`);
  await new Promise((resolve) => setTimeout(resolve, 300));
  run('dialog', accept ? 'accept' : 'dismiss');
  run('wait', '150');
}
function fill(label, value) {
  if (label === 'Document text') run('fill', '[data-testid=item-editor-body]', value);
  else run('find', 'label', label, 'fill', value, '--exact');
}
async function apiRequest(path, method = 'GET', body) {
  const response = await fetch(`${api}${path}`, {
    method,
    ...(body
      ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
      : {}),
  });
  if (!response.ok)
    throw new Error(`${method} ${path}: ${response.status} ${await response.text()}`);
  return response.json();
}
const fixture = {
  entityType: 'item',
  slug,
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
  body: 'Original Markdown',
  text: '003',
  number: 3,
  nil: null,
  empty: '',
  group: {},
  mixed: [false, 'false', { createdAt: 'nested', 'a.b': [] }],
};
let createdHttp = false;
try {
  for (const kind of ['localStorage', 'http']) {
    run('open', ui);
    run('wait', '250');
    if (kind === 'http') {
      const created = await apiRequest('/items', 'POST', {
        slug,
        title: 'Temporary',
        body: fixture.body,
        mutations: Object.entries(fixture)
          .filter(
            ([key]) => !['entityType', 'slug', 'createdAt', 'updatedAt', 'body'].includes(key)
          )
          .map(([key, value]) => ({ op: 'set', path: [key], value })),
      });
      createdHttp = true;
      await apiRequest(`/items/${slug}`, 'PATCH', {
        revision: created.revision,
        mutations: [{ op: 'delete', path: ['title'] }],
      });
    }
    evaluate(`localStorage.setItem('awesome-markdown:provider-settings',JSON.stringify(${JSON.stringify(kind === 'http' ? { kind, baseUrl: api } : { kind })}));
      localStorage.setItem('awesome-markdown:v2',JSON.stringify({${JSON.stringify(`item:${slug}`)}:${JSON.stringify(fixture)}}));`);
    run('open', `${ui}/items/${slug}?board=origin`);
    run('wait', '400');
    check(
      `document.querySelector('h1')?.textContent===${JSON.stringify(slug)} && !document.querySelector('.item-page textarea')`,
      'Read-first title fallback failed'
    );
    check(
      `document.querySelector('[data-testid=item-properties]').textContent.includes('"003"')`,
      'Primitive fidelity failed'
    );
    check(
      `document.querySelector('.item-session').firstElementChild.classList.contains('item-document') && !document.querySelector('#document-heading')`,
      'Document content is not first or still has an injected heading'
    );
    evaluate(
      `document.querySelector('.item-metadata').open=true; document.querySelector('.item-recovery').open=true`
    );
    check(
      `document.querySelector('[data-testid=yaml-preview] > code.language-yaml')?.textContent.includes('entityType: "item"')`,
      'Readable YAML code block is missing'
    );
    run('scroll', 'down', '10000', '--selector', '[data-testid=app-content]');
    check(
      `document.querySelector('[data-testid=app-content]').scrollTop>0 && document.querySelector('.item-page footer').getBoundingClientRect().bottom<=document.querySelector('[data-testid=app-content]').getBoundingClientRect().bottom+1`,
      'Page content is clipped or footer cannot be reached by scrolling'
    );
    check(`document.documentElement.scrollHeight<=window.innerHeight+1`, 'Viewport shell creates a second document scrollbar');
    click('Edit');
    fill('number number', '1e');
    fill('text text', 'Unrelated draft');
    evaluate(`document.querySelector('.item-recovery').open=true`);
    check(
      `document.querySelector('[aria-invalid=true]')?.value==='1e' && !document.querySelector('[data-testid=yaml-preview]')`,
      'Incomplete numeric input was lost'
    );
    check(
      `[...document.querySelectorAll('button')].find(e=>e.textContent==='Download YAML').disabled`,
      'Invalid draft export was enabled'
    );
    click('Save');
    check(
      `!!document.querySelector('[data-testid=item-save]') && document.activeElement?.getAttribute('aria-invalid')==='true'`,
      'Invalid save was not blocked/focused'
    );
    run('scrollintoview', '[aria-label="Remove number"]');
    run('click', '[aria-label="Remove number"]');
    click('Add property to Properties');
    fill('Name', 'constructor');
    click('Confirm addition');
    check(
      `document.querySelector('.property-add-form').textContent.includes('safe property name')`,
      'Unsafe name was accepted'
    );
    fill('Name', ' new.key ');
    click('Confirm addition');
    fill('new.key text', 'Literal key');
    fill('Document text', 'Saved Markdown');
    click('Save');
    check(
      `!document.querySelector('[data-testid=item-save]') && location.pathname.endsWith(${JSON.stringify(slug)})`,
      'Save did not return to item read view'
    );
    run('reload');
    run('wait', '400');
    check(
      `document.querySelector('[data-testid=item-properties]').textContent.includes('Literal key') && document.querySelector('[data-testid=item-document]').textContent.includes('Saved Markdown')`,
      'Reload roundtrip failed'
    );
    click('Edit');
    fill('text text', 'Recovery draft');
    evaluate(`document.querySelector('.item-recovery').open=true`);
    for (const [label, extension] of [
      ['Download YAML', 'yaml'],
      ['Download Markdown', 'md'],
    ]) {
      target(label);
      const snapshot = run('snapshot', '-i');
      const ref = snapshot
        .split('\n')
        .find((line) => line.includes(`button "${label}"`))
        ?.match(/ref=(e\d+)/)?.[1];
      if (!ref) throw new Error(`Missing download action ${label}`);
      run('download', `@${ref}`, `/tmp/${session}-${kind}.${extension}`);
    }
    const yaml = readFileSync(`/tmp/${session}-${kind}.yaml`, 'utf8');
    const markdown = readFileSync(`/tmp/${session}-${kind}.md`, 'utf8');
    if (
      !yaml.includes('Recovery draft') ||
      yaml.includes('Saved Markdown') ||
      !markdown.includes('Saved Markdown')
    )
      throw new Error('Recovery exports used stale or incorrect data');
    if (kind === 'http') {
      const current = await apiRequest(`/items/${slug}`);
      await apiRequest(`/items/${slug}`, 'PATCH', {
        revision: current.revision,
        mutations: [{ op: 'set', path: ['text'], value: 'External edit' }],
      });
    } else {
      evaluate(
        `const source=JSON.parse(localStorage.getItem('awesome-markdown:v2')); source[${JSON.stringify(`item:${slug}`)}].text='External edit'; localStorage.setItem('awesome-markdown:v2',JSON.stringify(source)); window.dispatchEvent(new StorageEvent('storage',{key:'awesome-markdown:v2'}));`
      );
    }
    run('wait', '400');
    check(
      `[...document.querySelectorAll('textarea')].some(e=>e.value==='Recovery draft')`,
      'Incoming update replaced active edit snapshot'
    );
    click('Save');
    check(
      `!!document.querySelector('[data-testid=item-save]') && /changed|conflict/i.test(document.querySelector('[data-testid=item-editor-save-error]')?.textContent)`,
      'Conflict did not retain the draft'
    );
    // Exercise both outcomes of the actual native confirmation dialog.
    await clickDialog('Cancel', false);
    check(
      `!!document.querySelector('[data-testid=item-save]')`,
      'Declined cancellation discarded the draft'
    );
    console.log(
      `PASS ${kind}: read/edit, numeric errors, additions, atomic save/reload, recovery downloads, incoming events and conflict retention`
    );
    await clickDialog('Cancel', true);
    run('set', 'viewport', '390', '844');
    check(
      `document.querySelector('.item-page').getBoundingClientRect().width<=390`,
      'Mobile layout overflows'
    );
    run('scroll', 'down', '10000', '--selector', '[data-testid=app-content]');
    check(
      `document.querySelector('[data-testid=app-content]').scrollTop>0 && document.querySelector('.item-page footer').getBoundingClientRect().bottom<=window.innerHeight+1`,
      'Mobile content cannot be scrolled to its footer'
    );
    run('screenshot', `/tmp/${session}-${kind}-mobile.png`);
    run('set', 'viewport', '1280', '900');
  }
} finally {
  if (createdHttp) await apiRequest(`/items/${slug}`, 'DELETE');
  run('close');
}
