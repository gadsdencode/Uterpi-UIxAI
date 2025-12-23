// File Controller - Handles file management routes
// Upload, download, delete, versions, sharing, analytics

import type { Request, Response } from "express";
import { fileStorage } from "../file-storage";
import { vectorProcessor } from "../vector-processor";
import { isVectorizationEnabled } from "../vector-flags";
import fs from 'fs';
import { promisify } from 'util';

const unlinkAsync = promisify(fs.unlink);

/**
 * Clean up temp file after upload (success or error)
 */
async function cleanupTempFile(filePath: string | undefined): Promise<void> {
  if (!filePath) return;
  
  try {
    await unlinkAsync(filePath);
    console.log(`[FileController] 🧹 Cleaned up temp file: ${filePath}`);
  } catch (error) {
    // File might already be deleted or not exist
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn(`[FileController] Failed to cleanup temp file ${filePath}:`, error);
    }
  }
}

// Helper to validate file IDs
function validateFileId(id: string): number {
  const fileId = parseInt(id);
  if (isNaN(fileId) || fileId < 1) {
    throw new Error("Invalid file ID");
  }
  return fileId;
}

// Multer request interface (disk storage provides path instead of buffer)
interface MulterRequest extends Request {
  file?: Express.Multer.File & {
    path?: string; // Disk storage path
  };
}

/**
 * File Controller - Handles all file-related routes
 */
export class FileController {

  /**
   * Upload file
   * Now uses disk storage to prevent memory exhaustion on large files
   */
  async upload(req: MulterRequest, res: Response): Promise<void> {
    const tempFilePath = req.file?.path;
    
    try {
      const user = req.user as any;
      
      if (!req.file) {
        res.status(400).json({ error: "No file uploaded" });
        return;
      }

      // Ensure we have a file path (disk storage) or buffer (memory storage fallback)
      if (!req.file.path && !req.file.buffer) {
        res.status(400).json({ error: "File upload failed - no content available" });
        return;
      }

      const { folder, description, tags, projectId } = req.body;
      const parsedTags = tags ? JSON.parse(tags) : [];
      const parsedProjectId = projectId ? parseInt(projectId) : undefined;

      // Read file content from disk (or use buffer if available for backwards compatibility)
      let fileContent: Buffer;
      if (req.file.path) {
        // Disk storage mode - read file from temp location
        fileContent = await fs.promises.readFile(req.file.path);
        console.log(`[FileController] 📂 Read ${fileContent.length} bytes from temp file: ${req.file.path}`);
      } else if (req.file.buffer) {
        // Memory storage fallback
        fileContent = req.file.buffer;
      } else {
        throw new Error('No file content available');
      }

      const file = await fileStorage.uploadFile(user.id, {
        name: req.file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_'),
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        content: fileContent,
        size: req.file.size,
        folder: folder || 'default',
        description,
        tags: parsedTags,
        projectId: parsedProjectId
      });

      // Clean up temp file after successful upload
      await cleanupTempFile(tempFilePath);

      // Queue for vectorization if enabled
      if (isVectorizationEnabled() && file.mimeType.startsWith('text/')) {
        try {
          await vectorProcessor.queueFileVectorization(file.id, user.id);
          console.log(`📤 File ${file.id} queued for vectorization`);
        } catch (vecError) {
          console.warn('Vectorization queue failed:', vecError);
        }
      }

      res.json({
        success: true,
        file: {
          id: file.id,
          name: file.name,
          originalName: file.originalName,
          mimeType: file.mimeType,
          size: file.size,
          folder: file.folder,
          createdAt: file.createdAt
        }
      });
    } catch (error) {
      // Clean up temp file on error
      await cleanupTempFile(tempFilePath);
      
      console.error("File upload error:", error);
      res.status(500).json({ error: "Failed to upload file" });
    }
  }

  /**
   * Reindex file for vectorization
   */
  async reindex(req: Request, res: Response): Promise<void> {
    try {
      const fileId = validateFileId(req.params.fileId);
      const user = req.user as any;

      const file = await fileStorage.getFile(fileId, user.id);
      if (!file) {
        res.status(404).json({ error: "File not found or access denied" });
        return;
      }

      if (isVectorizationEnabled()) {
        await vectorProcessor.queueFileVectorization(file.id, user.id);
        res.json({
          success: true,
          message: "File queued for reindexing"
        });
      } else {
        res.status(400).json({ error: "Vectorization not available" });
      }
    } catch (error) {
      console.error("File reindex error:", error);
      res.status(500).json({ error: "Failed to reindex file" });
    }
  }

  /**
   * Get folders
   */
  async getFolders(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user as any;
      
      const result = await fileStorage.listUserFiles(user.id, {});
      
      // Extract unique folders from files
      const foldersSet = new Set<string>();
      result.files.forEach((f: any) => {
        if (f.folder) foldersSet.add(f.folder);
      });
      
      const folders = Array.from(foldersSet).map(name => ({
        name,
        fileCount: result.files.filter((f: any) => f.folder === name).length
      }));

      res.json({
        success: true,
        folders
      });
    } catch (error) {
      console.error("Get folders error:", error);
      res.status(500).json({ error: "Failed to get folders" });
    }
  }

  /**
   * Get file by ID
   */
  async getFile(req: Request, res: Response): Promise<void> {
    try {
      const fileId = validateFileId(req.params.fileId);
      const user = req.user as any;

      const file = await fileStorage.getFile(fileId, user.id);
      if (!file) {
        res.status(404).json({ error: "File not found or access denied" });
        return;
      }

      // Log file interaction
      await fileStorage.logFileInteraction(fileId, user.id, {
        interactionType: 'view',
        details: { source: 'api' }
      });

      res.json({
        success: true,
        file: {
          id: file.id,
          name: file.name,
          originalName: file.originalName,
          mimeType: file.mimeType,
          size: file.size,
          folder: file.folder,
          description: file.description,
          tags: file.tags,
          createdAt: file.createdAt,
          updatedAt: file.updatedAt
        }
      });
    } catch (error) {
      console.error("Get file error:", error);
      res.status(500).json({ error: "Failed to get file" });
    }
  }

  /**
   * Download file
   */
  async download(req: Request, res: Response): Promise<void> {
    try {
      const fileId = validateFileId(req.params.fileId);
      const user = req.user as any;

      const result = await fileStorage.getFileContent(fileId, user.id);
      if (!result) {
        res.status(404).json({ error: "File not found or access denied" });
        return;
      }

      // Log download interaction
      await fileStorage.logFileInteraction(fileId, user.id, {
        interactionType: 'download',
        details: { source: 'api' }
      });

      res.setHeader('Content-Type', result.mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${result.content.substring(0, 50)}"`);
      res.send(Buffer.from(result.content, 'utf-8'));
    } catch (error) {
      console.error("File download error:", error);
      res.status(500).json({ error: "Failed to download file" });
    }
  }

  /**
   * Update file
   */
  async update(req: Request, res: Response): Promise<void> {
    try {
      const fileId = validateFileId(req.params.fileId);
      const user = req.user as any;
      const { name, folder, description, tags } = req.body;

      const file = await fileStorage.updateFile(fileId, user.id, {
        name,
        folder,
        description,
        tags
      });

      if (!file) {
        res.status(404).json({ error: "File not found or access denied" });
        return;
      }

      res.json({
        success: true,
        file: {
          id: file.id,
          name: file.name,
          folder: file.folder,
          description: file.description,
          tags: file.tags,
          updatedAt: file.updatedAt
        }
      });
    } catch (error) {
      console.error("Update file error:", error);
      res.status(500).json({ error: "Failed to update file" });
    }
  }

  /**
   * Delete file
   */
  async delete(req: Request, res: Response): Promise<void> {
    try {
      const fileId = validateFileId(req.params.fileId);
      const user = req.user as any;

      const deleted = await fileStorage.deleteFile(fileId, user.id);
      if (!deleted) {
        res.status(404).json({ error: "File not found or access denied" });
        return;
      }

      res.json({
        success: true,
        message: "File deleted successfully"
      });
    } catch (error) {
      console.error("Delete file error:", error);
      res.status(500).json({ error: "Failed to delete file" });
    }
  }

  /**
   * List user files
   */
  async list(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user as any;
      const { 
        folder, 
        search, 
        tags, 
        mimeType, 
        projectId,
        limit = '20', 
        offset = '0' 
      } = req.query;

      const parsedProjectId = projectId ? parseInt(projectId as string) : undefined;

      const result = await fileStorage.listUserFiles(user.id, {
        folder: folder as string,
        search: search as string,
        tags: tags ? (tags as string).split(',') : undefined,
        mimeType: mimeType as string,
        projectId: parsedProjectId,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string)
      });

      res.json({
        success: true,
        files: result.files.map((f: any) => ({
          id: f.id,
          name: f.name,
          originalName: f.originalName,
          mimeType: f.mimeType,
          size: f.size,
          folder: f.folder,
          createdAt: f.createdAt
        })),
        total: result.total
      });
    } catch (error) {
      console.error("List files error:", error);
      res.status(500).json({ error: "Failed to list files" });
    }
  }

  /**
   * Analyze file with AI
   */
  async analyze(req: Request, res: Response): Promise<void> {
    try {
      const fileId = validateFileId(req.params.fileId);
      const user = req.user as any;

      const analysis = await fileStorage.analyzeFileWithAI(fileId, user.id);
      if (!analysis) {
        res.status(404).json({ error: "File not found or analysis failed" });
        return;
      }

      res.json({
        success: true,
        analysis
      });
    } catch (error) {
      console.error("File analysis error:", error);
      res.status(500).json({ error: "Failed to analyze file" });
    }
  }

  /**
   * Get file versions
   */
  async getVersions(req: Request, res: Response): Promise<void> {
    try {
      const fileId = validateFileId(req.params.fileId);
      const user = req.user as any;

      const versions = await fileStorage.getFileVersions(fileId, user.id);
      
      res.json({
        success: true,
        versions
      });
    } catch (error) {
      console.error("Get file versions error:", error);
      res.status(500).json({ error: "Failed to get file versions" });
    }
  }

  /**
   * Restore file version
   */
  async restoreVersion(req: Request, res: Response): Promise<void> {
    try {
      const fileId = validateFileId(req.params.fileId);
      const versionId = validateFileId(req.params.versionId);
      const user = req.user as any;

      const file = await fileStorage.restoreFileVersion(fileId, versionId, user.id);
      if (!file) {
        res.status(404).json({ error: "Version not found or restore failed" });
        return;
      }

      res.json({
        success: true,
        message: "File version restored successfully",
        file: {
          id: file.id,
          name: file.name,
          updatedAt: file.updatedAt
        }
      });
    } catch (error) {
      console.error("Restore version error:", error);
      res.status(500).json({ error: "Failed to restore file version" });
    }
  }

  /**
   * Share file
   */
  async share(req: Request, res: Response): Promise<void> {
    try {
      const fileId = validateFileId(req.params.fileId);
      const user = req.user as any;
      const { targetUserId, permission, shareExpiry } = req.body;

      const shareData = {
        userId: targetUserId ? parseInt(targetUserId) : undefined,
        permission: permission || 'read',
        shareExpiry: shareExpiry || undefined
      };

      const permissionResult = await fileStorage.shareFile(fileId, user.id, shareData);

      res.json({
        success: true,
        permission: {
          id: permissionResult.id,
          shareToken: permissionResult.shareToken,
          permission: permissionResult.permission,
          shareExpiry: permissionResult.shareExpiry
        }
      });
    } catch (error) {
      console.error("Share file error:", error);
      res.status(500).json({ error: "Failed to share file" });
    }
  }

  /**
   * Get file permissions
   */
  async getPermissions(req: Request, res: Response): Promise<void> {
    try {
      const fileId = validateFileId(req.params.fileId);
      const user = req.user as any;

      const permissions = await fileStorage.getFilePermissions(fileId, user.id);
      
      res.json({
        success: true,
        permissions: permissions.map((perm: any) => ({
          id: perm.id,
          userId: perm.userId,
          permission: perm.permission,
          shareToken: perm.shareToken,
          shareExpiry: perm.shareExpiry,
          createdAt: perm.createdAt
        }))
      });
    } catch (error) {
      console.error("Get file permissions error:", error);
      res.status(500).json({ error: "Failed to get file permissions" });
    }
  }

  /**
   * Get file analytics
   */
  async getAnalytics(req: Request, res: Response): Promise<void> {
    try {
      const fileId = validateFileId(req.params.fileId);
      const user = req.user as any;

      const analytics = await fileStorage.getFileAnalytics(fileId, user.id);
      if (!analytics) {
        res.status(404).json({ error: "File not found or access denied" });
        return;
      }

      res.json({
        success: true,
        analytics
      });
    } catch (error) {
      console.error("Get file analytics error:", error);
      res.status(500).json({ error: "Failed to get file analytics" });
    }
  }

  /**
   * Bulk delete files
   */
  async bulkDelete(req: Request, res: Response): Promise<void> {
    try {
      const { fileIds } = req.body;
      const user = req.user as any;

      if (!Array.isArray(fileIds) || fileIds.length === 0) {
        res.status(400).json({ error: "Invalid file IDs array" });
        return;
      }

      const results = await Promise.allSettled(
        fileIds.map(id => fileStorage.deleteFile(parseInt(id), user.id))
      );

      const successful = results.filter(r => r.status === 'fulfilled' && r.value).length;
      const failed = results.length - successful;

      res.json({
        success: true,
        deleted: successful,
        failed,
        message: `Successfully deleted ${successful} files${failed > 0 ? `, ${failed} failed` : ''}`
      });
    } catch (error) {
      console.error("Bulk delete error:", error);
      res.status(500).json({ error: "Failed to delete files" });
    }
  }
}

// Export singleton instance
export const fileController = new FileController();

