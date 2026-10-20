import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './auth/AuthProvider';
import { AvisosProvider } from './components/ui/Avisos';
import './index.css';
import { validacionEnEspanol } from './lib/validacionEnEspanol';

// Avisos de campos obligatorios y formatos en español (el navegador los pone en su idioma).
validacionEnEspanol();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <AvisosProvider>
          <App />
        </AvisosProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
