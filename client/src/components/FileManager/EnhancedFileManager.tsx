import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Search, 
  FolderOpen, 
  Grid, 
  List, 
  Plus,
  Trash2,
  Download,
  Share,
  Brain,
  Settings,
  Keyboard,
  Filter,
  SortAsc,
  SortDesc,
  FolderKanban
} from 'lucide-react';
import { useFileManager, type FileItem, type UploadFileData, type ListFilesOptions } from '../../hooks/useFileManager';
import { useProjects } from '../../hooks/useProjects';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { toast } from 'sonner';

// Import enhanced components
import { EnhancedFileCard } from './EnhancedFileCard';
import { InlineUploadArea } from './InlineUploadArea';
import { SkeletonLoader, EmptyStateSkeleton } from './SkeletonLoader';
import { FileEmptyStates } from '../EmptyStates';
import { AnalysisStatusCard } from './AnalysisStatusCard';
import { AnalysisModal } from './AnalysisModal';
import { TestModal } from './TestModal';
import { ShareFileModal } from './ShareFileModal';
import { EditFileModal } from './EditFileModal';

interface EnhancedFileManagerProps {
  className?: string;
  initialFolder?: string;
  onFileSelect?: (file: FileItem) => void;
  maxFileSize?: number;
  allowedFileTypes?: string[];
  enableAIAnalysis?: boolean;
  showUploadArea?: boolean;
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
      relative p-6 rounded-2xl backdrop-blur-xl border overflow-hidden
      bg-gradient-to-br from-slate-800/40 to-slate-900/40 border-slate-600/30
      ${className}
    `}
  >
    <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/5 to-transparent" />
    <div className="relative z-10">{children}</div>
    
  </motion.div>
);

export const EnhancedFileManager: React.FC<EnhancedFileManagerProps> = ({
  className = '',
  initialFolder = '/',
  onFileSelect,
  maxFileSize = 10 * 1024 * 1024,
  allowedFileTypes,
  enableAIAnalysis = true,
  showUploadArea = true
}) => {
  const fileManager = useFileManager();
  const { activeProjectId, activeProject } = useProjects();
  
  // State management
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFolder, setSelectedFolder] = useState(initialFolder);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [mimeTypeFilter, setMimeTypeFilter] = useState('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [sortBy, setSortBy] = useState<'name' | 'date' | 'size'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [selectedFiles, setSelectedFiles] = useState<Set<number>>(new Set());
  const [showUploadZone, setShowUploadZone] = useState(showUploadArea);
  const [showKeyboardShortcuts, setShowKeyboardShortcuts] = useState(false);
  
  // File operations state
  const [filesToUpload, setFilesToUpload] = useState<File[]>([]);
  const [uploadData, setUploadData] = useState<Partial<UploadFileData>>({
    folder: selectedFolder,
    description: '',
    tags: []
  });

  // Analysis modal state
  const [analysisModalFile, setAnalysisModalFile] = useState<FileItem | null>(null);
  const [isAnalysisModalOpen, setIsAnalysisModalOpen] = useState(false);
  
  // Test modal state
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);

  // Share modal state
  const [shareModalFile, setShareModalFile] = useState<FileItem | null>(null);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);

  // Edit modal state
  const [editModalFile, setEditModalFile] = useState<FileItem | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  // Query options - include projectId for filtering
  const listOptions: ListFilesOptions = {
    folder: selectedFolder === '/' ? undefined : selectedFolder,
    search: searchQuery || undefined,
    tags: selectedTags.length > 0 ? selectedTags : undefined,
    mimeType: mimeTypeFilter && mimeTypeFilter !== 'all' ? mimeTypeFilter : undefined,
    projectId: activeProjectId ?? undefined, // Filter by active project
    limit: 50,
    offset: 0
  };

  // Fetch data
  const { data: fileList, isLoading, error } = fileManager.useFileList(listOptions);
  const { data: folders } = fileManager.useFolders();

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle shortcuts when not typing in input fields
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.key) {
        case 'a':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            if (fileList?.files.length) {
              setSelectedFiles(new Set(fileList.files.map(f => f.id)));
            }
          }
          break;
        case 'Escape':
          setSelectedFiles(new Set());
          break;
        case 'Delete':
          if (selectedFiles.size > 0) {
            e.preventDefault();
            handleBulkDelete();
          }
          break;
        case 'g':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            setViewMode(prev => prev === 'grid' ? 'list' : 'grid');
          }
          break;
        case 'u':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            setShowUploadZone(prev => !prev);
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedFiles, fileList, viewMode]);

  // File operations - include projectId in uploads
  const handleFileUpload = useCallback(async (files: File[]) => {
    setFilesToUpload(files);
    
    for (const file of files) {
      try {
        await fileManager.uploadFile({
          file,
          folder: uploadData.folder || selectedFolder,
          description: uploadData.description,
          tags: uploadData.tags,
          projectId: activeProjectId ?? undefined // Include projectId for scoping
        });
        toast.success(`File "${file.name}" uploaded successfully${activeProject ? ` to project "${activeProject.name}"` : ''}`);
      } catch (error) {
        toast.error(`Failed to upload "${file.name}"`);
      }
    }
    
    setFilesToUpload([]);
    setUploadData({ folder: selectedFolder, description: '', tags: [] });
  }, [fileManager, uploadData, selectedFolder, activeProjectId, activeProject]);

  const handleFileDownload = async (file: FileItem) => {
    try {
      await fileManager.downloadFile(file.id, file.originalName);
      toast.success('Download started');
    } catch (error) {
      toast.error('Download failed');
    }
  };

  const handleFileAnalyze = async (fileId: number) => {
    try {
      await fileManager.analyzeFile(fileId);
      toast.success('File analysis completed');
    } catch (error) {
      toast.error('Analysis failed. Please check your subscription status.');
    }
  };

  const handleViewAnalysis = (file: FileItem) => {
    console.log('handleViewAnalysis called with file:', file);
    console.log('File analysis status:', file.analysisStatus);
    console.log('File analysis data:', file.aiAnalysis);
    console.log('Full file object:', JSON.stringify(file, null, 2));
    setAnalysisModalFile(file);
    setIsAnalysisModalOpen(true);
  };

  const handleCloseAnalysisModal = () => {
    setIsAnalysisModalOpen(false);
    setAnalysisModalFile(null);
  };

  const handleFileDelete = async (fileId: number) => {
    try {
      await fileManager.deleteFile(fileId);
      toast.success('File deleted');
      setSelectedFiles(prev => {
        const newSet = new Set(prev);
        newSet.delete(fileId);
        return newSet;
      });
    } catch (error) {
      toast.error('Failed to delete file');
    }
  };

  const handleBulkDelete = async () => {
    if (selectedFiles.size === 0) return;
    
    try {
      await fileManager.bulkDeleteFiles(Array.from(selectedFiles));
      toast.success('Files deleted successfully');
      setSelectedFiles(new Set());
    } catch (error) {
      toast.error('Bulk delete failed');
    }
  };

  const handleFileShare = async (file: FileItem) => {
    setShareModalFile(file);
    setIsShareModalOpen(true);
  };

  const handleFileEdit = (file: FileItem) => {
    setEditModalFile(file);
    setIsEditModalOpen(true);
  };

  const handleCloseShareModal = () => {
    setIsShareModalOpen(false);
    setShareModalFile(null);
  };

  const handleCloseEditModal = () => {
    setIsEditModalOpen(false);
    setEditModalFile(null);
  };

  const handleFileSelect = (fileId: number) => {
    if (onFileSelect) {
      const file = fileList?.files.find(f => f.id === fileId);
      if (file) onFileSelect(file);
    } else {
      setSelectedFiles(prev => {
        const newSet = new Set(prev);
        if (newSet.has(fileId)) {
          newSet.delete(fileId);
        } else {
          newSet.add(fileId);
        }
        return newSet;
      });
    }
  };

  // Sort files
  const sortedFiles = fileList?.files ? [...fileList.files].sort((a, b) => {
    let comparison = 0;
    
    switch (sortBy) {
      case 'name':
        comparison = a.name.localeCompare(b.name);
        break;
      case 'date':
        comparison = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
        break;
      case 'size':
        comparison = a.size - b.size;
        break;
    }
    
    return sortOrder === 'asc' ? comparison : -comparison;
  }) : [];

  return (
    <TooltipProvider>
      <div className={`flex flex-col h-full bg-slate-950 text-white ${className}`}>
        {/* Header */}
        <HolographicBubble className="m-4 mb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <h2 className="text-xl font-semibold text-white">File Manager</h2>
              
              {/* Project indicator */}
              {activeProject && (
                <Badge variant="outline" className="bg-violet-500/10 text-violet-300 border-violet-400/30">
                  <FolderKanban className="w-3 h-3 mr-1" />
                  {activeProject.name}
                </Badge>
              )}
              
              {selectedFiles.size > 0 && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex items-center space-x-2"
                >
                  <Badge variant="secondary" className="bg-violet-500/20 text-violet-300 border-violet-400/30">
                    {selectedFiles.size} selected
                  </Badge>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={handleBulkDelete}
                    disabled={fileManager.isBulkDeleting}
                    className="bg-red-500/20 hover:bg-red-500/30 border-red-400/30 text-red-300"
                  >
                    <Trash2 className="w-4 h-4 mr-1" />
                    Delete
                  </Button>
                </motion.div>
              )}
            </div>
            
            <div className="flex items-center space-x-2">
              {/* View Mode Toggle */}
              <div className="flex items-center border border-slate-600/50 rounded-lg bg-slate-800/30">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant={viewMode === 'grid' ? 'default' : 'ghost'}
                      onClick={() => setViewMode('grid')}
                      className={`rounded-r-none ${viewMode === 'grid' ? 'bg-violet-500/20 text-violet-300 border-violet-400/30' : 'text-slate-300 hover:text-white hover:bg-slate-700/50'}`}
                    >
                      <Grid className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Grid view (Ctrl+G)</TooltipContent>
                </Tooltip>
                
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant={viewMode === 'list' ? 'default' : 'ghost'}
                      onClick={() => setViewMode('list')}
                      className={`rounded-l-none ${viewMode === 'list' ? 'bg-violet-500/20 text-violet-300 border-violet-400/30' : 'text-slate-300 hover:text-white hover:bg-slate-700/50'}`}
                    >
                      <List className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>List view (Ctrl+G)</TooltipContent>
                </Tooltip>
              </div>

              {/* Upload Toggle */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant={showUploadZone ? 'default' : 'outline'}
                    onClick={() => setShowUploadZone(!showUploadZone)}
                    className={showUploadZone 
                      ? 'bg-violet-500/20 text-violet-300 border-violet-400/30' 
                      : 'border-slate-600/50 text-white bg-slate-800/50 hover:text-violet-300 hover:bg-violet-500/10 hover:border-violet-400/30'
                    }
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Upload
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Toggle upload area (Ctrl+U)</TooltipContent>
              </Tooltip>

              {/* Test Modal Button */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setIsTestModalOpen(true)}
                    className="text-slate-300 hover:text-white hover:bg-slate-700/50"
                  >
                    Test
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Test Modal</TooltipContent>
              </Tooltip>

              {/* Keyboard Shortcuts */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setShowKeyboardShortcuts(!showKeyboardShortcuts)}
                    className="text-slate-300 hover:text-white hover:bg-slate-700/50"
                  >
                    <Keyboard className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Keyboard shortcuts</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </HolographicBubble>

        {/* Keyboard Shortcuts Modal */}
        <AnimatePresence>
          {showKeyboardShortcuts && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="mx-4 mb-2"
            >
              <HolographicBubble>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div><kbd className="px-2 py-1 bg-slate-700/50 text-slate-300 rounded border border-slate-600/50">Ctrl+A</kbd> Select all</div>
                  <div><kbd className="px-2 py-1 bg-slate-700/50 text-slate-300 rounded border border-slate-600/50">Ctrl+G</kbd> Toggle view</div>
                  <div><kbd className="px-2 py-1 bg-slate-700/50 text-slate-300 rounded border border-slate-600/50">Ctrl+U</kbd> Toggle upload</div>
                  <div><kbd className="px-2 py-1 bg-slate-700/50 text-slate-300 rounded border border-slate-600/50">Delete</kbd> Delete selected</div>
                </div>
              </HolographicBubble>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Upload Area */}
        <AnimatePresence>
          {showUploadZone && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mx-4 mb-2"
            >
              <HolographicBubble>
                <InlineUploadArea
                  onFilesSelected={handleFileUpload}
                  maxFileSize={maxFileSize}
                  allowedFileTypes={allowedFileTypes}
                  isUploading={fileManager.isUploading}
                  uploadProgress={fileManager.uploadProgress}
                />
              </HolographicBubble>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Filters and Search */}
        <HolographicBubble className="mx-4 mb-2">
          <div className="flex items-center space-x-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search files..."
                  className="pl-10 bg-slate-800/30 border-slate-600/50 text-white placeholder:text-slate-400 focus:border-violet-400/50"
                />
              </div>
            </div>

            <Select value={selectedFolder} onValueChange={setSelectedFolder}>
              <SelectTrigger className="w-48 bg-slate-800/30 border-slate-600/50 text-white">
                <SelectValue placeholder="All folders" />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-600">
                <SelectItem value="/">All folders</SelectItem>
                {folders?.map(folder => (
                  <SelectItem key={folder} value={folder}>
                    <FolderOpen className="w-4 h-4 mr-2 inline" />
                    {folder}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={mimeTypeFilter} onValueChange={setMimeTypeFilter}>
              <SelectTrigger className="w-40 bg-slate-800/30 border-slate-600/50 text-white">
                <SelectValue placeholder="File type" />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-600">
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="image/">Images</SelectItem>
                <SelectItem value="text/">Text files</SelectItem>
                <SelectItem value="application/pdf">PDF</SelectItem>
                <SelectItem value="video/">Videos</SelectItem>
                <SelectItem value="audio/">Audio</SelectItem>
              </SelectContent>
            </Select>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="border-slate-600/50 text-slate-300 hover:text-white hover:bg-slate-700/50">
                  <SortAsc className="w-4 h-4 mr-1" />
                  Sort
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="bg-slate-800 border-slate-600">
                <DropdownMenuItem onClick={() => { setSortBy('name'); setSortOrder('asc'); }}>
                  Name A-Z
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => { setSortBy('name'); setSortOrder('desc'); }}>
                  Name Z-A
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => { setSortBy('date'); setSortOrder('desc'); }}>
                  Newest first
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => { setSortBy('date'); setSortOrder('asc'); }}>
                  Oldest first
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => { setSortBy('size'); setSortOrder('desc'); }}>
                  Largest first
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => { setSortBy('size'); setSortOrder('asc'); }}>
                  Smallest first
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </HolographicBubble>

        {/* File List */}
        <div className="flex-1 overflow-auto p-4">
          {isLoading ? (
            <SkeletonLoader viewMode={viewMode} count={8} />
          ) : error ? (
            <div className="flex items-center justify-center h-64">
              <HolographicBubble>
                <div className="text-center text-red-400">
                  <p>Failed to load files</p>
                  <p className="text-sm text-slate-400">{error.message}</p>
                </div>
              </HolographicBubble>
            </div>
          ) : !sortedFiles.length ? (
            <div className="h-64">
              {searchQuery || selectedFolder !== '/' ? (
                <FileEmptyStates.NoFilesInFolder 
                  currentFolder={selectedFolder}
                  onUpload={() => {
                    // Trigger file upload
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.multiple = true;
                    input.onchange = (e) => {
                      const files = (e.target as HTMLInputElement).files;
                      if (files) {
                        handleFileUpload(Array.from(files));
                      }
                    };
                    input.click();
                  }}
                />
              ) : (
                <FileEmptyStates.NoFiles 
                  onUpload={() => {
                    // Trigger file upload
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.multiple = true;
                    input.onchange = (e) => {
                      const files = (e.target as HTMLInputElement).files;
                      if (files) {
                        handleFileUpload(Array.from(files));
                      }
                    };
                    input.click();
                  }}
                />
              )}
            </div>
          ) : (
            <div className={viewMode === 'grid' 
              ? "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4"
              : "space-y-2"
            }>
              {sortedFiles.map((file) => (
                <EnhancedFileCard
                  key={file.id}
                  file={file}
                  isSelected={selectedFiles.has(file.id)}
                  onSelect={handleFileSelect}
                  onDownload={handleFileDownload}
                  onEdit={handleFileEdit}
                  onAnalyze={handleFileAnalyze}
                  onReindex={(id) => fileManager.reindexFile(id)}
                  onDelete={handleFileDelete}
                  onShare={handleFileShare}
                  onViewAnalysis={handleViewAnalysis}
                  viewMode={viewMode}
                  enableAIAnalysis={enableAIAnalysis}
                />
              ))}
            </div>
          )}
        </div>

        {/* Pagination */}
        {fileList && fileList.total > fileList.files.length && (
          <div className="p-4">
            <HolographicBubble>
              <div className="flex justify-between items-center">
                <p className="text-sm text-slate-400">
                  Showing {fileList.files.length} of {fileList.total} files
                </p>
                <Button variant="outline" className="border-slate-600/50 text-slate-300 hover:text-white hover:bg-slate-700/50">Load More</Button>
              </div>
            </HolographicBubble>
          </div>
        )}

        {/* Analysis Modal */}
        <AnalysisModal
          isOpen={isAnalysisModalOpen}
          onClose={handleCloseAnalysisModal}
          file={analysisModalFile}
        />

        {/* Test Modal */}
        <TestModal
          isOpen={isTestModalOpen}
          onClose={() => setIsTestModalOpen(false)}
        />

        {/* Share Modal */}
        <ShareFileModal
          isOpen={isShareModalOpen}
          onClose={handleCloseShareModal}
          file={shareModalFile}
        />

        {/* Edit Modal */}
        <EditFileModal
          isOpen={isEditModalOpen}
          onClose={handleCloseEditModal}
          file={editModalFile}
        />
      </div>
    </TooltipProvider>
  );
}; 