import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { reportStarEngineTests } from './engine/stars.test-ish';

// The star engine is the spine — self-verify it before the UI can depend on it.
if (import.meta.env.DEV) {
  const ok = reportStarEngineTests();
  (window as unknown as { __starEngineOk?: boolean }).__starEngineOk = ok;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
