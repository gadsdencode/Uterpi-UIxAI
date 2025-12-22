// ProjectSettingsModal.tsx - Modal for creating and editing projects
// Provides a form for project name, description, and custom instructions

import React, { useState, useEffect } from 'react';
import { X, FolderKanban, Sparkles, Save, Trash2 } from 'lucide-react';
import { useProjects, type Project, type CreateProjectInput, type UpdateProjectInput } from '../hooks/useProjects';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Switch } from './ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';

interface ProjectSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  project?: Project; // If provided, we're editing; otherwise creating
}

export const ProjectSettingsModal: React.FC<ProjectSettingsModalProps> = ({
  isOpen,
  onClose,
  project,
}) => {
  const { createProject, updateProject, deleteProject, setActiveProjectId } = useProjects();
  
  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [instructions, setInstructions] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const isEditing = !!project;
  
  // Initialize form when project changes
  useEffect(() => {
    if (project) {
      setName(project.name);
      setDescription(project.description || '');
      setInstructions(project.instructions || '');
      setIsDefault(project.isDefault);
    } else {
      setName('');
      setDescription('');
      setInstructions('');
      setIsDefault(false);
    }
    setError(null);
  }, [project, isOpen]);
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    if (!name.trim()) {
      setError('Project name is required');
      return;
    }
    
    setIsSaving(true);
    
    try {
      if (isEditing && project) {
        const updates: UpdateProjectInput = {
          name: name.trim(),
          description: description.trim() || null,
          instructions: instructions.trim() || null,
          isDefault,
        };
        await updateProject(project.id, updates);
      } else {
        const input: CreateProjectInput = {
          name: name.trim(),
          description: description.trim() || undefined,
          instructions: instructions.trim() || undefined,
          isDefault,
        };
        const newProject = await createProject(input);
        // Auto-select the newly created project
        await setActiveProjectId(newProject.id);
      }
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save project');
    } finally {
      setIsSaving(false);
    }
  };
  
  const handleDelete = async () => {
    if (!project) return;
    
    if (!confirm(`Are you sure you want to delete "${project.name}"? Files and conversations will be unlinked but not deleted.`)) {
      return;
    }
    
    setIsSaving(true);
    try {
      await deleteProject(project.id);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to delete project');
    } finally {
      setIsSaving(false);
    }
  };
  
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[600px] bg-slate-900 border-slate-700">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <FolderKanban className="w-5 h-5 text-violet-400" />
            {isEditing ? 'Edit Project' : 'Create New Project'}
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            {isEditing 
              ? 'Update your project settings and custom instructions.' 
              : 'Create a new project to organize your chats and files with custom AI instructions.'}
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Project Name */}
          <div className="space-y-2">
            <Label htmlFor="name" className="text-white">
              Project Name <span className="text-red-400">*</span>
            </Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Finance Bot, Marketing Assistant"
              className="bg-slate-800 border-slate-700 text-white"
              maxLength={100}
            />
          </div>
          
          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description" className="text-white">
              Description
            </Label>
            <Input
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of this project's purpose"
              className="bg-slate-800 border-slate-700 text-white"
              maxLength={500}
            />
            <p className="text-xs text-slate-500">
              Optional. Helps you identify the project at a glance.
            </p>
          </div>
          
          {/* Custom Instructions */}
          <div className="space-y-2">
            <Label htmlFor="instructions" className="text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              Custom Instructions (System Prompt)
            </Label>
            <Textarea
              id="instructions"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Enter custom instructions for the AI when working in this project. For example:

- You are a financial analyst specializing in portfolio management.
- Always provide citations when referencing data.
- Use formal language and include risk assessments.
- Format numbers with appropriate currency symbols."
              className="bg-slate-800 border-slate-700 text-white min-h-[200px] font-mono text-sm"
              maxLength={5000}
            />
            <div className="flex justify-between text-xs text-slate-500">
              <span>These instructions will be injected into every chat in this project.</span>
              <span>{instructions.length}/5000</span>
            </div>
          </div>
          
          {/* Default Project Toggle */}
          <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
            <div className="space-y-0.5">
              <Label htmlFor="isDefault" className="text-white cursor-pointer">
                Set as Default Project
              </Label>
              <p className="text-xs text-slate-500">
                Automatically select this project when you start the app
              </p>
            </div>
            <Switch
              id="isDefault"
              checked={isDefault}
              onCheckedChange={setIsDefault}
            />
          </div>
          
          {/* Error Message */}
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}
          
          <DialogFooter className="flex gap-2 sm:justify-between">
            {/* Delete Button (only for editing) */}
            {isEditing && (
              <Button
                type="button"
                variant="destructive"
                onClick={handleDelete}
                disabled={isSaving}
                className="mr-auto"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </Button>
            )}
            
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={isSaving}
                className="border-slate-700 text-slate-300"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSaving || !name.trim()}
                className="bg-violet-600 hover:bg-violet-700"
              >
                <Save className="w-4 h-4 mr-2" />
                {isSaving ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Project'}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default ProjectSettingsModal;

