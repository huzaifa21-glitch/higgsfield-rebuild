import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import Explore from './pages/Explore.tsx'
import Create from './pages/Create.tsx'
import Characters from './pages/Characters.tsx'
import CharacterDetail from './pages/CharacterDetail.tsx'
import Library from './pages/Library.tsx'
import NotFound from './pages/NotFound.tsx'
import Dev from './pages/Dev.tsx'
import Effect from './pages/Effect.tsx'

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <Explore /> },
      { path: 'create', element: <Create /> },
      { path: 'effects/:id', element: <Effect /> },
      { path: 'characters', element: <Characters /> },
      { path: 'characters/:id', element: <CharacterDetail /> },
      { path: 'library', element: <Library /> },
      { path: 'dev', element: <Dev /> },
      { path: '*', element: <NotFound /> },
    ],
  },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
