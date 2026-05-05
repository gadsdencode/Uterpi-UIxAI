// File Management Routes
// Handles file upload, download, versioning, and analysis

import { Router } from "express";
import { requireAuth } from "../auth";
import { fileController } from "../controllers";
import { requireActiveSubscription } from "../subscription-middleware";
import { upload, MulterRequest } from "../middleware/upload";

const router = Router();

// =============================================================================
// FILE MANAGEMENT ROUTES
// =============================================================================

// File upload (uses multer middleware)
router.post("/api/files/upload", requireAuth, upload.single('file'), (req, res) => 
  fileController.upload(req as MulterRequest, res));

// File reindexing
router.post("/api/files/:fileId/reindex", requireAuth, (req, res) => 
  fileController.reindex(req, res));

// Get folders
router.get("/api/files/folders", requireAuth, (req, res) => 
  fileController.getFolders(req, res));

// Get single file
router.get("/api/files/:fileId", requireAuth, (req, res) => 
  fileController.getFile(req, res));

// Download file
router.get("/api/files/:fileId/download", requireAuth, (req, res) => 
  fileController.download(req, res));

// Update file
router.put("/api/files/:fileId", requireAuth, (req, res) => 
  fileController.update(req, res));

// Delete file
router.delete("/api/files/:fileId", requireAuth, (req, res) => 
  fileController.delete(req, res));

// List files
router.get("/api/files", requireAuth, (req, res) => 
  fileController.list(req, res));

// Analyze file (Pro feature)
router.post("/api/files/:fileId/analyze", requireActiveSubscription({
  requiredTier: 'pro'
}), (req, res) => fileController.analyze(req, res));

// File versions
router.get("/api/files/:fileId/versions", requireAuth, (req, res) => 
  fileController.getVersions(req, res));

router.post("/api/files/:fileId/versions/:versionId/restore", requireAuth, (req, res) => 
  fileController.restoreVersion(req, res));

// File sharing
router.post("/api/files/:fileId/share", requireAuth, (req, res) => 
  fileController.share(req, res));

// File permissions
router.get("/api/files/:fileId/permissions", requireAuth, (req, res) => 
  fileController.getPermissions(req, res));

// File analytics
router.get("/api/files/:fileId/analytics", requireAuth, (req, res) => 
  fileController.getAnalytics(req, res));

// Bulk delete
router.post("/api/files/bulk/delete", requireAuth, (req, res) => 
  fileController.bulkDelete(req, res));

export default router;
