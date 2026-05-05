// Multer Upload Middleware
// Handles file upload configuration with disk storage to prevent memory exhaustion

import type { Request } from "express";
import multer from 'multer';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

// Create temp directory for file uploads
export const UPLOAD_TEMP_DIR = path.join(os.tmpdir(), 'oneoff-uploads');
if (!fs.existsSync(UPLOAD_TEMP_DIR)) {
  fs.mkdirSync(UPLOAD_TEMP_DIR, { recursive: true });
}

/**
 * Cleanup old temp files on startup (files older than 1 hour)
 */
export function cleanupOldTempFiles(): void {
  try {
    const files = fs.readdirSync(UPLOAD_TEMP_DIR);
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    
    for (const file of files) {
      const filePath = path.join(UPLOAD_TEMP_DIR, file);
      try {
        const stats = fs.statSync(filePath);
        if (stats.mtimeMs < oneHourAgo) {
          fs.unlinkSync(filePath);
          console.log(`[Multer] Cleaned up old temp file: ${file}`);
        }
      } catch {
        // Ignore errors for individual files
      }
    }
  } catch (error) {
    console.warn('[Multer] Error cleaning up temp files:', error);
  }
}

// Run cleanup on module load
cleanupOldTempFiles();

// Multer disk storage configuration (prevents memory exhaustion)
const diskStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_TEMP_DIR);
  },
  filename: (req, file, cb) => {
    // Generate unique filename to prevent collisions
    const uniqueId = uuidv4();
    const ext = path.extname(file.originalname) || '';
    cb(null, `${uniqueId}${ext}`);
  }
});

// File filter for allowed MIME types
const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const mt = file.mimetype || '';
  const ok = mt.startsWith('image/') ||
             mt.startsWith('text/') ||
             mt === 'application/json' ||
             mt === 'application/pdf' ||
             mt === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  cb(null, ok);
};

// Configured multer instance
export const upload = multer({
  storage: diskStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter
});

// Extended request interface for file uploads
export interface MulterRequest extends Request {
  file?: Express.Multer.File;
}
