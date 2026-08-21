import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import 'material-react-toastify/dist/ReactToastify.css';
import { App } from './App';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root is missing');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
