import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Router } from './components/Router'
import { ProjectProvider } from './hooks/useProjects'
import './index.css'

// Create a client
const queryClient = new QueryClient()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ProjectProvider>
        <Router />
      </ProjectProvider>
    </QueryClientProvider>
  </StrictMode>,
)
