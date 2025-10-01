import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Edit, 
  Save, 
  X, 
  FolderOpen, 
  Tag, 
  FileText, 
  Globe, 
  Lock,
  AlertCircle
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Checkbox } from '../ui/checkbox';
import { Badge } from '../ui/badge';
import { toast } from 'sonner';
import { type FileItem, type UpdateFileData, useFileManager } from '../../hooks/useFileManager';

interface EditFileModalProps {
  isOpen: boolean;
  onClose: () => void;
  file: FileItem | null;
}

// Holographic Bubble Component to match app aesthetic
const HolographicBubble: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className }) => (
  <motion.div
    initial={{ opacity: 0, scale: 0.8, y: 20 }}
    animate={{ opacity: 1, scale: 1, y: 0 }}
    transition={{ type: "spring", damping: 20, stiffness: 300 }}
    className={`
      relative p-4 rounded-xl backdrop-blur-xl border overflow-hidden
      bg-gradient-to-br from-slate-800/40 to-slate-900/40 border-slate-600/30
      ${className}
    `}
  >
    <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-white/5 to-transparent" />
    <div className="relative z-10">{children}</div>
    
  </motion.div>
);

export const EditFileModal: React.FC<EditFileModalProps> = ({
  isOpen,
  onClose,
  file
}) => {
  const fileManager = useFileManager();
  
  // Form state
  const [formData, setFormData] = useState<UpdateFileData>({
    name: '',
    description: '',
    tags: [],
    folder: '',
    isPublic: false
  });
  
  const [tagInput, setTagInput] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [hasChanges, setHasChanges] = useState(false);

  // Get available folders
  const { data: folders } = fileManager.useFolders();

  // Initialize form data when file changes
  useEffect(() => {
    if (file && isOpen) {
      setFormData({
        name: file.name,
        description: file.description || '',
        tags: file.tags || [],
        folder: file.folder,
        isPublic: file.isPublic
      });
      setTagInput('');
      setErrors({});
      setHasChanges(false);
    }
  }, [file, isOpen]);

  // Track changes
  useEffect(() => {
    if (!file) return;
    
    const hasNameChange = formData.name !== file.name;
    const hasDescriptionChange = formData.description !== (file.description || '');
    const hasTagsChange = JSON.stringify(formData.tags) !== JSON.stringify(file.tags || []);
    const hasFolderChange = formData.folder !== file.folder;
    const hasPublicChange = formData.isPublic !== file.isPublic;
    
    setHasChanges(hasNameChange || hasDescriptionChange || hasTagsChange || hasFolderChange || hasPublicChange);
  }, [formData, file]);

  // Validation
  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name?.trim()) {
      newErrors.name = 'File name is required';
    } else if (formData.name.length > 255) {
      newErrors.name = 'File name must be less than 255 characters';
    }

    if (formData.description && formData.description.length > 1000) {
      newErrors.description = 'Description must be less than 1000 characters';
    }

    if (formData.tags && formData.tags.length > 10) {
      newErrors.tags = 'Maximum 10 tags allowed';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleAddTag = () => {
    const tag = tagInput.trim();
    if (tag && !formData.tags?.includes(tag)) {
      setFormData(prev => ({
        ...prev,
        tags: [...(prev.tags || []), tag]
      }));
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags?.filter(tag => tag !== tagToRemove) || []
    }));
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTag();
    }
  };

  const handleSave = async () => {
    if (!file || !validateForm()) return;

    try {
      await fileManager.updateFile({ fileId: file.id, data: formData });
      toast.success('File updated successfully');
      onClose();
    } catch (error) {
      console.error('Update failed:', error);
      toast.error('Failed to update file');
    }
  };

  const handleCancel = () => {
    if (hasChanges) {
      if (confirm('You have unsaved changes. Are you sure you want to close?')) {
        onClose();
      }
    } else {
      onClose();
    }
  };

  if (!file) return null;

  return (
    <Dialog open={isOpen} onOpenChange={handleCancel}>
      <DialogContent className="sm:max-w-[600px] bg-slate-950 border-slate-700 text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-semibold text-white">
            <Edit className="w-5 h-5 text-violet-400" />
            Edit File
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* File Info */}
          <HolographicBubble>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <h3 className="font-medium text-white">{file.originalName}</h3>
                <p className="text-sm text-slate-400">
                  {(file.size / 1024 / 1024).toFixed(2)} MB • {file.mimeType}
                </p>
              </div>
              <Badge variant="secondary" className="bg-slate-500/20 text-slate-300 border-slate-400/30">
                Version {file.currentVersion}
              </Badge>
            </div>
          </HolographicBubble>

          {/* Edit Form */}
          <HolographicBubble>
            <div className="space-y-6">
              <h4 className="font-medium text-white flex items-center gap-2">
                <FileText className="w-4 h-4" />
                File Information
              </h4>

              {/* File Name */}
              <div className="space-y-2">
                <Label htmlFor="name" className="text-slate-300">File Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  className="bg-slate-800/50 border-slate-600/50 text-white placeholder:text-slate-400 focus:border-violet-400/50"
                  placeholder="Enter file name"
                />
                {errors.name && (
                  <div className="flex items-center gap-2 text-red-400 text-sm">
                    <AlertCircle className="w-4 h-4" />
                    {errors.name}
                  </div>
                )}
              </div>

              {/* Description */}
              <div className="space-y-2">
                <Label htmlFor="description" className="text-slate-300">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  className="bg-slate-800/50 border-slate-600/50 text-white placeholder:text-slate-400 focus:border-violet-400/50 min-h-[80px]"
                  placeholder="Enter file description (optional)"
                />
                {errors.description && (
                  <div className="flex items-center gap-2 text-red-400 text-sm">
                    <AlertCircle className="w-4 h-4" />
                    {errors.description}
                  </div>
                )}
                <p className="text-xs text-slate-500">
                  {formData.description?.length || 0}/1000 characters
                </p>
              </div>

              {/* Folder */}
              <div className="space-y-2">
                <Label htmlFor="folder" className="text-slate-300">Folder</Label>
                <Select 
                  value={formData.folder} 
                  onValueChange={(value) => setFormData(prev => ({ ...prev, folder: value }))}
                >
                  <SelectTrigger className="bg-slate-800/50 border-slate-600/50 text-white">
                    <SelectValue placeholder="Select folder" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-600">
                    <SelectItem value="/" className="text-white">
                      <div className="flex items-center gap-2">
                        <FolderOpen className="w-4 h-4" />
                        Root folder
                      </div>
                    </SelectItem>
                    {folders?.map(folder => (
                      <SelectItem key={folder} value={folder} className="text-white">
                        <div className="flex items-center gap-2">
                          <FolderOpen className="w-4 h-4" />
                          {folder}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Tags */}
              <div className="space-y-3">
                <Label className="text-slate-300">Tags</Label>
                
                {/* Current Tags */}
                {formData.tags && formData.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {formData.tags.map((tag) => (
                      <Badge 
                        key={tag} 
                        variant="secondary" 
                        className="bg-violet-500/20 text-violet-300 border-violet-400/30 cursor-pointer hover:bg-red-500/20 hover:text-red-300 hover:border-red-400/30 transition-colors"
                        onClick={() => handleRemoveTag(tag)}
                      >
                        <Tag className="w-3 h-3 mr-1" />
                        {tag}
                        <X className="w-3 h-3 ml-1" />
                      </Badge>
                    ))}
                  </div>
                )}

                {/* Add Tag Input */}
                <div className="flex gap-2">
                  <Input
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyPress={handleKeyPress}
                    className="bg-slate-800/50 border-slate-600/50 text-white placeholder:text-slate-400 focus:border-violet-400/50"
                    placeholder="Add a tag..."
                  />
                  <Button
                    type="button"
                    onClick={handleAddTag}
                    disabled={!tagInput.trim() || (formData.tags?.length || 0) >= 10}
                    variant="outline"
                    className="border-slate-600/50 text-slate-300 hover:text-white hover:bg-slate-700/50"
                  >
                    Add
                  </Button>
                </div>
                
                {errors.tags && (
                  <div className="flex items-center gap-2 text-red-400 text-sm">
                    <AlertCircle className="w-4 h-4" />
                    {errors.tags}
                  </div>
                )}
                
                <p className="text-xs text-slate-500">
                  {formData.tags?.length || 0}/10 tags • Press Enter or click Add to create a tag
                </p>
              </div>

              {/* Privacy Settings */}
              <div className="space-y-3">
                <Label className="text-slate-300">Privacy</Label>
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="isPublic" 
                    checked={formData.isPublic}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, isPublic: checked === true }))}
                    className="border-slate-600"
                  />
                  <Label htmlFor="isPublic" className="text-slate-300 flex items-center gap-2">
                    {formData.isPublic ? (
                      <Globe className="w-4 h-4 text-green-400" />
                    ) : (
                      <Lock className="w-4 h-4 text-slate-400" />
                    )}
                    Make file public
                  </Label>
                </div>
                <p className="text-xs text-slate-500">
                  Public files can be accessed by anyone with the link
                </p>
              </div>
            </div>
          </HolographicBubble>

          {/* Actions */}
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              {hasChanges && (
                <motion.div
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-center gap-2 text-amber-400 text-sm"
                >
                  <AlertCircle className="w-4 h-4" />
                  Unsaved changes
                </motion.div>
              )}
            </div>
            
            <div className="flex gap-3">
              <Button 
                variant="outline" 
                onClick={handleCancel}
                className="border-slate-600/50 text-slate-300 hover:text-white hover:bg-slate-700/50"
              >
                Cancel
              </Button>
              <Button 
                onClick={handleSave}
                disabled={fileManager.isUpdating || !hasChanges || Object.keys(errors).length > 0}
                className="bg-violet-600 hover:bg-violet-700 text-white"
              >
                {fileManager.isUpdating ? (
                  <>
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      className="w-4 h-4 mr-2"
                    >
                      ⟳
                    </motion.div>
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Save Changes
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}; 