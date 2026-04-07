import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { App } from './app/App';
import { ErrorBoundary } from './app/ErrorBoundary';
import { stampClipPathPolygon } from './lib/stampPath';
import './styles.css';

document.documentElement.style.setProperty('--stamp-clip', stampClipPathPolygon());

ReactDOM.createRoot(document.getElementById('app') as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <HashRouter>
        <App />
      </HashRouter>
    </ErrorBoundary>
  </React.StrictMode>,
);
