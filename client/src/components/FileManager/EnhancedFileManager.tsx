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
  SortDesc
} from 'lucide-react';
import { useFileManager, type FileItem, type UploadFileData, type ListFilesOptions } from '../../hooks/useFileManager';
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
import { AnalysisStatusCard } from './AnalysisStatusCard';
import { AnalysisModal } from './AnalysisModal';
import { TestModal } from './TestModal';

interface EnhancedFileManagerProps {
  className?: string;
  initialFolder?: string;
  onFileSelect?: (file: FileItem) => void;
  maxFileSize?: number;
  allowedFileTypes?: string[];
  enableAIAnalysis?: boolean;
  showUploadArea?: boolean;
}

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

  // Query options
  const listOptions: ListFilesOptions = {
    folder: selectedFolder === '/' ? undefined : selectedFolder,
    search: searchQuery || undefined,
    tags: selectedTags.length > 0 ? selectedTags : undefined,
    mimeType: mimeTypeFilter && mimeTypeFilter !== 'all' ? mimeTypeFilter : undefined,
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

  // File operations
  const handleFileUpload = useCallback(async (files: File[]) => {
    setFilesToUpload(files);
    
    for (const file of files) {
      try {
        await fileManager.uploadFile({
          file,
          folder: uploadData.folder || selectedFolder,
          description: uploadData.description,
          tags: uploadData.tags
        });
        toast.success(`File "${file.name}" uploaded successfully`);
      } catch (error) {
        toast.error(`Failed to upload "${file.name}"`);
      }
    }
    
    setFilesToUpload([]);
    setUploadData({ folder: selectedFolder, description: '', tags: [] });
  }, [fileManager, uploadData, selectedFolder]);

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
    // Implement share functionality
    toast.info('Share functionality coming soon');
  };

  const handleFileEdit = (file: FileItem) => {
    // Implement edit functionality
    toast.info('Edit functionality coming soon');
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
      <div className={`flex flex-col h-full bg-white dark:bg-gray-900 ${className}`}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center space-x-4">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">File Manager</h2>
            
            {selectedFiles.size > 0 && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex items-center space-x-2"
              >
                <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                  {selectedFiles.size} selected
                </Badge>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={handleBulkDelete}
                  disabled={fileManager.isBulkDeleting}
                >
                  <Trash2 className="w-4 h-4 mr-1" />
                  Delete
                </Button>
              </motion.div>
            )}
          </div>
          
          <div className="flex items-center space-x-2">
            {/* View Mode Toggle */}
            <div className="flex items-center border border-gray-200 dark:border-gray-700 rounded-lg">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant={viewMode === 'grid' ? 'default' : 'ghost'}
                    onClick={() => setViewMode('grid')}
                    className="rounded-r-none"
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
                    className="rounded-l-none"
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
                >
                  <Keyboard className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Keyboard shortcuts</TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Keyboard Shortcuts Modal */}
        <AnimatePresence>
          {showKeyboardShortcuts && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="p-4 bg-blue-50 dark:bg-blue-900/20 border-b border-blue-200 dark:border-blue-800"
            >
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div><kbd className="px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded">Ctrl+A</kbd> Select all</div>
                <div><kbd className="px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded">Ctrl+G</kbd> Toggle view</div>
                <div><kbd className="px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded">Ctrl+U</kbd> Toggle upload</div>
                <div><kbd className="px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded">Delete</kbd> Delete selected</div>
              </div>
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
              className="p-4 border-b border-gray-200 dark:border-gray-700"
            >
              <InlineUploadArea
                onFilesSelected={handleFileUpload}
                maxFileSize={maxFileSize}
                allowedFileTypes={allowedFileTypes}
                isUploading={fileManager.isUploading}
                uploadProgress={fileManager.uploadProgress}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Filters and Search */}
        <div className="flex items-center space-x-4 p-4 bg-gray-50 dark:bg-gray-800">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search files..."
                className="pl-10"
              />
            </div>
          </div>

          <Select value={selectedFolder} onValueChange={setSelectedFolder}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="All folders" />
            </SelectTrigger>
            <SelectContent>
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
            <SelectTrigger className="w-40">
              <SelectValue placeholder="File type" />
            </SelectTrigger>
            <SelectContent>
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
              <Button variant="outline" size="sm">
                <SortAsc className="w-4 h-4 mr-1" />
                Sort
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
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

        {/* File List */}
        <div className="flex-1 overflow-auto p-4">
          {isLoading ? (
            <SkeletonLoader viewMode={viewMode} count={8} />
          ) : error ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-center text-red-500">
                <p>Failed to load files</p>
                <p className="text-sm">{error.message}</p>
              </div>
            </div>
          ) : !sortedFiles.length ? (
            <EmptyStateSkeleton />
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
          <div className="p-4 border-t border-gray-200 dark:border-gray-700">
            <div className="flex justify-between items-center">
              <p className="text-sm text-gray-500">
                Showing {fileList.files.length} of {fileList.total} files
              </p>
              <Button variant="outline">Load More</Button>
            </div>
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
      </div>
    </TooltipProvider>
  );
}; 