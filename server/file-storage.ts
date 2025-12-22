import { 
  files, 
  fileVersions, 
  filePermissions, 
  fileInteractions,
  type File, 
  type InsertFile, 
  type UpdateFile, 
  type FileVersion, 
  type FilePermission,
  type ShareFile,
  type InsertFileInteraction
} from "@shared/schema";
import { eq, desc, and, or, like, sql, isNull } from "drizzle-orm";
import { db } from "./db";
import { randomBytes } from "crypto";

export interface FileStorageService {
  // Core file operations
  uploadFile(userId: number, fileData: {
    name: string;
    originalName: string;
    mimeType: string;
    content: Buffer | string;
    size: number;
    folder?: string;
    description?: string;
    tags?: string[];
  }): Promise<File>;
  
  getFile(fileId: number, userId: number): Promise<File | null>;
  getFileContent(fileId: number, userId: number): Promise<{ content: string; mimeType: string } | null>;
  updateFile(fileId: number, userId: number, updates: UpdateFile): Promise<File | null>;
  deleteFile(fileId: number, userId: number): Promise<boolean>;
  
  // File listing and search
  listUserFiles(userId: number, options?: {
    folder?: string;
    search?: string;
    tags?: string[];
    mimeType?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ files: File[]; total: number }>;
  
  // Version control
  createFileVersion(fileId: number, userId: number, content: Buffer | string, changeDescription?: string): Promise<FileVersion>;
  getFileVersions(fileId: number, userId: number): Promise<FileVersion[]>;
  restoreFileVersion(fileId: number, versionId: number, userId: number): Promise<File | null>;
  
  // File sharing and permissions
  shareFile(fileId: number, ownerId: number, shareData: ShareFile): Promise<FilePermission>;
  getFilePermissions(fileId: number, userId: number): Promise<FilePermission[]>;
  checkFileAccess(fileId: number, userId: number, requiredPermission?: 'read' | 'write' | 'admin'): Promise<boolean>;
  
  // Analytics and interactions
  logFileInteraction(fileId: number, userId: number, interaction: InsertFileInteraction): Promise<void>;
  getFileAnalytics(fileId: number, userId: number): Promise<any>;
  
  // AI Integration
  analyzeFileWithAI(fileId: number, userId: number): Promise<any>;
  updateFileAnalysis(fileId: number, analysis: any): Promise<File | null>;
}

export class DatabaseFileStorage implements FileStorageService {
  
  async uploadFile(userId: number, fileData: {
    name: string;
    originalName: string;
    mimeType: string;
    content: Buffer | string;
    size: number;
    folder?: string;
    description?: string;
    tags?: string[];
  }): Promise<File> {
    try {
      // Convert content to base64 if it's a Buffer
      let contentString: string;
      let encoding = 'utf-8';
      
      if (Buffer.isBuffer(fileData.content)) {
        if (fileData.mimeType.startsWith('text/') || fileData.mimeType === 'application/json') {
          contentString = fileData.content.toString('utf-8');
        } else {
          contentString = fileData.content.toString('base64');
          encoding = 'base64';
        }
      } else {
        contentString = fileData.content;
      }
      
      const newFile = {
        userId,
        name: fileData.name,
        originalName: fileData.originalName,
        mimeType: fileData.mimeType,
        content: contentString,
        encoding,
        size: fileData.size,
        folder: fileData.folder || '/',
        description: fileData.description || null,
        tags: fileData.tags || [],
        analysisStatus: 'pending',
        status: 'active',
        currentVersion: 1,
      };
      
      const result = await db.insert(files).values(newFile).returning();
      const file = result[0];
      
      // Create initial version
      await this.createFileVersion(file.id, userId, fileData.content, 'Initial upload');
      
      // Log upload interaction
      await this.logFileInteraction(file.id, userId, {
        interactionType: 'edit',
        details: { action: 'upload', originalName: fileData.originalName }
      });
      
      return file;
    } catch (error) {
      console.error("Error uploading file:", error);
      throw error;
    }
  }
  
  async getFile(fileId: number, userId: number): Promise<File | null> {
    try {
      // Check access first
      const hasAccess = await this.checkFileAccess(fileId, userId, 'read');
      if (!hasAccess) {
        return null;
      }
      
      const result = await db.select().from(files).where(eq(files.id, fileId));
      const file = result[0];
      
      if (file) {
        // Update last accessed time
        await db.update(files)
          .set({ lastAccessedAt: new Date() })
          .where(eq(files.id, fileId));
        
        // Log view interaction
        await this.logFileInteraction(fileId, userId, {
          interactionType: 'view',
          details: { timestamp: new Date().toISOString() }
        });
      }
      
      return file || null;
    } catch (error) {
      console.error("Error getting file:", error);
      return null;
    }
  }
  
  async getFileContent(fileId: number, userId: number): Promise<{ content: string; mimeType: string } | null> {
    try {
      const file = await this.getFile(fileId, userId);
      if (!file || !file.content) {
        return null;
      }
      
      return {
        content: file.content,
        mimeType: file.mimeType
      };
    } catch (error) {
      console.error("Error getting file content:", error);
      return null;
    }
  }
  
  async updateFile(fileId: number, userId: number, updates: UpdateFile): Promise<File | null> {
    try {
      // Check write access
      const hasAccess = await this.checkFileAccess(fileId, userId, 'write');
      if (!hasAccess) {
        return null;
      }
      
      const result = await db
        .update(files)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(files.id, fileId))
        .returning();
      
      if (result[0]) {
        // Log update interaction
        await this.logFileInteraction(fileId, userId, {
          interactionType: 'edit',
          details: { action: 'update', changes: Object.keys(updates) }
        });
      }
      
      return result[0] || null;
    } catch (error) {
      console.error("Error updating file:", error);
      return null;
    }
  }
  
  async deleteFile(fileId: number, userId: number): Promise<boolean> {
    try {
      // Check admin access or ownership
      const hasAccess = await this.checkFileAccess(fileId, userId, 'admin');
      if (!hasAccess) {
        return false;
      }
      
      // Soft delete by updating status
      const result = await db
        .update(files)
        .set({ 
          status: 'deleted',
          updatedAt: new Date()
        })
        .where(eq(files.id, fileId))
        .returning();
      
      if (result[0]) {
        // Log delete interaction
        await this.logFileInteraction(fileId, userId, {
          interactionType: 'delete',
          details: { action: 'soft_delete', timestamp: new Date().toISOString() }
        });
      }
      
      return result.length > 0;
    } catch (error) {
      console.error("Error deleting file:", error);
      return false;
    }
  }
  
  async listUserFiles(userId: number, options?: {
    folder?: string;
    search?: string;
    tags?: string[];
    mimeType?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ files: File[]; total: number }> {
    try {
      const limit = options?.limit || 50;
      const offset = options?.offset || 0;
      
      // Build dynamic where conditions
      const conditions = [
        eq(files.status, 'active'),
        or(
          eq(files.userId, userId),
          // Include files shared with the user
          sql`EXISTS (
            SELECT 1 FROM ${filePermissions} fp 
            WHERE fp.file_id = ${files.id} 
            AND fp.user_id = ${userId}
          )`
        )
      ];
      
      if (options?.folder) {
        conditions.push(eq(files.folder, options.folder));
      }
      
      if (options?.search) {
        conditions.push(
          or(
            like(files.name, `%${options.search}%`),
            like(files.description, `%${options.search}%`)
          )
        );
      }
      
      if (options?.mimeType) {
        conditions.push(like(files.mimeType, `${options.mimeType}%`));
      }
      
      if (options?.tags && options.tags.length > 0) {
        conditions.push(
          sql`${files.tags} @> ${JSON.stringify(options.tags)}`
        );
      }
      
      const whereClause = and(...conditions);
      
      // Get total count
      const countResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(files)
        .where(whereClause);
      
      const total = countResult[0]?.count || 0;
      
      // Get files
      const fileResults = await db
        .select()
        .from(files)
        .where(whereClause)
        .orderBy(desc(files.updatedAt))
        .limit(limit)
        .offset(offset);
      
      return { files: fileResults, total };
    } catch (error) {
      console.error("Error listing files:", error);
      return { files: [], total: 0 };
    }
  }
  
  async createFileVersion(fileId: number, userId: number, content: Buffer | string, changeDescription?: string): Promise<FileVersion> {
    try {
      // Get current version number
      const currentFile = await db.select().from(files).where(eq(files.id, fileId));
      if (!currentFile[0]) {
        throw new Error('File not found');
      }
      
      const file = currentFile[0];
      const nextVersion = (file.currentVersion || 0) + 1;
      
      // Convert content to string
      let contentString: string;
      if (Buffer.isBuffer(content)) {
        if (currentFile[0].mimeType.startsWith('text/') || currentFile[0].mimeType === 'application/json') {
          contentString = content.toString('utf-8');
        } else {
          contentString = content.toString('base64');
        }
      } else {
        contentString = content;
      }
      
      const versionData = {
        fileId,
        versionNumber: nextVersion,
        content: contentString,
        size: Buffer.byteLength(contentString, 'utf-8'),
        changeDescription: changeDescription || `Version ${nextVersion}`,
        changeType: 'update',
        createdBy: userId,
      };
      
      const result = await db.insert(fileVersions).values(versionData).returning();
      
      // Update file's current version
      await db
        .update(files)
        .set({ 
          currentVersion: nextVersion,
          content: contentString,
          size: versionData.size,
          updatedAt: new Date()
        })
        .where(eq(files.id, fileId));
      
      return result[0];
    } catch (error) {
      console.error("Error creating file version:", error);
      throw error;
    }
  }
  
  async getFileVersions(fileId: number, userId: number): Promise<FileVersion[]> {
    try {
      const hasAccess = await this.checkFileAccess(fileId, userId, 'read');
      if (!hasAccess) {
        return [];
      }
      
      const result = await db
        .select()
        .from(fileVersions)
        .where(eq(fileVersions.fileId, fileId))
        .orderBy(desc(fileVersions.versionNumber));
      
      return result;
    } catch (error) {
      console.error("Error getting file versions:", error);
      return [];
    }
  }
  
  async restoreFileVersion(fileId: number, versionId: number, userId: number): Promise<File | null> {
    try {
      const hasAccess = await this.checkFileAccess(fileId, userId, 'write');
      if (!hasAccess) {
        return null;
      }
      
      // Get the version to restore
      const versionResult = await db
        .select()
        .from(fileVersions)
        .where(
          and(
            eq(fileVersions.id, versionId),
            eq(fileVersions.fileId, fileId)
          )
        );
      
      if (!versionResult[0]) {
        return null;
      }
      
      const version = versionResult[0];
      
      // Create new version with restored content
      await this.createFileVersion(
        fileId, 
        userId, 
        version.content, 
        `Restored from version ${version.versionNumber}`
      );
      
      // Log restore interaction
      await this.logFileInteraction(fileId, userId, {
        interactionType: 'edit',
        details: { 
          action: 'restore',
          restoredFromVersion: version.versionNumber
        }
      });
      
      // Return updated file
      return await this.getFile(fileId, userId);
    } catch (error) {
      console.error("Error restoring file version:", error);
      return null;
    }
  }
  
  async shareFile(fileId: number, ownerId: number, shareData: ShareFile): Promise<FilePermission> {
    try {
      const hasAccess = await this.checkFileAccess(fileId, ownerId, 'admin');
      if (!hasAccess) {
        throw new Error('Insufficient permissions to share file');
      }
      
      const shareToken = randomBytes(32).toString('hex');
      const shareExpiry = shareData.shareExpiry ? new Date(shareData.shareExpiry) : null;
      
      const permissionData = {
        fileId,
        userId: shareData.userId || null,
        permission: shareData.permission,
        sharedBy: ownerId,
        shareToken,
        shareExpiry,
      };
      
      const result = await db.insert(filePermissions).values(permissionData).returning();
      
      // Log share interaction
      await this.logFileInteraction(fileId, ownerId, {
        interactionType: 'share',
        details: {
          sharedWith: shareData.userId || 'public',
          permission: shareData.permission,
          shareToken: shareToken
        }
      });
      
      return result[0];
    } catch (error) {
      console.error("Error sharing file:", error);
      throw error;
    }
  }
  
  async getFilePermissions(fileId: number, userId: number): Promise<FilePermission[]> {
    try {
      const hasAccess = await this.checkFileAccess(fileId, userId, 'read');
      if (!hasAccess) {
        return [];
      }
      
      const result = await db
        .select()
        .from(filePermissions)
        .where(eq(filePermissions.fileId, fileId))
        .orderBy(desc(filePermissions.createdAt));
      
      return result;
    } catch (error) {
      console.error("Error getting file permissions:", error);
      return [];
    }
  }
  
  async checkFileAccess(fileId: number, userId: number, requiredPermission: 'read' | 'write' | 'admin' = 'read'): Promise<boolean> {
    try {
      // Get file to check ownership
      const fileResult = await db.select().from(files).where(eq(files.id, fileId));
      if (!fileResult[0]) {
        return false;
      }
      
      const file = fileResult[0];
      
      // Owner has all permissions
      if (file.userId === userId) {
        return true;
      }
      
      // Check if file is public for read access
      if (requiredPermission === 'read' && file.isPublic) {
        return true;
      }
      
      // Check explicit permissions
      const permissionResult = await db
        .select()
        .from(filePermissions)
        .where(
          and(
            eq(filePermissions.fileId, fileId),
            eq(filePermissions.userId, userId),
            or(
              isNull(filePermissions.shareExpiry),
              sql`${filePermissions.shareExpiry} > NOW()`
            )
          )
        );
      
      if (!permissionResult[0]) {
        return false;
      }
      
      const permission = permissionResult[0].permission;
      
      // Check permission hierarchy: owner > admin > write > read
      const permissionLevels = {
        'read': 1,
        'write': 2,
        'admin': 3,
        'owner': 4
      };
      
      const userLevel = permissionLevels[permission as keyof typeof permissionLevels] || 0;
      const requiredLevel = permissionLevels[requiredPermission] || 0;
      
      return userLevel >= requiredLevel;
    } catch (error) {
      console.error("Error checking file access:", error);
      return false;
    }
  }
  
  async logFileInteraction(fileId: number, userId: number, interaction: InsertFileInteraction): Promise<void> {
    try {
      const interactionData = {
        fileId,
        userId,
        ...interaction,
        createdAt: new Date()
      };
      
      await db.insert(fileInteractions).values(interactionData);
    } catch (error) {
      console.error("Error logging file interaction:", error);
      // Don't throw - logging failures shouldn't break the main flow
    }
  }
  
  async getFileAnalytics(fileId: number, userId: number): Promise<any> {
    try {
      const hasAccess = await this.checkFileAccess(fileId, userId, 'read');
      if (!hasAccess) {
        return null;
      }
      
      // Get interaction statistics
      const interactionStats = await db
        .select({
          interactionType: fileInteractions.interactionType,
          count: sql<number>`count(*)`,
          lastInteraction: sql<Date>`max(${fileInteractions.createdAt})`
        })
        .from(fileInteractions)
        .where(eq(fileInteractions.fileId, fileId))
        .groupBy(fileInteractions.interactionType);
      
      // Get version count
      const versionCount = await db
        .select({ count: sql<number>`count(*)` })
        .from(fileVersions)
        .where(eq(fileVersions.fileId, fileId));
      
      return {
        interactions: interactionStats,
        totalVersions: versionCount[0]?.count || 0,
        lastActivity: interactionStats.reduce((latest, stat) => {
          return !latest || stat.lastInteraction > latest 
            ? stat.lastInteraction 
            : latest;
        }, null as Date | null)
      };
    } catch (error) {
      console.error("Error getting file analytics:", error);
      return null;
    }
  }
  
  async analyzeFileWithAI(fileId: number, userId: number): Promise<any> {
    try {
      const hasAccess = await this.checkFileAccess(fileId, userId, 'read');
      if (!hasAccess) {
        throw new Error('Insufficient permissions');
      }
      
      const file = await this.getFile(fileId, userId);
      if (!file || !file.content) {
        throw new Error('File not found or empty');
      }
      
      // Update analysis status
      await db
        .update(files)
        .set({ analysisStatus: 'analyzing' })
        .where(eq(files.id, fileId));
      
      // Import Azure AI service dynamically to avoid circular dependencies
      const { createAzureAIClient, extractAzureAIError, parseAzureAIJSON } = await import('./services/aiService');
      const { client, config } = createAzureAIClient();
      
      // Determine analysis type based on file type and content size
      let analysisPrompt = '';
      let fileContent = file.content;
      
      // Limit content size to prevent token limit issues (roughly 4000 characters)
      const maxContentLength = 4000;
      if (fileContent.length > maxContentLength) {
        fileContent = fileContent.substring(0, maxContentLength) + '\n\n[Content truncated due to length]';
      }
      
      if (file.encoding === 'base64' && !file.mimeType.startsWith('text/')) {
        // For binary files, analyze metadata only
        analysisPrompt = `Analyze this file based on its metadata:

File Name: ${file.name}
Original Name: ${file.originalName}
MIME Type: ${file.mimeType}
Size: ${file.size} bytes
Description: ${file.description || 'No description'}
Tags: ${file.tags?.join(', ') || 'No tags'}

Provide insights about the file type, potential use cases, and any security considerations.

IMPORTANT: You must respond with ONLY valid JSON in this exact format:
{
  "summary": "Brief description of the file and its purpose",
  "quality": "excellent|good|fair|poor",
  "complexity": "low|medium|high",
  "improvements": ["suggestion1", "suggestion2"],
  "security": "Security assessment and recommendations",
  "confidence": "high|medium|low"
}

Do not include any text before or after the JSON. Ensure all string values are properly quoted.`;
        fileContent = ''; // Don't send binary content to AI
      } else {
        // For text files, analyze content
        analysisPrompt = `Analyze this ${file.mimeType} file:

File Name: ${file.name}
Content:
${fileContent}

Provide a comprehensive analysis including:
- Content summary
- Code quality assessment (if applicable)
- Potential improvements
- Security considerations
- Complexity assessment

IMPORTANT: You must respond with ONLY valid JSON in this exact format:
{
  "summary": "Comprehensive summary of the file content and purpose",
  "quality": "excellent|good|fair|poor",
  "complexity": "low|medium|high",
  "improvements": ["specific improvement suggestion 1", "specific improvement suggestion 2"],
  "security": "Detailed security assessment and recommendations",
  "confidence": "high|medium|low"
}

For quality assessment:
- "excellent": Well-structured, follows best practices, clean code
- "good": Generally well-written with minor issues
- "fair": Has some issues but functional
- "poor": Significant problems, needs major improvements

For complexity assessment:
- "low": Simple, straightforward code/content
- "medium": Moderate complexity, some advanced features
- "high": Complex logic, advanced patterns, difficult to understand

Do not include any text before or after the JSON. Ensure all string values are properly quoted.`;
      }
      
      console.log(`Analyzing file ${fileId} with Azure AI...`);
      
      const response = await client.path("/chat/completions").post({
        body: {
          messages: [
            {
              role: "system",
              content: "You are an expert file analyzer and code reviewer. Provide thorough, actionable insights about files. You MUST respond with ONLY valid JSON in the exact format specified by the user. Do not include any explanatory text, markdown formatting, or content outside the JSON object. Ensure all JSON is properly formatted with correct quotes, commas, and brackets."
            },
            {
              role: "user",
              content: analysisPrompt
            }
          ],
          max_tokens: 2048,
          temperature: 0.1, // Lower temperature for more consistent JSON output
          model: config.modelName,
          stream: false,
          response_format: { type: "json_object" } // Enforce JSON response format
        },
      });
      
      console.log(`Azure AI response status: ${response.status}`);
      
      // Check for successful response (2xx status codes)
      if (response.status < 200 || response.status >= 300) {
        const errorDetails = response.body?.error || response.body || 'Unknown error';
        console.error('Azure AI API error response:', errorDetails);
        throw new Error(`Azure AI API error: ${extractAzureAIError(errorDetails)}`);
      }
      
      // Extract response content
      const responseBody = response.body;
      if (!responseBody || !responseBody.choices || !responseBody.choices[0]) {
        throw new Error('Invalid response structure from Azure AI API');
      }
      
      const aiResponse = responseBody.choices[0].message?.content || "";
      console.log(`Azure AI response content length: ${aiResponse.length}`);
      
      if (!aiResponse.trim()) {
        throw new Error('Empty response from Azure AI API');
      }
      
      // Parse the AI response
      let analysis = parseAzureAIJSON(aiResponse);
      
      if (!analysis) {
        console.warn('Failed to parse Azure AI response as JSON. Response preview:', aiResponse.substring(0, 300));
        console.warn('Full AI response for debugging:', aiResponse);
        
        // Enhanced fallback analysis with meaningful values
        analysis = {
          summary: aiResponse.substring(0, 500) + (aiResponse.length > 500 ? '...' : ''),
          analysisType: 'basic',
          confidence: 'low',
          error: 'Failed to parse AI response as JSON',
          rawResponse: aiResponse.substring(0, 1000), // Store first 1000 chars for debugging
          // Provide intelligent fallback values based on response content
          quality: this.inferQualityFromResponse(aiResponse),
          complexity: this.inferComplexityFromResponse(aiResponse),
          improvements: this.extractImprovementsFromResponse(aiResponse),
          security: this.extractSecurityFromResponse(aiResponse)
        };
      }
      
      // Validate and normalize the parsed analysis
      analysis = this.validateAndNormalizeAnalysis(analysis, aiResponse);
      
      // Ensure analysis has required fields
      analysis = {
        summary: analysis.summary || 'Analysis completed',
        quality: analysis.quality || 'unknown',
        improvements: analysis.improvements || [],
        security: analysis.security || 'No security issues identified',
        complexity: analysis.complexity || 'unknown',
        analysisType: analysis.analysisType || 'ai_analysis',
        confidence: analysis.confidence || 'medium',
        ...analysis
      };
      
      // Add metadata to analysis
      analysis.analyzedAt = new Date().toISOString();
      analysis.fileMetadata = {
        name: file.name,
        mimeType: file.mimeType,
        size: file.size,
        encoding: file.encoding
      };
      
      console.log(`Analysis completed for file ${fileId}:`, {
        summary: analysis.summary?.substring(0, 100) + '...',
        complexity: analysis.complexity,
        confidence: analysis.confidence
      });
      
      // Update file with analysis results
      await this.updateFileAnalysis(fileId, analysis);
      
      // Log analysis interaction
      await this.logFileInteraction(fileId, userId, {
        interactionType: 'analyze',
        details: { 
          analysisType: 'ai_analysis', 
          success: true, 
          analysisId: `analysis_${fileId}_${Date.now()}`,
          model: config.modelName
        }
      });
      
      return analysis;
    } catch (error) {
      console.error("Error analyzing file with AI:", error);
      
      // Update analysis status to failed
      await db
        .update(files)
        .set({ analysisStatus: 'failed' })
        .where(eq(files.id, fileId));
      
      // Log failed analysis
      await this.logFileInteraction(fileId, userId, {
        interactionType: 'analyze',
        details: { 
          analysisType: 'ai_analysis', 
          success: false, 
          error: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString()
        }
      });
      
      throw error;
    }
  }
  
  async updateFileAnalysis(fileId: number, analysis: any): Promise<File | null> {
    try {
      const result = await db
        .update(files)
        .set({
          aiAnalysis: analysis,
          analysisStatus: 'completed',
          analyzedAt: new Date(),
          updatedAt: new Date()
        })
        .where(eq(files.id, fileId))
        .returning();
      
      return result[0] || null;
    } catch (error) {
      console.error("Error updating file analysis:", error);
      return null;
    }
  }

  private inferQualityFromResponse(response: string): string {
    const lowerResponse = response.toLowerCase();
    if (lowerResponse.includes('excellent') || lowerResponse.includes('well-structured') || lowerResponse.includes('clean code')) {
      return 'excellent';
    }
    if (lowerResponse.includes('good') || lowerResponse.includes('generally well-written') || lowerResponse.includes('minor issues')) {
      return 'good';
    }
    if (lowerResponse.includes('fair') || lowerResponse.includes('some issues') || lowerResponse.includes('functional')) {
      return 'fair';
    }
    if (lowerResponse.includes('poor') || lowerResponse.includes('significant problems') || lowerResponse.includes('needs major improvements')) {
      return 'poor';
    }
    return 'unknown';
  }

  private inferComplexityFromResponse(response: string): string {
    const lowerResponse = response.toLowerCase();
    if (lowerResponse.includes('low') || lowerResponse.includes('simple') || lowerResponse.includes('straightforward')) {
      return 'low';
    }
    if (lowerResponse.includes('medium') || lowerResponse.includes('moderate complexity') || lowerResponse.includes('some advanced features')) {
      return 'medium';
    }
    if (lowerResponse.includes('high') || lowerResponse.includes('complex logic') || lowerResponse.includes('advanced patterns') || lowerResponse.includes('difficult to understand')) {
      return 'high';
    }
    return 'unknown';
  }

  private extractImprovementsFromResponse(response: string): string[] {
    const improvements: string[] = [];
    const lowerResponse = response.toLowerCase();

    // Look for "improvements" or "suggestions"
    const improvementsMatch = lowerResponse.match(/improvements?:?\s*\[(.*?)\]/);
    if (improvementsMatch && improvementsMatch[1]) {
      const suggestions = improvementsMatch[1].split(',').map(s => s.trim());
      improvements.push(...suggestions);
    }

    // Look for "specific improvement suggestion"
    const specificImprovementsMatch = lowerResponse.match(/specific improvement suggestion\s*(\d+):\s*(.*?)(?=,|$)/g);
    if (specificImprovementsMatch) {
      specificImprovementsMatch.forEach(match => {
        const parts = match.split(':');
        if (parts.length > 1) {
          improvements.push(parts[1].trim());
        }
      });
    }

    // Look for "suggestion"
    const suggestionsMatch = lowerResponse.match(/suggestion\s*(\d+):\s*(.*?)(?=,|$)/g);
    if (suggestionsMatch) {
      suggestionsMatch.forEach(match => {
        const parts = match.split(':');
        if (parts.length > 1) {
          improvements.push(parts[1].trim());
        }
      });
    }

    // Look for "improvement"
    const improvementMatch = lowerResponse.match(/improvement\s*(\d+):\s*(.*?)(?=,|$)/g);
    if (improvementMatch) {
      improvementMatch.forEach(match => {
        const parts = match.split(':');
        if (parts.length > 1) {
          improvements.push(parts[1].trim());
        }
      });
    }

    // Remove duplicates and trim
    return Array.from(new Set(improvements.map((s: string) => s.trim()).filter((s: string) => s)));
  }

  private extractSecurityFromResponse(response: string): string {
    const lowerResponse = response.toLowerCase();
    if (lowerResponse.includes('security assessment') || lowerResponse.includes('recommendations') || lowerResponse.includes('considerations')) {
      return 'Detailed security assessment and recommendations';
    }
    if (lowerResponse.includes('no security issues')) {
      return 'No security issues identified';
    }
    return 'Unknown';
  }

  private validateAndNormalizeAnalysis(analysis: any, rawResponse: string): any {
    // Ensure summary is a string
    analysis.summary = String(analysis.summary || 'Analysis completed');

    // Ensure quality is one of the expected values
    analysis.quality = ['excellent', 'good', 'fair', 'poor', 'unknown'].includes(analysis.quality) ? analysis.quality : 'unknown';

    // Ensure complexity is one of the expected values
    analysis.complexity = ['low', 'medium', 'high', 'unknown'].includes(analysis.complexity) ? analysis.complexity : 'unknown';

    // Ensure confidence is one of the expected values
    analysis.confidence = ['high', 'medium', 'low', 'unknown'].includes(analysis.confidence) ? analysis.confidence : 'medium';

    // Ensure improvements is an array of strings
    analysis.improvements = Array.isArray(analysis.improvements) ? analysis.improvements.map((s: any) => String(s).trim()) : [];

    // Ensure security is a string
    analysis.security = String(analysis.security || 'No security issues identified');

    // Ensure analysisType is a string
    analysis.analysisType = String(analysis.analysisType || 'ai_analysis');

    // Ensure analyzedAt is a string
    analysis.analyzedAt = String(analysis.analyzedAt || new Date().toISOString());

    // Ensure fileMetadata is an object
    analysis.fileMetadata = analysis.fileMetadata || {};

    // Ensure rawResponse is a string
    analysis.rawResponse = String(analysis.rawResponse || rawResponse.substring(0, 1000)); // Fallback to first 1000 chars

    return analysis;
  }
}

// Export singleton instance
export const fileStorage = new DatabaseFileStorage(); 