import React from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider, createBrowserRouter } from 'react-router-dom'
import './style.css'
import RootLayout from './ui/RootLayout'
import HomePage from './ui/pages/HomePage'
import NewslettersPage from './ui/pages/NewslettersPage'
import NewsletterDetailPage from './ui/pages/NewsletterDetailPage'
import NewslettersListPage from './ui/pages/NewslettersListPage'

const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'newsletters', element: <NewslettersPage /> },
      { path: 'newsletters/list', element: <NewslettersListPage /> },
      { path: 'newsletters/:slug', element: <NewsletterDetailPage /> },
    ],
  },
])

const container = document.getElementById('root')!
createRoot(container).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
)



