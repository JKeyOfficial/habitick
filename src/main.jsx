import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import './index.css'
import App from './App.jsx'
import { setupServiceWorkerListener } from './utils/pwa'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
    <Analytics />
  </StrictMode>,
)

// Register Service Worker for PWA support
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => {
        console.log('Service Worker registered', reg);
        setupServiceWorkerListener((tag) => {
          console.log(`Sync triggered for tag: ${tag}`);
          // You could trigger a data refresh here
        });
      })
      .catch(err => console.error('Service Worker registration failed', err));
  });
}
