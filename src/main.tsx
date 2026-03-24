import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './styles/globals.css'

// Unregister service workers in dev mode to avoid caching issues
if ('serviceWorker' in navigator && import.meta.env.DEV) {
  navigator.serviceWorker.getRegistrations().then(registrations => {
    registrations.forEach(registration => {
      registration.unregister().then(() => {
        console.log('Service Worker unregistered for dev mode');
      });
    });
  });
}

// Register service worker for offline support (only in production)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(registration => {
        console.log('Service Worker registered:', registration.scope);
      })
      .catch(err => {
        console.log('Service Worker registration failed:', err);
      });
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
