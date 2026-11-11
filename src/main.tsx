import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './ui/theme/tokens.css';
import './ui/theme/base.css';
import App from './App.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
