// useProjects.tsx - Project management hooks with TanStack Query
// Provides state management and API interactions for the Projects feature
// Uses database persistence for cross-device sync (not localStorage)

import { createContext, useContext, useCallback, type ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

// =============================================================================
// TYPES
// =============================================================================

export interface Project {
  id: number;
  name: string;
  description?: string;
  instructions?: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectInput {
  name: string;
  description?: string;
  instructions?: string;
  isDefault?: boolean;
}

export interface UpdateProjectInput {
  name?: string;
  description?: string | null;
  instructions?: string | null;
  isDefault?: boolean;
}

interface ProjectContextValue {
  // State
  activeProjectId: number | null;
  activeProject: Project | null;
  projects: Project[];
  
  // Actions
  setActiveProjectId: (id: number | null) => Promise<void>;
  clearActiveProject: () => Promise<void>;
  
  // Query state
  isLoading: boolean;
  isActiveProjectLoading: boolean;
  isError: boolean;
  error: Error | null;
  
  // Mutations
  createProject: (input: CreateProjectInput) => Promise<Project>;
  updateProject: (id: number, input: UpdateProjectInput) => Promise<Project>;
  deleteProject: (id: number) => Promise<void>;
  setDefaultProject: (id: number) => Promise<Project>;
}

// =============================================================================
// API FUNCTIONS
// =============================================================================

async function fetchProjects(): Promise<Project[]> {
  const response = await fetch('/api/projects', {
    credentials: 'include',
  });
  
  if (!response.ok) {
    if (response.status === 401) {
      // User not authenticated, return empty array
      return [];
    }
    throw new Error(`Failed to fetch projects: ${response.statusText}`);
  }
  
  const data = await response.json();
  return data.projects || [];
}

async function fetchActiveProject(): Promise<Project | null> {
  const response = await fetch('/api/projects/active', {
    credentials: 'include',
  });
  
  if (!response.ok) {
    if (response.status === 401) {
      // User not authenticated
      return null;
    }
    throw new Error(`Failed to fetch active project: ${response.statusText}`);
  }
  
  const data = await response.json();
  return data.project || null;
}

async function createProjectApi(input: CreateProjectInput): Promise<Project> {
  const response = await fetch('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(input),
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create project');
  }
  
  const data = await response.json();
  return data.project;
}

async function updateProjectApi(id: number, input: UpdateProjectInput): Promise<Project> {
  const response = await fetch(`/api/projects/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(input),
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to update project');
  }
  
  const data = await response.json();
  return data.project;
}

async function deleteProjectApi(id: number): Promise<void> {
  const response = await fetch(`/api/projects/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to delete project');
  }
}

async function setActiveProjectApi(id: number): Promise<Project> {
  const response = await fetch(`/api/projects/${id}/set-default`, {
    method: 'POST',
    credentials: 'include',
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to set active project');
  }
  
  const data = await response.json();
  return data.project;
}

async function clearActiveProjectApi(): Promise<void> {
  const response = await fetch('/api/projects/active', {
    method: 'DELETE',
    credentials: 'include',
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to clear active project');
  }
}

// =============================================================================
// CONTEXT
// =============================================================================

const ProjectContext = createContext<ProjectContextValue | null>(null);

export function ProjectProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  
  // Fetch all projects
  const {
    data: projects = [],
    isLoading: isProjectsLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['projects'],
    queryFn: fetchProjects,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
  
  // Fetch active/default project from database
  const {
    data: activeProject = null,
    isLoading: isActiveProjectLoading,
  } = useQuery({
    queryKey: ['activeProject'],
    queryFn: fetchActiveProject,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
  
  const activeProjectId = activeProject?.id ?? null;
  
  // Set active project mutation (persists to database)
  const setActiveMutation = useMutation({
    mutationFn: setActiveProjectApi,
    onMutate: async (projectId) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['activeProject'] });
      
      // Snapshot the previous value
      const previousActive = queryClient.getQueryData<Project | null>(['activeProject']);
      
      // Optimistically update to the new value
      const newProject = projects.find(p => p.id === projectId) || null;
      queryClient.setQueryData(['activeProject'], newProject);
      
      return { previousActive };
    },
    onSuccess: (project) => {
      // Invalidate to get fresh data
      queryClient.invalidateQueries({ queryKey: ['activeProject'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success(`Switched to "${project.name}"`, {
        description: 'Files and chats are now scoped to this project.',
        duration: 3000,
      });
    },
    onError: (err, _, context) => {
      // Rollback on error
      if (context?.previousActive !== undefined) {
        queryClient.setQueryData(['activeProject'], context.previousActive);
      }
      toast.error('Failed to switch project', {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    },
  });
  
  // Clear active project mutation
  const clearActiveMutation = useMutation({
    mutationFn: clearActiveProjectApi,
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['activeProject'] });
      const previousActive = queryClient.getQueryData<Project | null>(['activeProject']);
      queryClient.setQueryData(['activeProject'], null);
      return { previousActive };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activeProject'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success('Switched to General (No Project)', {
        description: 'You are now working outside of any project context.',
        duration: 3000,
      });
    },
    onError: (err, _, context) => {
      if (context?.previousActive !== undefined) {
        queryClient.setQueryData(['activeProject'], context.previousActive);
      }
      toast.error('Failed to clear active project', {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    },
  });
  
  // Create project mutation
  const createMutation = useMutation({
    mutationFn: createProjectApi,
    onSuccess: (project) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      // If created as default, also refresh active project
      if (project.isDefault) {
        queryClient.invalidateQueries({ queryKey: ['activeProject'] });
      }
      toast.success(`Project "${project.name}" created!`, {
        description: 'Your new project is ready to use.',
      });
    },
    onError: (error: Error) => {
      toast.error('Failed to create project', {
        description: error.message,
      });
    },
  });
  
  // Update project mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: number; input: UpdateProjectInput }) => 
      updateProjectApi(id, input),
    onSuccess: (project) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      // If this is the active project, refresh it
      if (project.id === activeProjectId) {
        queryClient.invalidateQueries({ queryKey: ['activeProject'] });
      }
      toast.success(`Project "${project.name}" updated!`);
    },
    onError: (error: Error) => {
      toast.error('Failed to update project', {
        description: error.message,
      });
    },
  });
  
  // Delete project mutation
  const deleteMutation = useMutation({
    mutationFn: deleteProjectApi,
    onSuccess: (_, deletedId) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      // If the deleted project was active, clear it
      if (activeProjectId === deletedId) {
        queryClient.setQueryData(['activeProject'], null);
      }
      toast.success('Project deleted', {
        description: 'Files and conversations have been unlinked.',
      });
    },
    onError: (error: Error) => {
      toast.error('Failed to delete project', {
        description: error.message,
      });
    },
  });
  
  // Set default project mutation (same as set active, kept for semantic clarity)
  const setDefaultMutation = useMutation({
    mutationFn: setActiveProjectApi,
    onSuccess: (project) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['activeProject'] });
      toast.success(`"${project.name}" is now your default project`);
    },
    onError: (error: Error) => {
      toast.error('Failed to set default project', {
        description: error.message,
      });
    },
  });
  
  // Wrapped action functions
  const setActiveProjectId = useCallback(
    async (id: number | null) => {
      if (id === null) {
        await clearActiveMutation.mutateAsync();
      } else {
        await setActiveMutation.mutateAsync(id);
      }
    },
    [setActiveMutation, clearActiveMutation]
  );
  
  const clearActiveProject = useCallback(
    async () => {
      await clearActiveMutation.mutateAsync();
    },
    [clearActiveMutation]
  );
  
  const createProject = useCallback(
    (input: CreateProjectInput) => createMutation.mutateAsync(input),
    [createMutation]
  );
  
  const updateProject = useCallback(
    (id: number, input: UpdateProjectInput) => 
      updateMutation.mutateAsync({ id, input }),
    [updateMutation]
  );
  
  const deleteProject = useCallback(
    (id: number) => deleteMutation.mutateAsync(id),
    [deleteMutation]
  );
  
  const setDefaultProject = useCallback(
    (id: number) => setDefaultMutation.mutateAsync(id),
    [setDefaultMutation]
  );
  
  const value: ProjectContextValue = {
    activeProjectId,
    activeProject,
    projects,
    setActiveProjectId,
    clearActiveProject,
    isLoading: isProjectsLoading,
    isActiveProjectLoading,
    isError,
    error: error as Error | null,
    createProject,
    updateProject,
    deleteProject,
    setDefaultProject,
  };
  
  return (
    <ProjectContext.Provider value={value}>
      {children}
    </ProjectContext.Provider>
  );
}

// =============================================================================
// HOOKS
// =============================================================================

/**
 * Main hook for accessing project context
 * Must be used within a ProjectProvider
 */
export function useProjects(): ProjectContextValue {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error('useProjects must be used within a ProjectProvider');
  }
  return context;
}

/**
 * Hook for fetching a single project by ID
 */
export function useProject(id: number | null | undefined) {
  return useQuery({
    queryKey: ['project', id],
    queryFn: async () => {
      if (!id) return null;
      const response = await fetch(`/api/projects/${id}`, {
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error('Failed to fetch project');
      }
      const data = await response.json();
      return data.project as Project;
    },
    enabled: !!id,
    staleTime: 1000 * 60 * 5,
  });
}

/**
 * Hook for creating a new project
 */
export function useCreateProject() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: createProjectApi,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

/**
 * Hook for updating a project
 */
export function useUpdateProject() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: UpdateProjectInput }) =>
      updateProjectApi(id, input),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['project', id] });
    },
  });
}

/**
 * Hook for deleting a project
 */
export function useDeleteProject() {
  const queryClient = useQueryClient();
  const { activeProjectId, setActiveProjectId } = useProjects();
  
  return useMutation({
    mutationFn: deleteProjectApi,
    onSuccess: async (_, deletedId) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['project', deletedId] });
      if (activeProjectId === deletedId) {
        await setActiveProjectId(null);
      }
    },
  });
}

