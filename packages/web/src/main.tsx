import React from 'react';
import ReactDOM from 'react-dom/client';
import { createHashRouter, RouterProvider } from 'react-router-dom';
import { App } from './App.js';
import { CharactersPage } from './pages/CharactersPage.js';
import { CharacterPage } from './pages/CharacterPage.js';
import { SimSetupPage } from './pages/SimSetupPage.js';
import { JobPage } from './pages/JobPage.js';
import { HistoryPage } from './pages/HistoryPage.js';
import './styles.css';

const router = createHashRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <CharactersPage /> },
      { path: 'personajes/:id', element: <CharacterPage /> },
      { path: 'personajes/:id/simular', element: <SimSetupPage /> },
      { path: 'sims/:jobId', element: <JobPage /> },
      { path: 'historial', element: <HistoryPage /> },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
