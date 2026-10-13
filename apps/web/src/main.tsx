import React, { lazy, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { PRIVY_APP_ID } from './monad/privyEnv';
import './index.css';

// Privy (email login) is only loaded when VITE_PRIVY_APP_ID is set; otherwise the app is burner-wallet only.
const PrivyProvider = PRIVY_APP_ID ? lazy(() => import('./monad/privy')) : null;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {PrivyProvider && PRIVY_APP_ID ? (
      <Suspense fallback={null}>
        <PrivyProvider appId={PRIVY_APP_ID}><App /></PrivyProvider>
      </Suspense>
    ) : (
      <App />
    )}
  </React.StrictMode>
);
