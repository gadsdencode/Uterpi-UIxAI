import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Download, 
  Share, 
  Trash2, 
  Edit, 
  Brain,
  Eye,
  MoreVertical,
  FileText,
  Image as ImageIcon,
  Video,
  Music,
  Archive,
  Code,
  File
} from 'lucide-react';
import { Card } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu';
import { type FileItem } from '../../hooks/useFileManager';

interface EnhancedFileCardProps {
  file: FileItem;
  isSelected: boolean;
  onSelect: (fileId: number) => void;
  onDownload: (file: FileItem) => void;
  onEdit: (file: FileItem) => void;
  onAnalyze: (fileId: number) => void;
  onDelete: (fileId: number) => void;
  onShare: (file: FileItem) => void;
  onViewAnalysis?: (file: FileItem) => void;
  viewMode: 'grid' | 'list';
  enableAIAnalysis?: boolean;
}

const getFileIcon = (mimeType: string, size: 'sm' | 'md' | 'lg' = 'md') => {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8'
  };

  if (mimeType.startsWith('image/')) return <ImageIcon className={sizeClasses[size]} />;
  if (mimeType.startsWith('video/')) return <Video className={sizeClasses[size]} />;
  if (mimeType.startsWith('audio/')) return <Music className={sizeClasses[size]} />;
  if (mimeType.includes('pdf')) return <FileText className={sizeClasses[size]} />;
  if (mimeType.includes('text/') || mimeType.includes('javascript') || mimeType.includes('json')) return <Code className={sizeClasses[size]} />;
  if (mimeType.includes('zip') || mimeType.includes('archive')) return <Archive className={sizeClasses[size]} />;
  return <File className={sizeClasses[size]} />;
};

const formatFileSize = (bytes: number) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - date.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays === 1) return 'Today';
  if (diffDays === 2) return 'Yesterday';
  if (diffDays <= 7) return `${diffDays - 1} days ago`;
  return date.toLocaleDateString();
};

const getAnalysisDescription = (status: string) => {
  switch (status) {
    case 'completed': return 'AI analysis complete';
    case 'analyzing': return 'AI analyzing file...';
    case 'failed': return 'Analysis failed';
    case 'pending': return 'Analysis pending';
    default: return 'No analysis';
  }
};

const getAnalysisColor = (status: string) => {
  switch (status) {
    case 'completed': return 'bg-green-500/10 text-green-600 border-green-200';
    case 'analyzing': return 'bg-blue-500/10 text-blue-600 border-blue-200';
    case 'failed': return 'bg-red-500/10 text-red-600 border-red-200';
    case 'pending': return 'bg-gray-500/10 text-gray-600 border-gray-200';
    default: return 'bg-gray-500/10 text-gray-600 border-gray-200';
  }
};

export const EnhancedFileCard: React.FC<EnhancedFileCardProps> = ({
  file,
  isSelected,
  onSelect,
  onDownload,
  onEdit,
  onAnalyze,
  onDelete,
  onShare,
  onViewAnalysis,
  viewMode,
  enableAIAnalysis = true
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [showDetails, setShowDetails] = useState(false);



  const handleCardClick = () => {
    onSelect(file.id);
  };

  const handleActionClick = (e: React.MouseEvent, action: () => void) => {
    e.stopPropagation();
    action();
  };

  if (viewMode === 'list') {
    return (
      <Card
        className={`
          relative group cursor-pointer transition-all duration-200
          ${isSelected ? 'ring-2 ring-blue-500 bg-blue-50/50' : 'hover:bg-gray-50/50'}
          ${isHovered ? 'shadow-lg' : 'shadow-sm'}
        `}
        onClick={handleCardClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div className="flex items-center space-x-4 p-4">
          {/* File Icon */}
          <div className="flex-shrink-0">
            <div className="p-2 bg-gray-100 rounded-lg group-hover:bg-blue-100 transition-colors">
              {getFileIcon(file.mimeType, 'md')}
            </div>
          </div>

          {/* File Info */}
          <div className="flex-1 min-w-0">
            <h3 className="font-medium text-gray-900 truncate group-hover:text-blue-600 transition-colors">
              {file.name}
            </h3>
            <div className="flex items-center space-x-4 text-sm text-gray-500 mt-1">
              <span>{formatFileSize(file.size)}</span>
              <span>•</span>
              <span>{formatDate(file.updatedAt)}</span>
              {file.description && (
                <>
                  <span>•</span>
                  <span className="truncate">{file.description}</span>
                </>
              )}
            </div>
            
            {/* Tags */}
            {file.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {file.tags.slice(0, 3).map(tag => (
                  <Badge key={tag} variant="secondary" className="text-xs">
                    {tag}
                  </Badge>
                ))}
                {file.tags.length > 3 && (
                  <Badge variant="secondary" className="text-xs">
                    +{file.tags.length - 3}
                  </Badge>
                )}
              </div>
            )}
          </div>

          {/* AI Analysis Status */}
          {enableAIAnalysis && file.analysisStatus && (
            <div className="flex-shrink-0">
              <Badge 
                variant="outline"
                className={`text-xs ${getAnalysisColor(file.analysisStatus)}`}
              >
                {file.analysisStatus === 'completed' && '🧠 Analyzed'}
                {file.analysisStatus === 'analyzing' && '⏳ Analyzing'}
                {file.analysisStatus === 'failed' && '❌ Failed'}
                {file.analysisStatus === 'pending' && '⏸️ Pending'}
              </Badge>
            </div>
          )}

          {/* Actions */}
          <AnimatePresence>
            {isHovered && (
              <motion.div
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="flex items-center space-x-1"
                onClick={(e) => e.stopPropagation()}
              >
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={(e) => handleActionClick(e, () => onDownload(file))}
                  className="h-8 w-8 p-0"
                >
                  <Download className="w-4 h-4" />
                </Button>
                {enableAIAnalysis && (
                  <>
                    {(() => {
                      const shouldShowViewAnalysis = file.analysisStatus === 'completed' && onViewAnalysis;
                      console.log('Should show View Analysis button:', shouldShowViewAnalysis, {
                        analysisStatus: file.analysisStatus,
                        hasOnViewAnalysis: !!onViewAnalysis
                      });
                      return shouldShowViewAnalysis;
                    })() ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          console.log('View Analysis button clicked for file:', file.id);
                          handleActionClick(e, () => onViewAnalysis!(file));
                        }}
                        className="h-8 w-8 p-0"
                        title="View Analysis"
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => handleActionClick(e, () => onAnalyze(file.id))}
                        disabled={file.analysisStatus === 'analyzing'}
                        className="h-8 w-8 p-0"
                        title="Analyze File"
                      >
                        <Brain className="w-4 h-4" />
                      </Button>
                    )}
                  </>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={(e) => handleActionClick(e, () => onShare(file))}
                  className="h-8 w-8 p-0"
                >
                  <Share className="w-4 h-4" />
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0">
                      <MoreVertical className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={(e) => handleActionClick(e, () => onEdit(file))}>
                      <Edit className="w-4 h-4 mr-2" />
                      Edit Details
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={(e) => handleActionClick(e, () => onDelete(file.id))}>
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </Card>
    );
  }

  // Grid View
  return (
    <Card
      className={`
        relative group cursor-pointer transition-all duration-200
        ${isSelected ? 'ring-2 ring-blue-500 bg-blue-50/50' : 'hover:bg-gray-50/50'}
        ${isHovered ? 'shadow-lg' : 'shadow-sm'}
      `}
      onClick={handleCardClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="p-4">
        {/* Primary Info Layer */}
        <div className="text-center">
          <div className="flex justify-center mb-3">
            <div className="p-3 bg-gray-100 rounded-xl group-hover:bg-blue-100 transition-colors">
              {getFileIcon(file.mimeType, 'lg')}
            </div>
          </div>
          
          <h3 className="font-medium text-sm truncate group-hover:text-blue-600 transition-colors" title={file.name}>
            {file.name}
          </h3>
          
          <p className="text-xs text-gray-500 mt-1">
            {formatFileSize(file.size)}
          </p>
          
          <p className="text-xs text-gray-400 mt-1">
            {formatDate(file.updatedAt)}
          </p>
        </div>

        {/* Secondary Info Layer (on hover) */}
        <AnimatePresence>
          {isHovered && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="absolute inset-0 bg-white/95 backdrop-blur-sm rounded-lg p-4 flex flex-col justify-center"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="space-y-3">
                {/* Description */}
                {file.description && (
                  <p className="text-sm text-gray-600 line-clamp-2">
                    {file.description}
                  </p>
                )}
                
                {/* Tags */}
                {file.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 justify-center">
                    {file.tags.slice(0, 3).map(tag => (
                      <Badge key={tag} variant="secondary" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                    {file.tags.length > 3 && (
                      <Badge variant="secondary" className="text-xs">
                        +{file.tags.length - 3}
                      </Badge>
                    )}
                  </div>
                )}
                
                {/* AI Analysis Status */}
                {enableAIAnalysis && file.analysisStatus && (
                  <div className="text-center">
                    <Badge 
                      variant="outline"
                      className={`text-xs ${getAnalysisColor(file.analysisStatus)}`}
                    >
                      {getAnalysisDescription(file.analysisStatus)}
                    </Badge>
                  </div>
                )}
                
                {/* Quick Actions */}
                <div className="flex justify-center space-x-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => handleActionClick(e, () => onDownload(file))}
                    className="h-8 px-2"
                  >
                    <Download className="w-3 h-3 mr-1" />
                    Download
                  </Button>
                  {enableAIAnalysis && (
                    <>
                      {(() => {
                        const shouldShowViewAnalysis = file.analysisStatus === 'completed' && onViewAnalysis;
                        console.log('Should show View Analysis button (grid):', shouldShowViewAnalysis, {
                          analysisStatus: file.analysisStatus,
                          hasOnViewAnalysis: !!onViewAnalysis
                        });
                        return shouldShowViewAnalysis;
                      })() ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            console.log('View Analysis button clicked (grid) for file:', file.id);
                            handleActionClick(e, () => onViewAnalysis!(file));
                          }}
                          className="h-8 px-2"
                        >
                          <Eye className="w-3 h-3 mr-1" />
                          View Analysis
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => handleActionClick(e, () => onAnalyze(file.id))}
                          disabled={file.analysisStatus === 'analyzing'}
                          className="h-8 px-2"
                        >
                          <Brain className="w-3 h-3 mr-1" />
                          Analyze
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Selection Indicator */}
        {isSelected && (
          <div className="absolute top-2 right-2">
            <div className="w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center">
              <div className="w-2 h-2 bg-white rounded-full" />
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}; 