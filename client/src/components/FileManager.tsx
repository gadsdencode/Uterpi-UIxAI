import React, { useState, useRef, useCallback } from 'react';
import { 
  Upload, 
  Search, 
  FolderOpen, 
  File, 
  Download, 
  Share, 
  Trash2, 
  Edit, 
  Eye,
  Brain,
  History,
  MoreVertical,
  Tag,
  Filter,
  Grid,
  List,
  Plus,
  X
} from 'lucide-react';
import { useFileManager, type FileItem, type UploadFileData, type ListFilesOptions } from '../hooks/useFileManager';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { Progress } from './ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu';
import { Textarea } from './ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { toast } from 'sonner';

interface FileManagerProps {
  className?: string;
  initialFolder?: string;
  onFileSelect?: (file: FileItem) => void;
  maxFileSize?: number; // in bytes
  allowedFileTypes?: string[];
  enableAIAnalysis?: boolean;
}

export const FileManager: React.FC<FileManagerProps> = ({
  className = '',
  initialFolder = '/',
  onFileSelect,
  maxFileSize = 10 * 1024 * 1024, // 10MB default
  allowedFileTypes,
  enableAIAnalysis = true
}) => {
  const fileManager = useFileManager();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // State for filtering and search
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFolder, setSelectedFolder] = useState(initialFolder);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [mimeTypeFilter, setMimeTypeFilter] = useState('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [sortBy, setSortBy] = useState<'name' | 'date' | 'size'>('date');
  const [selectedFiles, setSelectedFiles] = useState<Set<number>>(new Set());
  
  // Modal states
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isCreateFolderModalOpen, setIsCreateFolderModalOpen] = useState(false);
  const [editingFile, setEditingFile] = useState<FileItem | null>(null);
  
  // Upload state
  const [uploadData, setUploadData] = useState<Partial<UploadFileData>>({
    folder: selectedFolder,
    description: '',
    tags: []
  });
  const [newFolderName, setNewFolderName] = useState('');

  // Query options for file list
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

  // Handle file upload
  const handleFileUpload = useCallback((files: FileList) => {
    Array.from(files).forEach(async (file) => {
      // Validate file size
      if (file.size > maxFileSize) {
        toast.error(`File "${file.name}" is too large. Maximum size is ${Math.round(maxFileSize / 1024 / 1024)}MB`);
        return;
      }

      // Validate file type
      if (allowedFileTypes && !allowedFileTypes.includes(file.type)) {
        toast.error(`File type "${file.type}" is not allowed`);
        return;
      }

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
    });
    setIsUploadModalOpen(false);
    resetUploadData();
  }, [fileManager, maxFileSize, allowedFileTypes, uploadData, selectedFolder]);

  // Reset upload data
  const resetUploadData = () => {
    setUploadData({
      folder: selectedFolder,
      description: '',
      tags: []
    });
  };

  // Handle drag and drop
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileUpload(files);
    }
  }, [handleFileUpload]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  // File operations
  const handleFileAnalyze = async (fileId: number) => {
    try {
      await fileManager.analyzeFile(fileId);
      toast.success('File analysis completed');
    } catch (error) {
      toast.error('Analysis failed. Please check your subscription status.');
    }
  };

  const handleFileDownload = async (file: FileItem) => {
    try {
      await fileManager.downloadFile(file.id, file.originalName);
      toast.success('Download started');
    } catch (error) {
      toast.error('Download failed');
    }
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

  // File selection
  const toggleFileSelection = (fileId: number) => {
    setSelectedFiles(prev => {
      const newSet = new Set(prev);
      if (newSet.has(fileId)) {
        newSet.delete(fileId);
      } else {
        newSet.add(fileId);
      }
      return newSet;
    });
  };

  // File type icon
  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith('image/')) return '🖼️';
    if (mimeType.startsWith('video/')) return '🎥';
    if (mimeType.startsWith('audio/')) return '🎵';
    if (mimeType.includes('pdf')) return '📄';
    if (mimeType.includes('text/') || mimeType.includes('javascript') || mimeType.includes('json')) return '📝';
    if (mimeType.includes('zip') || mimeType.includes('archive')) return '📦';
    return '📁';
  };

  // Format file size
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className={`flex flex-col h-full bg-white dark:bg-gray-900 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center space-x-4">
          <h2 className="text-xl font-semibold">File Manager</h2>
          {selectedFiles.size > 0 && (
            <div className="flex items-center space-x-2">
              <Badge variant="secondary">{selectedFiles.size} selected</Badge>
              <Button
                size="sm"
                variant="destructive"
                onClick={handleBulkDelete}
                disabled={fileManager.isBulkDeleting}
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </Button>
            </div>
          )}
        </div>
        
        <div className="flex items-center space-x-2">
          {/* View mode toggle */}
          <Button
            size="sm"
            variant={viewMode === 'grid' ? 'default' : 'outline'}
            onClick={() => setViewMode('grid')}
          >
            <Grid className="w-4 h-4" />
          </Button>
          <Button
            size="sm"
            variant={viewMode === 'list' ? 'default' : 'outline'}
            onClick={() => setViewMode('list')}
          >
            <List className="w-4 h-4" />
          </Button>

          {/* Upload button */}
          <Dialog open={isUploadModalOpen} onOpenChange={setIsUploadModalOpen}>
            <DialogTrigger asChild>
              <Button>
                <Upload className="w-4 h-4 mr-2" />
                Upload
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Upload Files</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div
                  className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-gray-400 transition-colors"
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                  <p className="text-lg font-medium mb-2">Drop files here or click to browse</p>
                  <p className="text-sm text-gray-500">
                    Maximum file size: {Math.round(maxFileSize / 1024 / 1024)}MB
                  </p>
                </div>
                
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  accept={allowedFileTypes?.join(',')}
                  onChange={(e) => e.target.files && handleFileUpload(e.target.files)}
                  aria-label="Upload files"
                />

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Folder</label>
                    <Select value={uploadData.folder} onValueChange={(value) => setUploadData(prev => ({ ...prev, folder: value }))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select folder" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="/">Root</SelectItem>
                        {folders?.map(folder => (
                          <SelectItem key={folder} value={folder}>{folder}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Description</label>
                  <Textarea
                    value={uploadData.description}
                    onChange={(e) => setUploadData(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Optional description"
                    rows={3}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Tags</label>
                  <Input
                    value={uploadData.tags?.join(', ')}
                    onChange={(e) => setUploadData(prev => ({ 
                      ...prev, 
                      tags: e.target.value.split(',').map(tag => tag.trim()).filter(Boolean)
                    }))}
                    placeholder="tag1, tag2, tag3"
                  />
                </div>

                {fileManager.isUploading && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Uploading...</span>
                      <span>{fileManager.uploadProgress}%</span>
                    </div>
                    <Progress value={fileManager.uploadProgress} />
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Filters and search */}
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
      </div>

      {/* File list */}
      <div className="flex-1 overflow-auto p-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
              <p>Loading files...</p>
            </div>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center text-red-500">
              <p>Failed to load files</p>
              <p className="text-sm">{error.message}</p>
            </div>
          </div>
        ) : !fileList?.files.length ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center text-gray-500">
              <File className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <p className="text-lg">No files found</p>
              <p className="text-sm">Upload some files to get started</p>
            </div>
          </div>
        ) : (
          <div className={viewMode === 'grid' 
            ? "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4"
            : "space-y-2"
          }>
            {fileList.files.map((file) => (
              <Card
                key={file.id}
                className={`p-4 cursor-pointer hover:shadow-md transition-shadow ${
                  selectedFiles.has(file.id) ? 'ring-2 ring-blue-500' : ''
                } ${viewMode === 'list' ? 'flex items-center space-x-4' : ''}`}
                onClick={() => {
                  if (onFileSelect) {
                    onFileSelect(file);
                  } else {
                    toggleFileSelection(file.id);
                  }
                }}
              >
                {viewMode === 'grid' ? (
                  <div className="text-center">
                    <div className="text-4xl mb-2">{getFileIcon(file.mimeType)}</div>
                    <h3 className="font-medium text-sm truncate" title={file.name}>
                      {file.name}
                    </h3>
                    <p className="text-xs text-gray-500 mt-1">
                      {formatFileSize(file.size)}
                    </p>
                    {file.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {file.tags.slice(0, 2).map(tag => (
                          <Badge key={tag} variant="secondary" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                        {file.tags.length > 2 && (
                          <Badge variant="secondary" className="text-xs">
                            +{file.tags.length - 2}
                          </Badge>
                        )}
                      </div>
                    )}
                    
                    {/* Analysis status */}
                    {file.analysisStatus && (
                      <div className="mt-2">
                        <Badge 
                          variant={
                            file.analysisStatus === 'completed' ? 'default' :
                            file.analysisStatus === 'analyzing' ? 'secondary' :
                            file.analysisStatus === 'failed' ? 'destructive' : 'outline'
                          }
                          className="text-xs"
                        >
                          {file.analysisStatus === 'completed' && '🧠 Analyzed'}
                          {file.analysisStatus === 'analyzing' && '⏳ Analyzing'}
                          {file.analysisStatus === 'failed' && '❌ Analysis Failed'}
                          {file.analysisStatus === 'pending' && '⏸️ Pending'}
                        </Badge>
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="text-2xl">{getFileIcon(file.mimeType)}</div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium truncate">{file.name}</h3>
                      <p className="text-sm text-gray-500">
                        {formatFileSize(file.size)} • {new Date(file.updatedAt).toLocaleDateString()}
                      </p>
                      {file.description && (
                        <p className="text-xs text-gray-400 truncate">{file.description}</p>
                      )}
                    </div>
                    <div className="flex items-center space-x-2">
                      {file.tags.map(tag => (
                        <Badge key={tag} variant="secondary" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </>
                )}

                {/* File actions */}
                <div className="absolute top-2 right-2" onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem onClick={() => handleFileDownload(file)}>
                        <Download className="w-4 h-4 mr-2" />
                        Download
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setEditingFile(file)}>
                        <Edit className="w-4 h-4 mr-2" />
                        Edit Details
                      </DropdownMenuItem>
                      {enableAIAnalysis && (
                        <DropdownMenuItem 
                          onClick={() => handleFileAnalyze(file.id)}
                          disabled={file.analysisStatus === 'analyzing'}
                        >
                          <Brain className="w-4 h-4 mr-2" />
                          Analyze with AI
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={() => handleFileDelete(file.id)}>
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      {fileList && fileList.total > fileList.files.length && (
        <div className="p-4 border-t">
          <div className="flex justify-between items-center">
            <p className="text-sm text-gray-500">
              Showing {fileList.files.length} of {fileList.total} files
            </p>
            <Button variant="outline">Load More</Button>
          </div>
        </div>
      )}
    </div>
  );
}; 