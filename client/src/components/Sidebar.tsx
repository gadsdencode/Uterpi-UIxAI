import React, { useState } from 'react';
import { 
  Plus, 
  MessageSquare, 
  FolderKanban, 
  ChevronDown,
  Globe,
  Sparkles,
  Pencil,
  Trash2,
  Settings,
  History
} from 'lucide-react';
import { useProjects, type Project } from '../hooks/useProjects';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
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
    <aside className="hidden md:flex flex-col w-64 bg-slate-900/95 backdrop-blur-sm border-r border-slate-800/80 h-full">
      {/* Header / Logo */}
      <div className="p-4 border-b border-slate-800/50">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full border-2 border-slate-900" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-white">AI Assistant</h1>
            <p className="text-xs text-slate-500">Powered by Uterpi</p>
          </div>
        </div>
      </div>

      {/* Project Switcher */}
      <div className="p-3 border-b border-slate-800/50" role="region" aria-label="Project selection">
        <label className="text-[10px] uppercase tracking-wider font-medium text-slate-500 mb-2 block">
          Active Project
        </label>
        <DropdownMenu open={isProjectDropdownOpen} onOpenChange={setIsProjectDropdownOpen}>
          <DropdownMenuTrigger asChild>
            <button 
              className={cn(
                "w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-left text-sm transition-all duration-200",
                "bg-slate-800/50 hover:bg-slate-800 border border-slate-700/50 hover:border-slate-600",
                "focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50"
              )}
              aria-expanded={isProjectDropdownOpen}
              aria-haspopup="listbox"
            >
              <div className="flex items-center min-w-0 flex-1 gap-2">
                {activeProject ? (
                  <>
                    <FolderKanban className="w-4 h-4 flex-shrink-0 text-violet-400" />
                    <span className="truncate text-slate-200 font-medium">{activeProject.name}</span>
                    {activeProject.instructions && (
                      <span title="Has custom instructions">
                        <Sparkles className="w-3 h-3 text-amber-400 flex-shrink-0" />
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    <Globe className="w-4 h-4 flex-shrink-0 text-slate-500" />
                    <span className="text-slate-400">General (No Project)</span>
                  </>
                )}
              </div>
              <ChevronDown className={cn(
                "w-4 h-4 flex-shrink-0 text-slate-500 transition-transform duration-200",
                isProjectDropdownOpen && "rotate-180"
              )} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent 
            className="w-56 bg-slate-900 border-slate-700 shadow-xl shadow-black/20" 
            align="start" 
            role="listbox" 
            aria-label="Select a project"
          >
            {/* General / No Project Option */}
            <DropdownMenuItem 
              onClick={() => handleProjectSelect(null)}
              className={cn(
                "flex items-center justify-between cursor-pointer",
                "hover:bg-slate-800 focus:bg-slate-800",
                activeProjectId === null && "bg-violet-500/10 text-violet-300"
              )}
            >
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-slate-500" />
                <span className="text-slate-300">General (No Project)</span>
              </div>
            </DropdownMenuItem>
            
            {projects.length > 0 && <DropdownMenuSeparator className="bg-slate-700/50" />}
            
            {/* Project List */}
            {isLoading ? (
              <div className="px-2 py-3 text-sm text-slate-500 text-center">
                Loading projects...
              </div>
            ) : projects.length === 0 ? (
              <div className="px-2 py-3 text-sm text-slate-500 text-center">
                No projects yet
              </div>
            ) : (
              projects.map((project) => (
                <DropdownMenuItem
                  key={project.id}
                  onClick={() => handleProjectSelect(project.id)}
                  className={cn(
                    "flex items-center justify-between group cursor-pointer",
                    "hover:bg-slate-800 focus:bg-slate-800",
                    activeProjectId === project.id && "bg-violet-500/10 text-violet-300"
                  )}
                >
                  <div className="flex items-center min-w-0 flex-1 gap-2">
                    <FolderKanban className="w-4 h-4 flex-shrink-0 text-violet-400" />
                    <span className="truncate text-slate-300">{project.name}</span>
                    {project.instructions && (
                      <span title="Has custom instructions">
                        <Sparkles className="w-3 h-3 text-amber-400 flex-shrink-0" />
                      </span>
                    )}
                    {project.isDefault && (
                      <span className="text-[10px] text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded">
                        default
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => handleEditProject(e, project)}
                      className="p-1.5 hover:bg-slate-700 rounded-md transition-colors"
                      title="Edit project"
                    >
                      <Pencil className="w-3 h-3 text-slate-400" />
                    </button>
                    <button
                      onClick={(e) => handleDeleteProject(e, project)}
                      className="p-1.5 hover:bg-red-500/20 rounded-md transition-colors"
                      title="Delete project"
                    >
                      <Trash2 className="w-3 h-3 text-slate-400 hover:text-red-400" />
                    </button>
                  </div>
                </DropdownMenuItem>
              ))
            )}
            
            <DropdownMenuSeparator className="bg-slate-700/50" />
            
            {/* Create New Project */}
            <DropdownMenuItem 
              onClick={() => {
                setIsProjectDropdownOpen(false);
                onOpenProjectSettings?.();
              }}
              className="cursor-pointer hover:bg-slate-800 focus:bg-slate-800"
            >
              <Plus className="w-4 h-4 mr-2 text-violet-400" />
              <span className="text-violet-400 font-medium">Create New Project</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        
        {/* Active project info card */}
        {activeProject && (
          <div className="mt-2.5 p-2.5 bg-gradient-to-br from-violet-500/10 to-purple-500/5 border border-violet-500/20 rounded-lg">
            <p className="text-xs text-slate-400 truncate" title={activeProject.description || 'No description'}>
              {activeProject.description || 'No description'}
            </p>
            {activeProject.instructions && (
              <p className="text-[10px] text-amber-400/80 mt-1.5 flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                Custom instructions active
              </p>
            )}
          </div>
        )}
      </div>
      
      {/* New Chat Button */}
      <div className="p-3">
        <button 
          onClick={onNewChat}
          className={cn(
            "flex items-center justify-center w-full gap-2 py-2.5 px-4 rounded-lg text-sm font-medium transition-all duration-200",
            "bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500",
            "text-white shadow-lg shadow-violet-500/20 hover:shadow-violet-500/30",
            "focus:outline-none focus:ring-2 focus:ring-violet-500/50"
          )}
        >
          <Plus className="w-4 h-4" />
          New Chat
        </button>
      </div>
      
      {/* Recent Chats Section */}
      <div className="flex-1 overflow-y-auto px-3 pb-3">
        <div className="flex items-center gap-2 mb-2">
          <History className="w-3.5 h-3.5 text-slate-500" />
          <h2 className="text-[10px] uppercase tracking-wider font-medium text-slate-500">Recent</h2>
        </div>
        <nav className="space-y-1">
          <a 
            href="#" 
            className={cn(
              "flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-all duration-200",
              "bg-violet-500/10 text-violet-300 border border-violet-500/20"
            )}
          >
            <MessageSquare className="w-4 h-4 flex-shrink-0" />
            <span className="truncate">Designing a modern UI...</span>
          </a>
          <a 
            href="#" 
            className={cn(
              "flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-all duration-200",
              "text-slate-400 hover:bg-slate-800/50 hover:text-slate-300"
            )}
          >
            <MessageSquare className="w-4 h-4 flex-shrink-0 text-slate-500" />
            <span className="truncate">React component patterns</span>
          </a>
          <a 
            href="#" 
            className={cn(
              "flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-all duration-200",
              "text-slate-400 hover:bg-slate-800/50 hover:text-slate-300"
            )}
          >
            <MessageSquare className="w-4 h-4 flex-shrink-0 text-slate-500" />
            <span className="truncate">Python data analysis script</span>
          </a>
        </nav>
      </div>
      
      {/* Footer / Settings */}
      <div className="p-3 border-t border-slate-800/50">
        <a 
          href="#" 
          className={cn(
            "flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-all duration-200",
            "text-slate-400 hover:bg-slate-800/50 hover:text-slate-300"
          )}
        >
          <Settings className="w-4 h-4 text-slate-500" />
          Settings
        </a>
      </div>
    </aside>
  );
};

export default Sidebar;
