import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { store } from './store';

// Pull shared state from Postgres and start mirroring realtime changes.
// No-op when Supabase is not configured (local-only mode).
store.connect();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
