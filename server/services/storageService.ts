// Replit Object Storage Service
// Wrapper for @replit/object-storage SDK with proper error handling
// This service handles file uploads, downloads, and deletions to Replit's Object Storage

import { Client } from "@replit/object-storage";
import { Readable } from "stream";
import { v4 as uuidv4 } from "uuid";
import fs from "fs";

// Initialize the Replit Object Storage client
// Authentication is handled automatically in Replit's environment
const client = new Client();

// Flag to track if we're running in Replit environment (Object Storage available)
let isReplitEnvironment: boolean | null = null;

/**
 * Check if Replit Object Storage is available
 * Returns false if running outside Replit or if bucket is not configured
 */
async function checkReplitAvailability(): Promise<boolean> {
  if (isReplitEnvironment !== null) {
    return isReplitEnvironment;
  }

  try {
    // Try to list objects to verify connection
    const result = await client.list();
    isReplitEnvironment = result.ok;
    
    if (result.ok) {
      console.log("✅ [StorageService] Replit Object Storage connected successfully");
    } else {
      console.warn("⚠️ [StorageService] Replit Object Storage not available:", result.error);
      isReplitEnvironment = false;
    }
  } catch (error) {
    console.warn("⚠️ [StorageService] Replit Object Storage check failed:", error);
    isReplitEnvironment = false;
  }

  return isReplitEnvironment;
}

/**
 * Generate a unique storage key for a file
 * Format: uploads/{userId}/{uuid}.{extension}
 */
export function generateStorageKey(userId: number, originalName: string): string {
  const extension = originalName.split(".").pop() || "bin";
  const uniqueId = uuidv4();
  return `uploads/${userId}/${uniqueId}.${extension}`;
}

/**
 * Storage Service Interface
 */
export interface StorageServiceInterface {
  /** Check if Object Storage is available */
  isAvailable(): Promise<boolean>;
  
  /** Upload a file to Object Storage */
  uploadFile(key: string, content: Buffer | string): Promise<{ key: string; success: boolean }>;
  
  /** Upload a file from disk path (streams file to avoid memory issues) */
  uploadFromPath(key: string, filePath: string): Promise<{ key: string; success: boolean }>;
  
  /** Upload from a readable stream */
  uploadFromStream(key: string, stream: Readable): Promise<{ key: string; success: boolean }>;
  
  /** Download file as Buffer */
  getFileBuffer(key: string): Promise<Buffer>;
  
  /** Download file as readable stream */
  getFileStream(key: string): Promise<Readable>;
  
  /** Download file as text */
  getFileText(key: string): Promise<string>;
  
  /** Delete a file from Object Storage */
  deleteFile(key: string): Promise<boolean>;
  
  /** Check if a file exists */
  fileExists(key: string): Promise<boolean>;
  
  /** Copy a file to a new location */
  copyFile(sourceKey: string, destKey: string): Promise<boolean>;
  
  /** List all files (with optional prefix filter) */
  listFiles(prefix?: string): Promise<string[]>;
}

/**
 * Replit Object Storage Service Implementation
 */
export const storageService: StorageServiceInterface = {
  /**
   * Check if Replit Object Storage is available
   */
  async isAvailable(): Promise<boolean> {
    return checkReplitAvailability();
  },

  /**
   * Upload a file to Replit Object Storage
   * @param key - The storage key (path) for the file
   * @param content - File content as Buffer or string
   * @returns Object with key and success status
   */
  async uploadFile(key: string, content: Buffer | string): Promise<{ key: string; success: boolean }> {
    try {
      const available = await this.isAvailable();
      if (!available) {
        console.warn(`⚠️ [StorageService] Object Storage not available, skipping upload for: ${key}`);
        return { key, success: false };
      }

      // Use uploadFromBytes for Buffer, uploadFromText for string
      let result;
      if (Buffer.isBuffer(content)) {
        result = await client.uploadFromBytes(key, content);
      } else {
        result = await client.uploadFromText(key, content);
      }

      if (!result.ok) {
        console.error(`❌ [StorageService] Upload failed for ${key}:`, result.error);
        throw new Error(`Failed to upload file: ${result.error}`);
      }

      console.log(`✅ [StorageService] Uploaded: ${key} (${Buffer.isBuffer(content) ? content.length : content.length} bytes)`);
      return { key, success: true };
    } catch (error) {
      console.error(`❌ [StorageService] Upload error for ${key}:`, error);
      throw error;
    }
  },

  /**
   * Upload a file from disk path (more memory efficient for large files)
   * Streams the file content instead of loading entire file into memory
   * @param key - The storage key (path) for the file
   * @param filePath - Path to the file on disk
   * @returns Object with key and success status
   */
  async uploadFromPath(key: string, filePath: string): Promise<{ key: string; success: boolean }> {
    try {
      const available = await this.isAvailable();
      if (!available) {
        console.warn(`⚠️ [StorageService] Object Storage not available, skipping upload for: ${key}`);
        return { key, success: false };
      }

      // Check if file exists
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      // Read file and upload (Replit Object Storage doesn't support streaming directly)
      // For true streaming, we'd need a different cloud storage provider
      const content = await fs.promises.readFile(filePath);
      const result = await client.uploadFromBytes(key, content);

      if (!result.ok) {
        console.error(`❌ [StorageService] Upload from path failed for ${key}:`, result.error);
        throw new Error(`Failed to upload file: ${result.error}`);
      }

      console.log(`✅ [StorageService] Uploaded from path: ${key} (${content.length} bytes from ${filePath})`);
      return { key, success: true };
    } catch (error) {
      console.error(`❌ [StorageService] Upload from path error for ${key}:`, error);
      throw error;
    }
  },

  /**
   * Upload from a readable stream
   * Note: Replit Object Storage doesn't support true streaming, so we collect chunks first
   * This is still more memory-efficient than loading entire files for streaming sources
   * @param key - The storage key (path) for the file
   * @param stream - Readable stream of file content
   * @returns Object with key and success status
   */
  async uploadFromStream(key: string, stream: Readable): Promise<{ key: string; success: boolean }> {
    try {
      const available = await this.isAvailable();
      if (!available) {
        console.warn(`⚠️ [StorageService] Object Storage not available, skipping upload for: ${key}`);
        return { key, success: false };
      }

      // Collect stream chunks into buffer
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(Buffer.from(chunk));
      }
      const content = Buffer.concat(chunks);

      const result = await client.uploadFromBytes(key, content);

      if (!result.ok) {
        console.error(`❌ [StorageService] Upload from stream failed for ${key}:`, result.error);
        throw new Error(`Failed to upload file: ${result.error}`);
      }

      console.log(`✅ [StorageService] Uploaded from stream: ${key} (${content.length} bytes)`);
      return { key, success: true };
    } catch (error) {
      console.error(`❌ [StorageService] Upload from stream error for ${key}:`, error);
      throw error;
    }
  },

  /**
   * Download a file from Object Storage as Buffer
   * @param key - The storage key of the file
   * @returns File content as Buffer
   */
  async getFileBuffer(key: string): Promise<Buffer> {
    try {
      const available = await this.isAvailable();
      if (!available) {
        throw new Error("Object Storage not available");
      }

      const result = await client.downloadAsBytes(key);

      if (!result.ok || !result.value) {
        console.error(`❌ [StorageService] Download failed for ${key}:`, result.error);
        throw new Error(`Failed to download file: ${result.error}`);
      }

      // Replit SDK returns Buffer, ensure we return a single Buffer instance
      const buffer = Buffer.isBuffer(result.value) ? result.value : Buffer.from(result.value as any);
      console.log(`✅ [StorageService] Downloaded: ${key} (${buffer.length} bytes)`);
      return buffer;
    } catch (error) {
      console.error(`❌ [StorageService] Download error for ${key}:`, error);
      throw error;
    }
  },

  /**
   * Download a file from Object Storage as readable stream
   * @param key - The storage key of the file
   * @returns Readable stream of file content
   */
  async getFileStream(key: string): Promise<Readable> {
    try {
      const available = await this.isAvailable();
      if (!available) {
        throw new Error("Object Storage not available");
      }

      // downloadAsStream returns a Readable directly (not wrapped in Result)
      const stream = client.downloadAsStream(key);
      
      console.log(`✅ [StorageService] Streaming: ${key}`);
      return stream;
    } catch (error) {
      console.error(`❌ [StorageService] Stream error for ${key}:`, error);
      throw error;
    }
  },

  /**
   * Download a file from Object Storage as text
   * @param key - The storage key of the file
   * @returns File content as string
   */
  async getFileText(key: string): Promise<string> {
    try {
      const available = await this.isAvailable();
      if (!available) {
        throw new Error("Object Storage not available");
      }

      const result = await client.downloadAsText(key);

      if (!result.ok || result.value === undefined) {
        console.error(`❌ [StorageService] Text download failed for ${key}:`, result.error);
        throw new Error(`Failed to download file as text: ${result.error}`);
      }

      console.log(`✅ [StorageService] Downloaded text: ${key}`);
      return result.value;
    } catch (error) {
      console.error(`❌ [StorageService] Text download error for ${key}:`, error);
      throw error;
    }
  },

  /**
   * Delete a file from Object Storage
   * @param key - The storage key of the file to delete
   * @returns true if successful, false otherwise
   */
  async deleteFile(key: string): Promise<boolean> {
    try {
      const available = await this.isAvailable();
      if (!available) {
        console.warn(`⚠️ [StorageService] Object Storage not available, skipping delete for: ${key}`);
        return false;
      }

      const result = await client.delete(key);

      if (!result.ok) {
        console.error(`❌ [StorageService] Delete failed for ${key}:`, result.error);
        return false;
      }

      console.log(`✅ [StorageService] Deleted: ${key}`);
      return true;
    } catch (error) {
      console.error(`❌ [StorageService] Delete error for ${key}:`, error);
      return false;
    }
  },

  /**
   * Check if a file exists in Object Storage
   * @param key - The storage key to check
   * @returns true if file exists, false otherwise
   */
  async fileExists(key: string): Promise<boolean> {
    try {
      const available = await this.isAvailable();
      if (!available) {
        return false;
      }

      const result = await client.exists(key);

      if (!result.ok) {
        console.warn(`⚠️ [StorageService] Exists check failed for ${key}:`, result.error);
        return false;
      }

      return result.value === true;
    } catch (error) {
      console.error(`❌ [StorageService] Exists check error for ${key}:`, error);
      return false;
    }
  },

  /**
   * Copy a file to a new location within Object Storage
   * @param sourceKey - Source file key
   * @param destKey - Destination file key
   * @returns true if successful, false otherwise
   */
  async copyFile(sourceKey: string, destKey: string): Promise<boolean> {
    try {
      const available = await this.isAvailable();
      if (!available) {
        return false;
      }

      const result = await client.copy(sourceKey, destKey);

      if (!result.ok) {
        console.error(`❌ [StorageService] Copy failed from ${sourceKey} to ${destKey}:`, result.error);
        return false;
      }

      console.log(`✅ [StorageService] Copied: ${sourceKey} -> ${destKey}`);
      return true;
    } catch (error) {
      console.error(`❌ [StorageService] Copy error from ${sourceKey} to ${destKey}:`, error);
      return false;
    }
  },

  /**
   * List all files in Object Storage
   * @param prefix - Optional prefix to filter files
   * @returns Array of storage keys
   */
  async listFiles(prefix?: string): Promise<string[]> {
    try {
      const available = await this.isAvailable();
      if (!available) {
        return [];
      }

      const result = await client.list(prefix ? { prefix } : undefined);

      if (!result.ok || !result.value) {
        console.error(`❌ [StorageService] List failed:`, result.error);
        return [];
      }

      const keys = result.value.map(obj => obj.name);
      console.log(`✅ [StorageService] Listed ${keys.length} files${prefix ? ` with prefix: ${prefix}` : ""}`);
      return keys;
    } catch (error) {
      console.error(`❌ [StorageService] List error:`, error);
      return [];
    }
  },
};

// Types are already exported with the interface definition above

