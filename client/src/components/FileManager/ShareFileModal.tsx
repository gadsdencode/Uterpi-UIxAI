import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Share, 
  Copy, 
  Check, 
  Calendar, 
  Users, 
  Lock, 
  Globe, 
  X,
  ChevronDown,
  Clock
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Checkbox } from '../ui/checkbox';
import { Separator } from '../ui/separator';
import { Badge } from '../ui/badge';
import { toast } from 'sonner';
import { type FileItem, type ShareFileData, useFileManager } from '../../hooks/useFileManager';
import { useMutation, useQueryClient } from '@tanstack/react-query';

interface ShareFileModalProps {
  isOpen: boolean;
  onClose: () => void;
  file: FileItem | null;
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
      relative p-4 rounded-xl backdrop-blur-xl border overflow-hidden
      bg-gradient-to-br from-slate-800/40 to-slate-900/40 border-slate-600/30
      ${className}
    `}
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

export const ShareFileModal: React.FC<ShareFileModalProps> = ({
  isOpen,
  onClose,
  file
}) => {
  const fileManager = useFileManager();
  const queryClient = useQueryClient();
  const [permission, setPermission] = useState<'read' | 'write'>('read');
  const [expiryEnabled, setExpiryEnabled] = useState(false);
  const [expiryDate, setExpiryDate] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);
  const [generatedShareToken, setGeneratedShareToken] = useState<string | null>(null);

  // Share file mutation
  const shareFileMutation = useMutation({
    mutationFn: async ({ fileId, data }: { fileId: number; data: ShareFileData }) => {
      const response = await fetch(`/api/files/${fileId}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(error.error || `HTTP ${response.status}: ${response.statusText}`);
      }
      return response.json();
    },
    onSuccess: (_, { fileId }) => {
      queryClient.invalidateQueries({ queryKey: ['filePermissions', fileId] });
    },
  });

  // Get existing permissions for this file
  const { data: permissions, isLoading: permissionsLoading } = fileManager.useFilePermissions(file?.id || null);

  // Reset form when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setPermission('read');
      setExpiryEnabled(false);
      setExpiryDate('');
      setCopiedLink(false);
      setGeneratedShareToken(null);
    }
  }, [isOpen]);

  // Generate default expiry date (7 days from now)
  const getDefaultExpiryDate = () => {
    const date = new Date();
    date.setDate(date.getDate() + 7);
    return date.toISOString().split('T')[0];
  };

  const handleShare = async () => {
    if (!file) return;

    try {
      const shareData = {
        permission,
        shareExpiry: expiryEnabled ? new Date(expiryDate).toISOString() : undefined
      };

      // Use the mutation directly to get the result
      const result = await shareFileMutation.mutateAsync({ fileId: file.id, data: shareData });
      setGeneratedShareToken(result.shareToken);
      
      toast.success('Share link generated successfully');
    } catch (error) {
      console.error('Share failed:', error);
      toast.error('Failed to generate share link');
    }
  };

  const handleCopyLink = async () => {
    if (!generatedShareToken) return;

    const shareUrl = `${window.location.origin}/shared/${generatedShareToken}`;
    
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedLink(true);
      toast.success('Share link copied to clipboard');
      
      setTimeout(() => setCopiedLink(false), 2000);
    } catch (error) {
      console.error('Copy failed:', error);
      toast.error('Failed to copy link');
    }
  };

  const formatExpiryDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (!file) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] bg-slate-950 border-slate-700 text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-semibold text-white">
            <Share className="w-5 h-5 text-violet-400" />
            Share File
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* File Info */}
          <HolographicBubble>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <h3 className="font-medium text-white">{file.name}</h3>
                <p className="text-sm text-slate-400">
                  {(file.size / 1024 / 1024).toFixed(2)} MB • {file.mimeType}
                </p>
              </div>
              <Badge variant="secondary" className="bg-violet-500/20 text-violet-300 border-violet-400/30">
                {file.isPublic ? 'Public' : 'Private'}
              </Badge>
            </div>
          </HolographicBubble>

          {/* Share Form */}
          <HolographicBubble>
            <div className="space-y-4">
              <h4 className="font-medium text-white flex items-center gap-2">
                <Users className="w-4 h-4" />
                Create New Share Link
              </h4>

              {/* Permission Level */}
              <div className="space-y-2">
                <Label htmlFor="permission" className="text-slate-300">Permission Level</Label>
                <Select value={permission} onValueChange={(value: 'read' | 'write') => setPermission(value)}>
                  <SelectTrigger className="bg-slate-800/50 border-slate-600/50 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-600">
                    <SelectItem value="read" className="text-white">
                      <div className="flex items-center gap-2">
                        <Lock className="w-4 h-4" />
                        <div>
                          <div>Read Only</div>
                          <div className="text-xs text-slate-400">Can view and download</div>
                        </div>
                      </div>
                    </SelectItem>
                    <SelectItem value="write" className="text-white">
                      <div className="flex items-center gap-2">
                        <Globe className="w-4 h-4" />
                        <div>
                          <div>Read & Write</div>
                          <div className="text-xs text-slate-400">Can view, download, and edit</div>
                        </div>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Expiry Settings */}
              <div className="space-y-3">
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="expiry" 
                    checked={expiryEnabled}
                    onCheckedChange={(checked) => setExpiryEnabled(checked === true)}
                    className="border-slate-600"
                  />
                  <Label htmlFor="expiry" className="text-slate-300 flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    Set expiration date
                  </Label>
                </div>

                <AnimatePresence>
                  {expiryEnabled && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <Input
                        type="datetime-local"
                        value={expiryDate}
                        onChange={(e) => setExpiryDate(e.target.value)}
                        min={new Date().toISOString().slice(0, 16)}
                        className="bg-slate-800/50 border-slate-600/50 text-white"
                        placeholder={getDefaultExpiryDate()}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Generate Share Button */}
              <Button 
                onClick={handleShare} 
                disabled={fileManager.isSharing || (expiryEnabled && !expiryDate)}
                className="w-full bg-violet-600 hover:bg-violet-700 text-white"
              >
                {fileManager.isSharing ? 'Generating...' : 'Generate Share Link'}
              </Button>

              {/* Generated Link */}
              <AnimatePresence>
                {generatedShareToken && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="space-y-3"
                  >
                    <Separator className="bg-slate-600/50" />
                    
                    <div className="space-y-2">
                      <Label className="text-slate-300">Share Link</Label>
                      <div className="flex gap-2">
                        <Input
                          value={`${window.location.origin}/shared/${generatedShareToken}`}
                          readOnly
                          className="bg-slate-800/50 border-slate-600/50 text-white"
                        />
                        <Button
                          onClick={handleCopyLink}
                          variant="outline"
                          size="sm"
                          className="border-slate-600/50 text-slate-300 hover:text-white hover:bg-slate-700/50"
                        >
                          {copiedLink ? (
                            <Check className="w-4 h-4" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </HolographicBubble>

          {/* Existing Shares */}
          {permissions && permissions.length > 0 && (
            <HolographicBubble>
              <div className="space-y-4">
                <h4 className="font-medium text-white flex items-center gap-2">
                  <Globe className="w-4 h-4" />
                  Existing Shares ({permissions.length})
                </h4>
                
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {permissions.map((perm) => (
                    <div key={perm.id} className="flex items-center justify-between p-3 bg-slate-800/30 rounded-lg border border-slate-600/30">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Badge 
                            variant="secondary" 
                            className={perm.permission === 'write' 
                              ? 'bg-orange-500/20 text-orange-300 border-orange-400/30' 
                              : 'bg-blue-500/20 text-blue-300 border-blue-400/30'
                            }
                          >
                            {perm.permission}
                          </Badge>
                          {perm.shareExpiry && (
                            <Badge variant="outline" className="border-slate-600/50 text-slate-400">
                              <Clock className="w-3 h-3 mr-1" />
                              Expires {formatExpiryDate(perm.shareExpiry)}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 mt-1 truncate">
                          {perm.shareToken}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </HolographicBubble>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3">
            <Button 
              variant="outline" 
              onClick={onClose}
              className="border-slate-600/50 text-slate-300 hover:text-white hover:bg-slate-700/50"
            >
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}; 