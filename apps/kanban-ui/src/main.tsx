import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './styles.css';
import { App } from './App.js';
import { ActiveProviderProvider } from './providers/active-provider.js';
import { loadProviderSettings } from './settings/storage.js';
import { createProviderFromSettings } from './providers/provider-factory.js';
import { seedM3 } from './lib/seed.js';
import { seedM9 } from './lib/seedM9.js';

// Load persisted provider settings and construct the initial provider
const initialSettings = loadProviderSettings();
const initialProvider = createProviderFromSettings(initialSettings);

async function init(): Promise<void> {
  // Handle ?seed=<name> URL flag — used by agent-browser scenarios to guarantee
  // a known starting state. Must run before rendering.
  const params = new URLSearchParams(window.location.search);
  const seed = params.get('seed');
  if (seed === 'm3') {
    await seedM3(initialProvider);
  } else if (seed === 'm9') {
    await seedM9(initialProvider);
  }

  const rootEl = document.getElementById('root');
  if (rootEl === null) throw new Error('No #root element found in document');

  // Initialise theme before first render to avoid flash
  const storedTheme = localStorage.getItem('theme');
  const theme =
    storedTheme === 'dark' || storedTheme === 'light'
      ? storedTheme
      : window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
  document.documentElement.setAttribute('data-theme', theme);

  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <BrowserRouter>
        <ActiveProviderProvider
          initialProvider={initialProvider}
          initialSettings={initialSettings}
        >
          <div className="h-screen flex flex-col overflow-hidden">
            <App />
          </div>
        </ActiveProviderProvider>
      </BrowserRouter>
    </React.StrictMode>,
  );
}

void init();
