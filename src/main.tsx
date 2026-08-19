import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Suppress benign Vite HMR and WebSocket errors in the AI Studio environment
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason?.message || String(event.reason || '');
    if (
      reason.toLowerCase().includes('websocket') || 
      reason.toLowerCase().includes('vite') ||
      reason.toLowerCase().includes('connection closed') ||
      reason.toLowerCase().includes('closed before')
    ) {
      event.preventDefault();
    }
  });

  window.addEventListener('error', (event) => {
    const msg = event.message || '';
    if (
      msg.toLowerCase().includes('websocket') || 
      msg.toLowerCase().includes('vite') ||
      msg.toLowerCase().includes('connection closed')
    ) {
      event.preventDefault();
    }
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

