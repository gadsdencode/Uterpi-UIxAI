import React, { useState } from 'react';
import { 
  Bot, 
  Plus, 
  Settings, 
  MessageSquare, 
  FolderKanban, 
  ChevronDown,
  Globe,
  Sparkles,
  MoreVertical,
  Pencil,
  Trash2
} from 'lucide-react';
import { useProjects, type Project } from '../hooks/useProjects';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { Button } from './ui/button';
import { cn } from '../lib/utils';

interface SidebarProps {
  onNewChat?: () => void;
  onOpenProjectSettings?: (project?: Project) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ onNewChat, onOpenProjectSettings }) => {
  const { 
    projects, 
    activeProjectId, 
    activeProject, 
    setActiveProjectId,
    deleteProject,
    isLoading 
  } = useProjects();
  
  const [isProjectDropdownOpen, setIsProjectDropdownOpen] = useState(false);

  const handleProjectSelect = async (projectId: number | null) => {
    try {
      await setActiveProjectId(projectId);
    } catch (error) {
      console.error('Failed to switch project:', error);
    }
    setIsProjectDropdownOpen(false);
  };

  const handleDeleteProject = async (e: React.MouseEvent, project: Project) => {
    e.stopPropagation();
    if (confirm(`Are you sure you want to delete "${project.name}"? Files and conversations will be unlinked but not deleted.`)) {
      try {
        await deleteProject(project.id);
      } catch (error) {
        console.error('Failed to delete project:', error);
      }
    }
  };

  const handleEditProject = (e: React.MouseEvent, project: Project) => {
    e.stopPropagation();
    onOpenProjectSettings?.(project);
  };

  return (
    <div className="hidden md:flex flex-col w-64 bg-secondary/50 border-r border-border p-4 transition-all duration-300">
      <div className="flex items-center mb-4">
        <Bot className="w-8 h-8 text-primary mr-3" />
        <h1 className="text-xl font-bold text-foreground">AI Assistant</h1>
      </div>
      
      {/* Project Switcher */}
      <div className="mb-4" role="region" aria-label="Project selection">
        <label id="project-switcher-label" className="text-xs font-medium text-muted-foreground mb-2 block">
          Active Project
        </label>
        <DropdownMenu open={isProjectDropdownOpen} onOpenChange={setIsProjectDropdownOpen}>
          <DropdownMenuTrigger asChild>
            <Button 
              variant="outline" 
              className="w-full justify-between text-left font-normal h-auto py-2"
              aria-labelledby="project-switcher-label"
              aria-expanded={isProjectDropdownOpen}
              aria-haspopup="listbox"
            >
              <div className="flex items-center min-w-0 flex-1">
                {activeProject ? (
                  <>
                    <FolderKanban className="w-4 h-4 mr-2 flex-shrink-0 text-violet-400" />
                    <span className="truncate">{activeProject.name}</span>
                    {activeProject.instructions && (
                      <span title="Has custom instructions">
                        <Sparkles className="w-3 h-3 ml-1 text-amber-400 flex-shrink-0" />
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    <Globe className="w-4 h-4 mr-2 flex-shrink-0 text-slate-400" />
                    <span className="text-muted-foreground">General (No Project)</span>
                  </>
                )}
              </div>
              <ChevronDown className="w-4 h-4 ml-2 flex-shrink-0 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="start" role="listbox" aria-label="Select a project">
            {/* General / No Project Option */}
            <DropdownMenuItem 
              onClick={() => handleProjectSelect(null)}
              className={cn(
                "flex items-center justify-between",
                activeProjectId === null && "bg-accent"
              )}
            >
              <div className="flex items-center">
                <Globe className="w-4 h-4 mr-2 text-slate-400" />
                <span>General (No Project)</span>
              </div>
            </DropdownMenuItem>
            
            {projects.length > 0 && <DropdownMenuSeparator />}
            
            {/* Project List */}
            {isLoading ? (
              <div className="px-2 py-3 text-sm text-muted-foreground text-center">
                Loading projects...
              </div>
            ) : projects.length === 0 ? (
              <div className="px-2 py-3 text-sm text-muted-foreground text-center">
                No projects yet
              </div>
            ) : (
              projects.map((project) => (
                <DropdownMenuItem
                  key={project.id}
                  onClick={() => handleProjectSelect(project.id)}
                  className={cn(
                    "flex items-center justify-between group",
                    activeProjectId === project.id && "bg-accent"
                  )}
                >
                  <div className="flex items-center min-w-0 flex-1">
                    <FolderKanban className="w-4 h-4 mr-2 flex-shrink-0 text-violet-400" />
                    <span className="truncate">{project.name}</span>
                    {project.instructions && (
                      <span title="Has custom instructions">
                        <Sparkles className="w-3 h-3 ml-1 text-amber-400 flex-shrink-0" />
                      </span>
                    )}
                    {project.isDefault && (
                      <span className="ml-1 text-xs text-muted-foreground">(default)</span>
                    )}
                  </div>
                  <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => handleEditProject(e, project)}
                      className="p-1 hover:bg-accent rounded"
                      title="Edit project"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button
                      onClick={(e) => handleDeleteProject(e, project)}
                      className="p-1 hover:bg-destructive/10 hover:text-destructive rounded"
                      title="Delete project"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </DropdownMenuItem>
              ))
            )}
            
            <DropdownMenuSeparator />
            
            {/* Create New Project */}
            <DropdownMenuItem 
              onClick={() => {
                setIsProjectDropdownOpen(false);
                onOpenProjectSettings?.();
              }}
              className="text-violet-400"
            >
              <Plus className="w-4 h-4 mr-2" />
              <span>Create New Project</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        
        {/* Active project indicator */}
        {activeProject && (
          <div className="mt-2 p-2 bg-violet-500/10 border border-violet-400/20 rounded-lg">
            <p className="text-xs text-violet-300 truncate" title={activeProject.description || 'No description'}>
              {activeProject.description || 'No description'}
            </p>
            {activeProject.instructions && (
              <p className="text-xs text-amber-400/80 mt-1 flex items-center">
                <Sparkles className="w-3 h-3 mr-1" />
                Custom instructions active
              </p>
            )}
          </div>
        )}
      </div>
      
      {/* New Chat Button */}
      <button 
        onClick={onNewChat}
        className="flex items-center justify-center w-full bg-primary text-primary-foreground py-2 px-4 rounded-lg hover:bg-primary/90 transition-colors duration-200 mb-6"
      >
        <Plus className="w-5 h-5 mr-2" />
        New Chat
      </button>
      
      {/* Recent Chats */}
      <div className="flex-1 overflow-y-auto -mr-2 pr-2">
        <h2 className="text-sm font-semibold text-muted-foreground mb-2">Recent</h2>
        <nav className="space-y-2">
          <a href="#" className="flex items-center p-2 bg-primary/10 text-primary-foreground rounded-lg">
            <MessageSquare className="w-4 h-4 mr-3" />
            <span className="truncate">Designing a modern UI...</span>
          </a>
          <a href="#" className="flex items-center p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground rounded-lg">
            <MessageSquare className="w-4 h-4 mr-3" />
            <span className="truncate">React component patterns</span>
          </a>
          <a href="#" className="flex items-center p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground rounded-lg">
            <MessageSquare className="w-4 h-4 mr-3" />
            <span className="truncate">Python data analysis script</span>
          </a>
        </nav>
      </div>
      
      {/* Settings */}
      <div className="mt-auto">
        <a href="#" className="flex items-center p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground rounded-lg">
          <Settings className="w-5 h-5 mr-3" />
          Settings
        </a>
      </div>
    </div>
  );
};

export default Sidebar;
