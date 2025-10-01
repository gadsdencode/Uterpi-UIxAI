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

// Holographic Bubble Component to match app aesthetic
const HolographicBubble: React.FC<{
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  onDragEnter?: (e: React.DragEvent) => void;
  onDragLeave?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
}> = ({ children, className, onClick, onDragEnter, onDragLeave, onDragOver, onDrop }) => (
  <motion.div
    initial={{ opacity: 0, scale: 0.8, y: 20 }}
    animate={{ opacity: 1, scale: 1, y: 0 }}
    transition={{ type: "spring", damping: 20, stiffness: 300 }}
    className={`
      relative p-4 rounded-xl backdrop-blur-xl border overflow-hidden
      bg-gradient-to-br from-slate-800/40 to-slate-900/40 border-slate-600/30
      ${className}
    `}
    onClick={onClick && typeof onClick === 'function' ? onClick : undefined}
    onDragEnter={onDragEnter}
    onDragLeave={onDragLeave}
    onDragOver={onDragOver}
    onDrop={onDrop}
  >
    <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-white/5 to-transparent" />
    <div className="relative z-10">{children}</div>
    
  </motion.div>
);

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
        return combined.slice(0, maxFiles);
      });

      // Trigger upload
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

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  }, [handleFiles]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files);
    }
  }, [handleFiles]);

  const removeFile = (fileId: string) => {
    setSelectedFiles(prev => prev.filter(file => file.id !== fileId));
  };

  const clearAllFiles = () => {
    setSelectedFiles([]);
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Upload Zone */}
      <HolographicBubble
        className={`
          relative border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200
          ${isDragActive 
            ? 'border-violet-400 bg-violet-500/20 scale-105' 
            : 'border-slate-600/50 hover:border-slate-500/50 hover:bg-slate-700/30'
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
              ${isDragActive ? 'bg-violet-500/20' : 'bg-slate-700/50'}
            `}>
              <Upload className={`w-8 h-8 ${isDragActive ? 'text-violet-300' : 'text-slate-400'}`} />
            </div>
          </div>
          
          <div>
            <p className="text-lg font-medium text-white mb-2">
              {isDragActive ? 'Drop files here' : 'Drop files here or click to browse'}
            </p>
            <p className="text-sm text-slate-300">
              Maximum file size: {Math.round(maxFileSize / 1024 / 1024)}MB
              {allowedFileTypes && (
                <span> • Supported: {allowedFileTypes.join(', ')}</span>
              )}
            </p>
            <p className="text-xs text-slate-400 mt-1">
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
              className="absolute inset-0 bg-slate-800/90 backdrop-blur-sm rounded-xl flex items-center justify-center"
            >
              <div className="text-center space-y-4">
                <div className="animate-spin w-8 h-8 border-4 border-violet-400 border-t-transparent rounded-full mx-auto" />
                <div>
                  <p className="text-lg font-medium text-white">Uploading files...</p>
                  <p className="text-sm text-slate-300">{uploadProgress}% complete</p>
                </div>
                <div className="w-48">
                  <Progress value={uploadProgress} className="h-2" />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </HolographicBubble>

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
              <h3 className="text-sm font-medium text-white">
                Selected Files ({selectedFiles.length})
              </h3>
              <Button
                size="sm"
                variant="ghost"
                onClick={clearAllFiles}
                className="text-slate-400 hover:text-slate-200"
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
                    ${uploadFile.status === 'error' ? 'bg-red-500/20 border-red-400/30' : 'bg-slate-700/50 border-slate-600/50'}
                  `}
                >
                  <div className="flex-shrink-0">
                    {getFileIcon(uploadFile.file)}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">
                      {uploadFile.file.name}
                    </p>
                    <p className="text-xs text-slate-400">
                      {formatFileSize(uploadFile.file.size)}
                    </p>
                  </div>

                  <div className="flex items-center space-x-2">
                    {uploadFile.status === 'pending' && (
                      <Badge variant="secondary" className="text-xs bg-slate-600/50 text-slate-300 border-slate-500/50">
                        Ready
                      </Badge>
                    )}
                    {uploadFile.status === 'uploading' && (
                      <Badge variant="secondary" className="text-xs bg-violet-500/20 text-violet-300 border-violet-400/30">
                        Uploading...
                      </Badge>
                    )}
                    {uploadFile.status === 'completed' && (
                      <div className="flex items-center space-x-1 text-green-400">
                        <CheckCircle className="w-4 h-4" />
                        <span className="text-xs">Complete</span>
                      </div>
                    )}
                    {uploadFile.status === 'error' && (
                      <div className="flex items-center space-x-1 text-red-400">
                        <AlertCircle className="w-4 h-4" />
                        <span className="text-xs">Error</span>
                      </div>
                    )}
                    
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => removeFile(uploadFile.id)}
                      className="h-6 w-6 p-0 text-slate-400 hover:text-slate-200"
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