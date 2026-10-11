import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import Explore from './pages/Explore.tsx'
import Create from './pages/Create.tsx'
import Characters from './pages/Characters.tsx'
import Library from './pages/Library.tsx'
import NotFound from './pages/NotFound.tsx'

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <Explore /> },
      { path: 'create', element: <Create /> },
      { path: 'characters', element: <Characters /> },
      { path: 'library', element: <Library /> },
      { path: '*', element: <NotFound /> },
    ],
  },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
