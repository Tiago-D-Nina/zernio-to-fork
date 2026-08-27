import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
// caminho .css explícito: o pacote fontsource não tem types e o type-check
// do Lovable (TS2882) rejeita side-effect import de módulo sem declarações
import '@fontsource-variable/geist/index.css';
import '@fontsource-variable/geist-mono/index.css';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);