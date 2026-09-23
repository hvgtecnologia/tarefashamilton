
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import SharedDriveView from './components/SharedDriveView';
import { parseShareToken } from './lib/drive';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error("Could not find root element to mount to");

const root = ReactDOM.createRoot(rootElement);
// Link de compartilhamento do Drive: página pública, sem login e sem carregar o app inteiro
const shareToken = parseShareToken(window.location.hash);

root.render(
  <React.StrictMode>
    {shareToken ? <SharedDriveView token={shareToken} /> : <App />}
  </React.StrictMode>
);
