import { useState, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export interface FileItem {
  id: number;
  name: string;
  originalName: string;
  mimeType: string;
  size: number;
  folder: string;
  description?: string;
  tags: string[];
  isPublic: boolean;
  analysisStatus: 'pending' | 'analyzing' | 'completed' | 'failed';
  aiAnalysis?: any;
  currentVersion: number;
  createdAt: string;
  updatedAt: string;
  lastAccessedAt: string;
  analyzedAt?: string;
}

export interface FileVersion {
  id: number;
  versionNumber: number;
  size: number;
  changeDescription?: string;
  changeType: string;
  createdAt: string;
  createdBy: number;
}

export interface FilePermission {
  id: number;
  userId?: number;
  permission: 'read' | 'write';
  shareToken: string;
  shareExpiry?: string;
  createdAt: string;
}

export interface FileAnalytics {
  interactions: Array<{
    interactionType: string;
    count: number;
    lastInteraction: string;
  }>;
  totalVersions: number;
  lastActivity?: string;
}

export interface UploadFileData {
  file: File;
  folder?: string;
  description?: string;
  tags?: string[];
  projectId?: number; // Project scope for the upload
}

export interface UpdateFileData {
  name?: string;
  description?: string;
  tags?: string[];
  folder?: string;
  isPublic?: boolean;
}

export interface ShareFileData {
  userId?: number;
  permission: 'read' | 'write';
  shareExpiry?: string;
}

export interface ListFilesOptions {
  folder?: string;
  search?: string;
  tags?: string[];
  mimeType?: string;
  projectId?: number; // Filter by project
  limit?: number;
  offset?: number;
}

export interface ListFilesResponse {
  files: FileItem[];
  total: number;
  pagination: {
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

class FileManagerAPI {
  private static async request(endpoint: string, options: RequestInit = {}) {
    const response = await fetch(endpoint, {
      headers: {
        ...options.headers,
      },
      ...options,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(error.error || `HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  static async uploadFile(data: UploadFileData): Promise<FileItem> {
    const formData = new FormData();
    formData.append('file', data.file);
    if (data.folder) formData.append('folder', data.folder);
    if (data.description) formData.append('description', data.description);
    if (data.tags) formData.append('tags', JSON.stringify(data.tags));
    if (data.projectId) formData.append('projectId', data.projectId.toString());

    const result = await FileManagerAPI.request('/api/files/upload', {
      method: 'POST',
      body: formData,
    });
    return result.file;
  }

  static async listFiles(options: ListFilesOptions = {}): Promise<ListFilesResponse> {
    const params = new URLSearchParams();
    if (options.folder) params.append('folder', options.folder);
    if (options.search) params.append('search', options.search);
    if (options.mimeType) params.append('mimeType', options.mimeType);
    if (options.tags) params.append('tags', JSON.stringify(options.tags));
    if (options.projectId !== undefined) params.append('projectId', options.projectId.toString());
    if (options.limit) params.append('limit', options.limit.toString());
    if (options.offset) params.append('offset', options.offset.toString());

    const result = await FileManagerAPI.request(`/api/files?${params.toString()}`);
    return {
      files: result.files,
      total: result.total,
      pagination: result.pagination,
    };
  }

  static async getFile(fileId: number): Promise<FileItem> {
    const result = await FileManagerAPI.request(`/api/files/${fileId}`);
    return result.file;
  }

  static async updateFile(fileId: number, data: UpdateFileData): Promise<FileItem> {
    const result = await FileManagerAPI.request(`/api/files/${fileId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return result.file;
  }

  static async deleteFile(fileId: number): Promise<void> {
    await FileManagerAPI.request(`/api/files/${fileId}`, {
      method: 'DELETE',
    });
  }

  static async downloadFile(fileId: number, fileName: string): Promise<void> {
    const response = await fetch(`/api/files/${fileId}/download`);
    if (!response.ok) {
      throw new Error('Failed to download file');
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }

  static async analyzeFile(fileId: number): Promise<any> {
    const result = await FileManagerAPI.request(`/api/files/${fileId}/analyze`, {
      method: 'POST',
    });
    return result.analysis;
  }

  static async getFileVersions(fileId: number): Promise<FileVersion[]> {
    const result = await FileManagerAPI.request(`/api/files/${fileId}/versions`);
    return result.versions;
  }

  static async restoreFileVersion(fileId: number, versionId: number): Promise<void> {
    await FileManagerAPI.request(`/api/files/${fileId}/versions/${versionId}/restore`, {
      method: 'POST',
    });
  }

  static async shareFile(fileId: number, data: ShareFileData): Promise<FilePermission> {
    const result = await FileManagerAPI.request(`/api/files/${fileId}/share`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return result;
  }

  static async getFilePermissions(fileId: number): Promise<FilePermission[]> {
    const result = await FileManagerAPI.request(`/api/files/${fileId}/permissions`);
    return result.permissions;
  }

  static async getFileAnalytics(fileId: number): Promise<FileAnalytics> {
    const result = await FileManagerAPI.request(`/api/files/${fileId}/analytics`);
    return result.analytics;
  }

  static async getFolders(): Promise<string[]> {
    const result = await FileManagerAPI.request('/api/files/folders');
    return result.folders;
  }

  static async bulkDeleteFiles(fileIds: number[]): Promise<{deleted: number; failed: number; message: string}> {
    const result = await FileManagerAPI.request('/api/files/bulk/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileIds }),
    });
    return result;
  }

  static async reindexFile(fileId: number): Promise<{ success: boolean; message?: string }> {
    const result = await FileManagerAPI.request(`/api/files/${fileId}/reindex`, {
      method: 'POST'
    });
    return result;
  }
}

export const useFileManager = () => {
  const queryClient = useQueryClient();
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [isUploading, setIsUploading] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Query for file list
  const useFileList = (options: ListFilesOptions = {}) => {
    return useQuery({
      queryKey: ['files', options],
      queryFn: () => FileManagerAPI.listFiles(options),
      staleTime: 1000 * 60 * 5, // 5 minutes
    });
  };

  // Query for single file
  const useFile = (fileId: number | null) => {
    return useQuery({
      queryKey: ['file', fileId],
      queryFn: () => fileId ? FileManagerAPI.getFile(fileId) : null,
      enabled: !!fileId,
    });
  };

  // Query for file versions
  const useFileVersions = (fileId: number | null) => {
    return useQuery({
      queryKey: ['fileVersions', fileId],
      queryFn: () => fileId ? FileManagerAPI.getFileVersions(fileId) : [],
      enabled: !!fileId,
    });
  };

  // Query for file permissions
  const useFilePermissions = (fileId: number | null) => {
    return useQuery({
      queryKey: ['filePermissions', fileId],
      queryFn: () => fileId ? FileManagerAPI.getFilePermissions(fileId) : [],
      enabled: !!fileId,
    });
  };

  // Query for file analytics
  const useFileAnalytics = (fileId: number | null) => {
    return useQuery({
      queryKey: ['fileAnalytics', fileId],
      queryFn: () => fileId ? FileManagerAPI.getFileAnalytics(fileId) : null,
      enabled: !!fileId,
    });
  };

  // Query for folders
  const useFolders = () => {
    return useQuery({
      queryKey: ['folders'],
      queryFn: FileManagerAPI.getFolders,
      staleTime: 1000 * 60 * 10, // 10 minutes
    });
  };

  // Upload file mutation
  const uploadFileMutation = useMutation({
    mutationFn: FileManagerAPI.uploadFile,
    onMutate: () => {
      setIsUploading(true);
      setUploadProgress(0);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files'] });
      queryClient.invalidateQueries({ queryKey: ['folders'] });
      setUploadProgress(100);
    },
    onError: (error) => {
      console.error('Upload failed:', error);
      setUploadProgress(0);
    },
    onSettled: () => {
      setIsUploading(false);
      setTimeout(() => setUploadProgress(0), 1000);
    },
  });

  // Update file mutation
  const updateFileMutation = useMutation({
    mutationFn: ({ fileId, data }: { fileId: number; data: UpdateFileData }) =>
      FileManagerAPI.updateFile(fileId, data),
    onSuccess: (updatedFile) => {
      queryClient.invalidateQueries({ queryKey: ['files'] });
      queryClient.invalidateQueries({ queryKey: ['file', updatedFile.id] });
      queryClient.invalidateQueries({ queryKey: ['folders'] });
    },
  });

  // Delete file mutation
  const deleteFileMutation = useMutation({
    mutationFn: FileManagerAPI.deleteFile,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files'] });
      queryClient.invalidateQueries({ queryKey: ['folders'] });
    },
  });

  // Analyze file mutation
  const analyzeFileMutation = useMutation({
    mutationFn: FileManagerAPI.analyzeFile,
    onSuccess: (analysis, fileId) => {
      queryClient.invalidateQueries({ queryKey: ['file', fileId] });
      queryClient.invalidateQueries({ queryKey: ['files'] });
    },
  });

  // Restore file version mutation
  const restoreVersionMutation = useMutation({
    mutationFn: ({ fileId, versionId }: { fileId: number; versionId: number }) =>
      FileManagerAPI.restoreFileVersion(fileId, versionId),
    onSuccess: (_, { fileId }) => {
      queryClient.invalidateQueries({ queryKey: ['file', fileId] });
      queryClient.invalidateQueries({ queryKey: ['fileVersions', fileId] });
      queryClient.invalidateQueries({ queryKey: ['files'] });
    },
  });

  // Share file mutation
  const shareFileMutation = useMutation({
    mutationFn: ({ fileId, data }: { fileId: number; data: ShareFileData }) =>
      FileManagerAPI.shareFile(fileId, data),
    onSuccess: (_, { fileId }) => {
      queryClient.invalidateQueries({ queryKey: ['filePermissions', fileId] });
    },
  });

  // Bulk delete mutation
  const bulkDeleteMutation = useMutation({
    mutationFn: FileManagerAPI.bulkDeleteFiles,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files'] });
      queryClient.invalidateQueries({ queryKey: ['folders'] });
    },
  });

  // Reindex file embeddings mutation
  const reindexFileMutation = useMutation({
    mutationFn: FileManagerAPI.reindexFile,
    onSuccess: () => {
      // Not much to invalidate; embeddings aren't listed here
      // But we can refresh files to update any timestamps shown
      queryClient.invalidateQueries({ queryKey: ['files'] });
    },
  });

  // Upload file with progress tracking
  const uploadFile = useCallback(async (data: UploadFileData) => {
    try {
      // Simulate progress for now - in a real implementation, you'd track actual upload progress
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => Math.min(prev + 10, 90));
      }, 100);

      const result = await uploadFileMutation.mutateAsync(data);
      
      clearInterval(progressInterval);
      setUploadProgress(100);
      
      return result;
    } catch (error) {
      setUploadProgress(0);
      throw error;
    }
  }, [uploadFileMutation]);

  // Download file
  const downloadFile = useCallback(async (fileId: number, fileName: string) => {
    try {
      await FileManagerAPI.downloadFile(fileId, fileName);
    } catch (error) {
      console.error('Download failed:', error);
      throw error;
    }
  }, []);

  // Cancel upload
  const cancelUpload = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsUploading(false);
    setUploadProgress(0);
  }, []);

  return {
    // Query hooks
    useFileList,
    useFile,
    useFileVersions,
    useFilePermissions,
    useFileAnalytics,
    useFolders,

    // Upload state
    isUploading,
    uploadProgress,
    
    // File operations
    uploadFile,
    downloadFile,
    updateFile: updateFileMutation.mutate,
    deleteFile: deleteFileMutation.mutate,
    analyzeFile: analyzeFileMutation.mutate,
    restoreFileVersion: restoreVersionMutation.mutate,
    shareFile: shareFileMutation.mutate,
    bulkDeleteFiles: bulkDeleteMutation.mutate,
    reindexFile: reindexFileMutation.mutate,
    cancelUpload,

    // Mutation states
    isUpdating: updateFileMutation.isPending,
    isDeleting: deleteFileMutation.isPending,
    isAnalyzing: analyzeFileMutation.isPending,
    isRestoring: restoreVersionMutation.isPending,
    isSharing: shareFileMutation.isPending,
    isBulkDeleting: bulkDeleteMutation.isPending,
    isReindexing: reindexFileMutation.isPending,

    // Error states
    uploadError: uploadFileMutation.error,
    updateError: updateFileMutation.error,
    deleteError: deleteFileMutation.error,
    analyzeError: analyzeFileMutation.error,
    restoreError: restoreVersionMutation.error,
    shareError: shareFileMutation.error,
    bulkDeleteError: bulkDeleteMutation.error,
    reindexError: reindexFileMutation.error,
  };
}; 