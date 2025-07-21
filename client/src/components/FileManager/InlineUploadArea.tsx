import React, { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, X, CheckCircle, AlertCircle, FileText, Image as ImageIcon, Video, Music, Archive } from 'lucide-react';
import { Button } from '../ui/button';
import { Progress } from '../ui/progress';
import { Badge } from '../ui/badge';
import { toast } from 'sonner';

interface UploadFile {
  id: string;
  file: File;
  status: 'pending' | 'uploading' | 'completed' | 'error';
  progress: number;
  error?: string;
}

interface InlineUploadAreaProps {
  onFilesSelected: (files: File[]) => void;
  maxFileSize?: number;
  allowedFileTypes?: string[];
  maxFiles?: number;
  className?: string;
  isUploading?: boolean;
  uploadProgress?: number;
}

const getFileIcon = (file: File) => {
  if (file.type.startsWith('image/')) return <ImageIcon className="w-4 h-4" />;
  if (file.type.startsWith('video/')) return <Video className="w-4 h-4" />;
  if (file.type.startsWith('audio/')) return <Music className="w-4 h-4" />;
  if (file.type.includes('zip') || file.type.includes('archive')) return <Archive className="w-4 h-4" />;
  return <FileText className="w-4 h-4" />;
};

const formatFileSize = (bytes: number) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export const InlineUploadArea: React.FC<InlineUploadAreaProps> = ({
  onFilesSelected,
  maxFileSize = 10 * 1024 * 1024, // 10MB default
  allowedFileTypes,
  maxFiles = 10,
  className = '',
  isUploading = false,
  uploadProgress = 0
}) => {
  const [isDragActive, setIsDragActive] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<UploadFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFile = (file: File): { valid: boolean; error?: string } => {
    // Check file size
    if (file.size > maxFileSize) {
      return {
        valid: false,
        error: `File "${file.name}" is too large. Maximum size is ${Math.round(maxFileSize / 1024 / 1024)}MB`
      };
    }

    // Check file type
    if (allowedFileTypes && !allowedFileTypes.includes(file.type)) {
      return {
        valid: false,
        error: `File type "${file.type}" is not allowed`
      };
    }

    return { valid: true };
  };

  const handleFiles = useCallback((files: FileList) => {
    const fileArray = Array.from(files);
    const validFiles: File[] = [];
    const errors: string[] = [];

    fileArray.forEach(file => {
      const validation = validateFile(file);
      if (validation.valid) {
        validFiles.push(file);
      } else {
        errors.push(validation.error!);
      }
    });

    // Show errors
    errors.forEach(error => {
      toast.error(error);
    });

    // Add valid files to selected files
    if (validFiles.length > 0) {
      const newUploadFiles: UploadFile[] = validFiles.map(file => ({
        id: `${file.name}-${Date.now()}-${Math.random()}`,
        file,
        status: 'pending',
        progress: 0
      }));

      setSelectedFiles(prev => {
        const combined = [...prev, ...newUploadFiles];
        return combined.slice(0, maxFiles); // Limit to maxFiles
      });

      // Call the parent handler
      onFilesSelected(validFiles);
    }
  }, [maxFileSize, allowedFileTypes, maxFiles, onFilesSelected]);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setIsDragActive(true);
    } else if (e.type === 'dragleave') {
      setIsDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFiles(files);
    }
  }, [handleFiles]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFiles(files);
    }
    // Reset input value to allow selecting the same file again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [handleFiles]);

  const removeFile = (fileId: string) => {
    setSelectedFiles(prev => prev.filter(f => f.id !== fileId));
  };

  const clearAllFiles = () => {
    setSelectedFiles([]);
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Upload Zone */}
      <div
        className={`
          relative border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200
          ${isDragActive 
            ? 'border-blue-400 bg-blue-50/50 scale-105' 
            : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50/50'
          }
          ${isUploading ? 'pointer-events-none opacity-75' : 'cursor-pointer'}
        `}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => !isUploading && fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          accept={allowedFileTypes?.join(',')}
          onChange={handleFileInput}
          aria-label="Upload files"
        />

        <div className="space-y-4">
          <div className="flex justify-center">
            <div className={`
              p-4 rounded-full transition-colors
              ${isDragActive ? 'bg-blue-100' : 'bg-gray-100'}
            `}>
              <Upload className={`w-8 h-8 ${isDragActive ? 'text-blue-600' : 'text-gray-400'}`} />
            </div>
          </div>
          
          <div>
            <p className="text-lg font-medium text-gray-900 mb-2">
              {isDragActive ? 'Drop files here' : 'Drop files here or click to browse'}
            </p>
            <p className="text-sm text-gray-500">
              Maximum file size: {Math.round(maxFileSize / 1024 / 1024)}MB
              {allowedFileTypes && (
                <span> • Supported: {allowedFileTypes.join(', ')}</span>
              )}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Up to {maxFiles} files
            </p>
          </div>
        </div>

        {/* Upload Progress Overlay */}
        <AnimatePresence>
          {isUploading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-white/90 backdrop-blur-sm rounded-xl flex items-center justify-center"
            >
              <div className="text-center space-y-4">
                <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto" />
                <div>
                  <p className="text-lg font-medium text-gray-900">Uploading files...</p>
                  <p className="text-sm text-gray-500">{uploadProgress}% complete</p>
                </div>
                <div className="w-48">
                  <Progress value={uploadProgress} className="h-2" />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Selected Files List */}
      <AnimatePresence>
        {selectedFiles.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-3"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-gray-900">
                Selected Files ({selectedFiles.length})
              </h3>
              <Button
                size="sm"
                variant="ghost"
                onClick={clearAllFiles}
                className="text-gray-500 hover:text-gray-700"
              >
                Clear All
              </Button>
            </div>

            <div className="space-y-2 max-h-64 overflow-y-auto">
              {selectedFiles.map((uploadFile) => (
                <motion.div
                  key={uploadFile.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className={`
                    flex items-center space-x-3 p-3 rounded-lg border transition-colors
                    ${uploadFile.status === 'error' ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'}
                  `}
                >
                  <div className="flex-shrink-0">
                    {getFileIcon(uploadFile.file)}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {uploadFile.file.name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {formatFileSize(uploadFile.file.size)}
                    </p>
                  </div>

                  <div className="flex items-center space-x-2">
                    {uploadFile.status === 'pending' && (
                      <Badge variant="secondary" className="text-xs">
                        Ready
                      </Badge>
                    )}
                    {uploadFile.status === 'uploading' && (
                      <Badge variant="secondary" className="text-xs">
                        Uploading...
                      </Badge>
                    )}
                    {uploadFile.status === 'completed' && (
                      <div className="flex items-center space-x-1 text-green-600">
                        <CheckCircle className="w-4 h-4" />
                        <span className="text-xs">Complete</span>
                      </div>
                    )}
                    {uploadFile.status === 'error' && (
                      <div className="flex items-center space-x-1 text-red-600">
                        <AlertCircle className="w-4 h-4" />
                        <span className="text-xs">Error</span>
                      </div>
                    )}
                    
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => removeFile(uploadFile.id)}
                      className="h-6 w-6 p-0 text-gray-400 hover:text-gray-600"
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}; 