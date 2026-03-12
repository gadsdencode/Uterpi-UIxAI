import React from 'react';
import { motion } from 'framer-motion';
import { 
  FolderOpen, 
  FolderX, 
  Upload, 
  FileText, 
  Search,
  Filter,
  Brain,
  RefreshCw,
  AlertCircle,
  FileUp,
  FolderPlus,
  Archive
} from 'lucide-react';
import { EmptyState } from '../ui/EmptyState';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';

interface FileEmptyStatesProps {
  onUpload?: () => void;
  onRefresh?: () => void;
  onClearFilters?: () => void;
  onCreateFolder?: () => void;
  searchTerm?: string;
  hasFilters?: boolean;
  currentFolder?: string;
  isSearching?: boolean;
}

export const FileEmptyStates = {
  // Main file manager when no files exist
  NoFiles: ({ onUpload, onCreateFolder }: FileEmptyStatesProps) => (
    <div className="flex-1 flex items-center justify-center p-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center max-w-lg"
      >
        <div className="relative mb-8">
          {/* Animated background elements */}
          <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-green-500/10 rounded-full blur-3xl animate-pulse" />
          <div className="relative bg-slate-900/50 border border-slate-700/50 rounded-2xl p-8 backdrop-blur-sm">
            <motion.div
              animate={{ y: [0, -5, 0] }}
              transition={{ duration: 3, repeat: Infinity }}
              className="w-20 h-20 mx-auto mb-6 bg-gradient-to-br from-blue-500 to-green-500 rounded-full flex items-center justify-center"
            >
              <FolderOpen className="w-10 h-10 text-white" />
            </motion.div>
            
            <h2 className="text-2xl font-bold text-white mb-3">
              Your File Library is Empty
            </h2>
            <p className="text-slate-300 mb-6 leading-relaxed">
              Upload files to get started with AI analysis, document management, and intelligent file organization. 
              Support for PDFs, images, text files, and more.
            </p>
            
            <div className="space-y-3">
              <Button
                onClick={onUpload}
                className="w-full bg-gradient-to-r from-blue-500 to-green-500 hover:from-blue-600 hover:to-green-600 text-white border-0"
                size="lg"
              >
                <Upload className="w-5 h-5 mr-2" />
                Upload Files
              </Button>
              
              {onCreateFolder && (
                <Button
                  onClick={onCreateFolder}
                  variant="outline"
                  className="w-full border-slate-600 text-slate-300 hover:bg-slate-800"
                  size="lg"
                >
                  <FolderPlus className="w-5 h-5 mr-2" />
                  Create Folder
                </Button>
              )}
            </div>
          </div>
        </div>
        
        {/* File type support info */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8">
          <Card className="bg-slate-800/30 border-slate-700/50">
            <CardContent className="p-4 text-center">
              <FileText className="w-6 h-6 text-blue-400 mx-auto mb-2" />
              <h4 className="text-sm font-medium text-white mb-1">Documents</h4>
              <p className="text-xs text-slate-400">PDF, DOC, TXT</p>
            </CardContent>
          </Card>
          
          <Card className="bg-slate-800/30 border-slate-700/50">
            <CardContent className="p-4 text-center">
              <Brain className="w-6 h-6 text-green-400 mx-auto mb-2" />
              <h4 className="text-sm font-medium text-white mb-1">AI Analysis</h4>
              <p className="text-xs text-slate-400">Smart insights</p>
            </CardContent>
          </Card>
          
          <Card className="bg-slate-800/30 border-slate-700/50">
            <CardContent className="p-4 text-center">
              <Search className="w-6 h-6 text-purple-400 mx-auto mb-2" />
              <h4 className="text-sm font-medium text-white mb-1">Search</h4>
              <p className="text-xs text-slate-400">Find anything</p>
            </CardContent>
          </Card>
          
          <Card className="bg-slate-800/30 border-slate-700/50">
            <CardContent className="p-4 text-center">
              <Archive className="w-6 h-6 text-orange-400 mx-auto mb-2" />
              <h4 className="text-sm font-medium text-white mb-1">Organize</h4>
              <p className="text-xs text-slate-400">Folders & tags</p>
            </CardContent>
          </Card>
        </div>
      </motion.div>
    </div>
  ),

  // Specific folder is empty
  NoFilesInFolder: ({ currentFolder, onUpload, onCreateFolder }: FileEmptyStatesProps) => (
    <EmptyState
      icon={FolderX}
      title={currentFolder ? `"${currentFolder}" is empty` : "This folder is empty"}
      description="No files found in this folder. Upload files or create subfolders to organize your content."
      action={{
        label: "Upload Files",
        onClick: onUpload || (() => {})
      }}
      secondaryAction={onCreateFolder ? {
        label: "Create Folder",
        onClick: onCreateFolder,
        variant: "outline"
      } : undefined}
      variant="illustrated"
      size="md"
    />
  ),

  // Search results empty state
  NoSearchResults: ({ searchTerm, hasFilters, onClearFilters }: FileEmptyStatesProps) => (
    <EmptyState
      icon={Search}
      title="No files found"
      description={
        searchTerm 
          ? `No files match "${searchTerm}". Try different keywords or check your spelling.`
          : hasFilters
          ? "No files match your current filters. Try adjusting your search criteria."
          : "No files found. Upload some files to get started."
      }
      action={searchTerm || hasFilters ? {
        label: "Clear Search",
        onClick: onClearFilters || (() => {}),
        variant: "outline"
      } : undefined}
      secondaryAction={{
        label: "Upload Files",
        onClick: () => {
          window.dispatchEvent(new CustomEvent('openFileUpload'));
        }
      }}
      variant="minimal"
      size="md"
    />
  ),

  // Filtered results empty state
  NoFilteredResults: ({ onClearFilters }: FileEmptyStatesProps) => (
    <EmptyState
      icon={Filter}
      title="No files match your filters"
      description="Try adjusting your filter criteria or clear all filters to see all files."
      action={{
        label: "Clear Filters",
        onClick: onClearFilters || (() => {}),
        variant: "outline"
      }}
      secondaryAction={{
        label: "View All Files",
        onClick: () => {
          window.dispatchEvent(new CustomEvent('clearAllFilters'));
        }
      }}
      variant="minimal"
      size="md"
    />
  ),

  // No analysis available
  NoAnalysis: ({ onRunAnalysis }: { onRunAnalysis?: () => void }) => (
    <EmptyState
      icon={Brain}
      title="No analysis available"
      description="This file hasn't been analyzed yet. Run AI analysis to get insights, summaries, and intelligent recommendations."
      action={{
        label: "Run Analysis",
        onClick: onRunAnalysis || (() => {})
      }}
      variant="illustrated"
      size="md"
    />
  ),

  // Loading state
  LoadingFiles: () => (
    <div className="flex items-center justify-center py-12">
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        className="w-8 h-8 border-2 border-slate-600 border-t-blue-500 rounded-full"
      />
      <span className="ml-3 text-slate-400">Loading files...</span>
    </div>
  ),

  // Error state
  FilesError: ({ onRefresh }: FileEmptyStatesProps) => (
    <EmptyState
      icon={AlertCircle}
      title="Failed to load files"
      description="There was an error loading your files. Please check your connection and try again."
      action={{
        label: "Try Again",
        onClick: onRefresh || (() => {}),
        variant: "outline"
      }}
      secondaryAction={{
        label: "Refresh",
        onClick: () => window.location.reload(),
        variant: "ghost"
      }}
      variant="minimal"
      size="md"
    />
  ),

  // Upload area when no files
  UploadPrompt: ({ onUpload }: FileEmptyStatesProps) => (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      className="border-2 border-dashed border-slate-600/50 rounded-xl p-12 text-center bg-slate-800/20 hover:bg-slate-800/30 transition-colors cursor-pointer"
      onClick={onUpload}
    >
      <motion.div
        animate={{ y: [0, -3, 0] }}
        transition={{ duration: 2, repeat: Infinity }}
        className="w-16 h-16 mx-auto mb-4 bg-slate-700/50 rounded-full flex items-center justify-center"
      >
        <FileUp className="w-8 h-8 text-slate-400" />
      </motion.div>
      
      <h3 className="text-lg font-semibold text-white mb-2">
        Drop files here or click to upload
      </h3>
      <p className="text-slate-400 mb-4">
        Support for PDF, DOC, TXT, images, and more
      </p>
      
      <Button
        variant="outline"
        className="border-slate-600 text-slate-300 hover:bg-slate-700"
      >
        <Upload className="w-4 h-4 mr-2" />
        Choose Files
      </Button>
    </motion.div>
  ),

  // No recent files
  NoRecentFiles: () => (
    <EmptyState
      icon={require('lucide-react').Clock}
      title="No recent files"
      description="Files you've recently accessed will appear here. Upload or open some files to get started."
      variant="minimal"
      size="sm"
    />
  ),

  // No shared files
  NoSharedFiles: () => (
    <EmptyState
      icon={require('lucide-react').Share2}
      title="No shared files"
      description="Files you've shared with others will appear here. Share files to collaborate with your team."
      variant="minimal"
      size="sm"
    />
  )
};

export default FileEmptyStates;
