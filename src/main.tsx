import React from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider, createBrowserRouter } from 'react-router-dom'
import './style.css'
import { AuthProvider } from './contexts/AuthContext'
import { NewslettersProvider } from './contexts/NewslettersContext'
import RootLayout from './ui/RootLayout'
import HomePage from './ui/pages/HomePage'
import NewslettersPage from './ui/pages/NewslettersPage'
import NewsletterDetailPage from './ui/pages/NewsletterDetailPage'
import NewslettersListPage from './ui/pages/NewslettersListPage'
import CreateNewsletterPage from './ui/pages/CreateNewsletterPage'
import SubmitArticlePage from './ui/pages/SubmitArticlePage'
import AdminArticlesPage from './ui/pages/AdminArticlesPage'
import LoginPage from './ui/pages/LoginPage'
import ProtectedRoute from './ui/components/ProtectedRoute'

const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'newsletters', element: <NewslettersPage /> },
      { path: 'newsletters/list', element: <NewslettersListPage /> },
      {
        path: 'newsletters/create',
        element: (
          <ProtectedRoute>
            <CreateNewsletterPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'newsletters/edit/:id',
        element: (
          <ProtectedRoute>
            <CreateNewsletterPage />
          </ProtectedRoute>
        ),
      },
      { path: 'newsletters/:slug', element: <NewsletterDetailPage /> },
      { path: 'submit-article', element: <SubmitArticlePage /> },
      {
        path: 'admin/articles',
        element: (
          <ProtectedRoute>
            <AdminArticlesPage />
          </ProtectedRoute>
        ),
      },
    ],
  },
  {
    path: '/login',
    element: <LoginPage />,
  },
])

const container = document.getElementById('root')!
createRoot(container).render(
  <React.StrictMode>
    <AuthProvider>
      <NewslettersProvider>
        <RouterProvider router={router} />
      </NewslettersProvider>
    </AuthProvider>
  </React.StrictMode>
)



