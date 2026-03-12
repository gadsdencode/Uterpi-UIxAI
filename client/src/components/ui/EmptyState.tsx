import React from 'react';
import { motion } from 'framer-motion';
import { LucideIcon } from 'lucide-react';
import { Button } from './button';
import { cn } from '../../lib/utils';

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
    variant?: 'default' | 'outline' | 'secondary' | 'ghost' | 'link' | 'destructive';
  };
  secondaryAction?: {
    label: string;
    onClick: () => void;
    variant?: 'default' | 'outline' | 'secondary' | 'ghost' | 'link' | 'destructive';
  };
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'minimal' | 'illustrated';
  children?: React.ReactNode;
}

const sizeClasses = {
  sm: {
    container: 'py-8',
    icon: 'w-8 h-8',
    title: 'text-lg',
    description: 'text-sm',
    spacing: 'space-y-3'
  },
  md: {
    container: 'py-12',
    icon: 'w-12 h-12',
    title: 'text-xl',
    description: 'text-base',
    spacing: 'space-y-4'
  },
  lg: {
    container: 'py-16',
    icon: 'w-16 h-16',
    title: 'text-2xl',
    description: 'text-lg',
    spacing: 'space-y-6'
  }
};

const variantClasses = {
  default: {
    container: 'bg-slate-900/30 border border-slate-700/50 rounded-xl',
    icon: 'text-slate-400',
    title: 'text-white',
    description: 'text-slate-300'
  },
  minimal: {
    container: '',
    icon: 'text-slate-500',
    title: 'text-slate-200',
    description: 'text-slate-400'
  },
  illustrated: {
    container: 'bg-gradient-to-br from-slate-900/50 to-slate-800/30 border border-slate-600/30 rounded-2xl',
    icon: 'text-violet-400',
    title: 'text-white',
    description: 'text-slate-300'
  }
};

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  className,
  size = 'md',
  variant = 'default',
  children
}) => {
  const sizeConfig = sizeClasses[size];
  const variantConfig = variantClasses[variant];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={cn(
        'flex flex-col items-center justify-center text-center',
        sizeConfig.container,
        variantConfig.container,
        className
      )}
    >
      <div className={cn('flex flex-col items-center', sizeConfig.spacing)}>
        {/* Icon */}
        {Icon && (
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1, duration: 0.3 }}
            className={cn(
              'flex items-center justify-center rounded-full bg-slate-800/50 p-3',
              sizeConfig.icon,
              variantConfig.icon
            )}
          >
            <Icon className="w-full h-full" />
          </motion.div>
        )}

        {/* Content */}
        <div className="max-w-md">
          <motion.h3
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.3 }}
            className={cn('font-semibold mb-2', sizeConfig.title, variantConfig.title)}
          >
            {title}
          </motion.h3>
          
          {description && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3, duration: 0.3 }}
              className={cn(sizeConfig.description, variantConfig.description)}
            >
              {description}
            </motion.p>
          )}
        </div>

        {/* Actions */}
        {(action || secondaryAction) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.3 }}
            className="flex flex-col sm:flex-row gap-3 mt-4"
          >
            {action && (
              <Button
                onClick={action.onClick}
                variant={action.variant || 'default'}
                className="min-w-[120px]"
              >
                {action.label}
              </Button>
            )}
            {secondaryAction && (
              <Button
                onClick={secondaryAction.onClick}
                variant={secondaryAction.variant || 'outline'}
                className="min-w-[120px]"
              >
                {secondaryAction.label}
              </Button>
            )}
          </motion.div>
        )}

        {/* Custom content */}
        {children && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.3 }}
            className="mt-4"
          >
            {children}
          </motion.div>
        )}
      </div>
    </motion.div>
  );
};

// Predefined empty states for common scenarios
export const EmptyStates = {
  // Chat & Conversations
  NoConversations: (props: Partial<EmptyStateProps> = {}) => (
    <EmptyState
      icon={require('lucide-react').MessageSquare}
      title="No conversations yet"
      description="Start a new conversation to begin chatting with AI. Your conversation history will appear here."
      action={{
        label: "Start Chatting",
        onClick: () => {
          // This will be handled by the parent component
          window.dispatchEvent(new CustomEvent('startNewConversation'));
        }
      }}
      {...props}
    />
  ),

  NoMessages: (props: Partial<EmptyStateProps> = {}) => (
    <EmptyState
      icon={require('lucide-react').MessageCircle}
      title="No messages in this conversation"
      description="Send your first message to start the conversation."
      variant="minimal"
      size="sm"
      {...props}
    />
  ),

  // File Management
  NoFiles: (props: Partial<EmptyStateProps> = {}) => (
    <EmptyState
      icon={require('lucide-react').FolderOpen}
      title="No files uploaded"
      description="Upload your first file to get started with AI analysis and file management."
      action={{
        label: "Upload Files",
        onClick: () => {
          window.dispatchEvent(new CustomEvent('openFileUpload'));
        }
      }}
      {...props}
    />
  ),

  NoFilesInFolder: (props: Partial<EmptyStateProps> = {}) => (
    <EmptyState
      icon={require('lucide-react').FolderX}
      title="This folder is empty"
      description="No files found in this folder. Try uploading files or checking another folder."
      action={{
        label: "Upload Files",
        onClick: () => {
          window.dispatchEvent(new CustomEvent('openFileUpload'));
        }
      }}
      secondaryAction={{
        label: "Browse Folders",
        onClick: () => {
          window.dispatchEvent(new CustomEvent('browseFolders'));
        }
      }}
      {...props}
    />
  ),

  // Search & Results
  NoSearchResults: (props: Partial<EmptyStateProps> & { searchTerm?: string } = {}) => (
    <EmptyState
      icon={require('lucide-react').Search}
      title="No results found"
      description={props.searchTerm 
        ? `No results found for "${props.searchTerm}". Try different keywords or check your spelling.`
        : "No results match your search criteria. Try adjusting your search terms."
      }
      action={{
        label: "Clear Search",
        onClick: () => {
          window.dispatchEvent(new CustomEvent('clearSearch'));
        }
      }}
      secondaryAction={{
        label: "Browse All",
        onClick: () => {
          window.dispatchEvent(new CustomEvent('browseAll'));
        }
      }}
      {...props}
    />
  ),

  // AI & Analysis
  NoAnalysis: (props: Partial<EmptyStateProps> = {}) => (
    <EmptyState
      icon={require('lucide-react').Brain}
      title="No analysis available"
      description="This file hasn't been analyzed yet. Run AI analysis to get insights and summaries."
      action={{
        label: "Run Analysis",
        onClick: () => {
          window.dispatchEvent(new CustomEvent('runAnalysis'));
        }
      }}
      variant="illustrated"
      {...props}
    />
  ),

  // Models & Providers
  NoModels: (props: Partial<EmptyStateProps> = {}) => (
    <EmptyState
      icon={require('lucide-react').Cpu}
      title="No models available"
      description="No AI models are currently available. Check your configuration or try again later."
      action={{
        label: "Refresh",
        onClick: () => {
          window.dispatchEvent(new CustomEvent('refreshModels'));
        }
      }}
      {...props}
    />
  ),

  // Error States
  ConnectionError: (props: Partial<EmptyStateProps> = {}) => (
    <EmptyState
      icon={require('lucide-react').WifiOff}
      title="Connection lost"
      description="Unable to connect to the server. Please check your internet connection and try again."
      action={{
        label: "Retry",
        onClick: () => {
          window.dispatchEvent(new CustomEvent('retryConnection'));
        }
      }}
      variant="minimal"
      {...props}
    />
  ),

  // Generic
  NoData: (props: Partial<EmptyStateProps> = {}) => (
    <EmptyState
      icon={require('lucide-react').Database}
      title="No data available"
      description="There's no data to display at the moment."
      {...props}
    />
  ),

  Loading: (props: Partial<EmptyStateProps> = {}) => (
    <EmptyState
      icon={require('lucide-react').Loader2}
      title="Loading..."
      description="Please wait while we load your data."
      variant="minimal"
      size="sm"
      {...props}
    />
  )
};

export default EmptyState;
