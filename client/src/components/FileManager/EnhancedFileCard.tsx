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
    case 'completed': return 'bg-green-500/20 text-green-300 border-green-400/30';
    case 'analyzing': return 'bg-violet-500/20 text-violet-300 border-violet-400/30';
    case 'failed': return 'bg-red-500/20 text-red-300 border-red-400/30';
    case 'pending': return 'bg-slate-500/20 text-slate-300 border-slate-400/30';
    default: return 'bg-slate-500/20 text-slate-300 border-slate-400/30';
  }
};

// Holographic Bubble Component to match app aesthetic
const HolographicBubble: React.FC<{
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}> = ({ children, className, onClick, onMouseEnter, onMouseLeave }) => (
  <motion.div
    initial={{ opacity: 0, scale: 0.8, y: 20 }}
    animate={{ opacity: 1, scale: 1, y: 0 }}
    transition={{ type: "spring", damping: 20, stiffness: 300 }}
    className={`
      relative p-4 rounded-xl backdrop-blur-xl border overflow-hidden
      bg-gradient-to-br from-slate-800/40 to-slate-900/40 border-slate-600/30
      ${className}
    `}
    onClick={onClick}
    onMouseEnter={onMouseEnter}
    onMouseLeave={onMouseLeave}
  >
    <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-white/5 to-transparent" />
    <div className="relative z-10">{children}</div>
    
    {/* Holographic shimmer effect */}
    <motion.div
      className="absolute inset-0 rounded-xl bg-gradient-to-r from-transparent via-white/5 to-transparent"
      animate={{
        x: ["-100%", "100%"],
      }}
      transition={{
        duration: 8,
        repeat: Infinity,
        repeatType: "loop",
        ease: "linear",
      }}
    />
  </motion.div>
);

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
      <HolographicBubble
        className={`
          relative group cursor-pointer transition-all duration-200
          ${isSelected ? 'ring-2 ring-violet-400 bg-violet-500/20' : 'hover:bg-slate-700/30'}
          ${isHovered ? 'shadow-lg' : 'shadow-sm'}
        `}
        onClick={handleCardClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div className="flex items-center space-x-4">
          {/* File Icon */}
          <div className="flex-shrink-0">
            <div className="p-2 bg-slate-700/50 rounded-lg group-hover:bg-violet-500/20 transition-colors">
              {getFileIcon(file.mimeType, 'md')}
            </div>
          </div>

          {/* File Info */}
          <div className="flex-1 min-w-0">
            <h3 className="font-medium text-white truncate group-hover:text-violet-300 transition-colors">
              {file.name}
            </h3>
            <div className="flex items-center space-x-4 text-sm text-slate-400 mt-1">
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
                  <Badge key={tag} variant="secondary" className="text-xs bg-slate-700/50 text-slate-300 border-slate-600/50">
                    {tag}
                  </Badge>
                ))}
                {file.tags.length > 3 && (
                  <Badge variant="secondary" className="text-xs bg-slate-700/50 text-slate-300 border-slate-600/50">
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
                className="flex items-center space-x-1 flex-shrink-0"
                onClick={(e) => e.stopPropagation()}
              >
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={(e) => handleActionClick(e, () => onDownload(file))}
                  className="h-8 w-8 p-0 text-slate-300 hover:text-white hover:bg-slate-700/50"
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
                        className="h-8 w-8 p-0 text-slate-300 hover:text-white hover:bg-slate-700/50"
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
                        className="h-8 w-8 p-0 text-slate-300 hover:text-white hover:bg-slate-700/50"
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
                  className="h-8 w-8 p-0 text-slate-300 hover:text-white hover:bg-slate-700/50"
                >
                  <Share className="w-4 h-4" />
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-slate-300 hover:text-white hover:bg-slate-700/50">
                      <MoreVertical className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="bg-slate-800 border-slate-600">
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
      </HolographicBubble>
    );
  }

  // Grid View
  return (
    <HolographicBubble
      className={`
        relative group cursor-pointer transition-all duration-200
        ${isSelected ? 'ring-2 ring-violet-400 bg-violet-500/20' : 'hover:bg-slate-700/30'}
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
            <div className="p-3 bg-slate-700/50 rounded-xl group-hover:bg-violet-500/20 transition-colors">
              {getFileIcon(file.mimeType, 'lg')}
            </div>
          </div>
          
          <h3 className="font-medium text-sm truncate group-hover:text-violet-300 transition-colors text-white" title={file.name}>
            {file.name}
          </h3>
          
          <p className="text-xs text-slate-400 mt-1">
            {formatFileSize(file.size)}
          </p>
          
          <p className="text-xs text-slate-500 mt-1">
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
              className="absolute inset-0 bg-slate-800/95 backdrop-blur-sm rounded-xl p-4 flex flex-col justify-center"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="space-y-3">
                {/* Description */}
                {file.description && (
                  <p className="text-sm text-slate-300 line-clamp-2">
                    {file.description}
                  </p>
                )}
                
                {/* Tags */}
                {file.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 justify-center">
                    {file.tags.slice(0, 3).map(tag => (
                      <Badge key={tag} variant="secondary" className="text-xs bg-slate-700/50 text-slate-300 border-slate-600/50">
                        {tag}
                      </Badge>
                    ))}
                    {file.tags.length > 3 && (
                      <Badge variant="secondary" className="text-xs bg-slate-700/50 text-slate-300 border-slate-600/50">
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
                    className="h-8 w-8 p-0 border-slate-600/50 text-slate-300 hover:text-white hover:bg-slate-700/50"
                    title="Download file"
                  >
                    <Download className="w-4 h-4" />
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
                          className="h-8 w-8 p-0 border-slate-600/50 text-slate-300 hover:text-white hover:bg-slate-700/50"
                          title="View AI Analysis"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => handleActionClick(e, () => onAnalyze(file.id))}
                          disabled={file.analysisStatus === 'analyzing'}
                          className="h-8 w-8 p-0 border-slate-600/50 text-slate-300 hover:text-white hover:bg-slate-700/50"
                          title="Analyze with AI"
                        >
                          <Brain className="w-4 h-4" />
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
            <div className="w-4 h-4 bg-violet-400 rounded-full flex items-center justify-center">
              <div className="w-2 h-2 bg-white rounded-full" />
            </div>
          </div>
        )}
      </div>
    </HolographicBubble>
  );
}; 