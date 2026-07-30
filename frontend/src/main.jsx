import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { ToastProvider } from '@/components/ui/Toast';
import { ConfigProvider } from '@/config/ConfigProvider';
import { SessionProvider } from '@/session/SessionProvider';
import './index.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <ConfigProvider>
          <SessionProvider>
            <App />
          </SessionProvider>
        </ConfigProvider>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
);
