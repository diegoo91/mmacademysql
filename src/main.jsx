import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { registerServiceWorker } from './lib/push'

// Register the push service worker as early as possible. This SW intentionally
// has no fetch handler, so it does not affect app loading or dev HMR.
registerServiceWorker()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
