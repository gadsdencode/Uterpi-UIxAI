import React from 'react';
import { type FileItem } from '../hooks/useFileManager';

// Import enhanced components
import { EnhancedFileManager } from './FileManager/EnhancedFileManager';

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
  // Use the enhanced FileManager component
  return (
    <EnhancedFileManager
      className={className}
      initialFolder={initialFolder}
      onFileSelect={onFileSelect}
      maxFileSize={maxFileSize}
      allowedFileTypes={allowedFileTypes}
      enableAIAnalysis={enableAIAnalysis}
      showUploadArea={true}
    />
  );
}; 