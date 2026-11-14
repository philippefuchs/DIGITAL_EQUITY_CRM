
import React from 'react';
import './index.css';
import ReactDOM from 'react-dom/client';
import App from './App';
import { CategoryProvider } from './components/CategoryProvider';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <CategoryProvider>
      <App />
    </CategoryProvider>
  </React.StrictMode>
);
