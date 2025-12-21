// Analysis Controller - Handles UI analysis and code improvement routes
// Clone-UI, create page, improve code, performance analysis, design patterns

import type { Request, Response } from "express";
import { aiService, createAIClient, createAzureAIClient, retryWithBackoff, extractAzureAIError, parseAzureAIJSON } from "../services/aiService";
import { aiCacheService, getCacheKey, getCachedResponse, setCachedResponse } from "../services/aiCacheService";
import { 
  uiGenerationService, 
  generateUICodeWithAI, 
  generatePageWithAI, 
  generatePageFilesWithAI,
  generateFallbackPerformanceAnalysis,
  generateFallbackPatternAnalysis,
  generateFallbackCodeAnalysis
} from "../services/uiGenerationService";
import type { AuthenticatedRequest } from "../types/ai";

/**
 * Analysis Controller - Handles all analysis-related routes
 */
export class AnalysisController {

  /**
   * Clone UI - Analyze and generate code from screenshot/URL
   */
  async cloneUI(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { imageUrl, screenshotBase64, provider = 'gemini' } = req.body;
      
      if (!imageUrl && !screenshotBase64) {
        res.status(400).json({ error: 'Either imageUrl or screenshotBase64 is required' });
        return;
      }

      const { client, config } = createAIClient(provider);
      
      // Build analysis prompt
      const analysisPrompt = `Analyze this UI screenshot and extract:
1. Layout structure (grid, flexbox, sections)
2. Color palette (primary, secondary, accent, background, text colors as hex)
3. Typography (font families, sizes, weights)
4. Components (buttons, cards, forms, navigation, etc.)
5. Spacing patterns
6. Interactive elements

Return as JSON:
{
  "layout": "description",
  "colorPalette": ["#hex1", "#hex2", ...],
  "typography": { "headings": "font", "body": "font" },
  "components": [{ "type": "name", "description": "desc", "styles": {} }],
  "spacing": "description"
}`;

      let analysis;
      
      if (provider === 'gemini') {
        const model = client.getGenerativeModel({ 
          model: config.modelName,
          generationConfig: { temperature: 0.3 }
        });
        
        const imageData = screenshotBase64 || imageUrl;
        const imagePart = {
          inlineData: {
            data: screenshotBase64 || await this.fetchImageAsBase64(imageUrl),
            mimeType: 'image/png'
          }
        };
        
        const result = await model.generateContent([analysisPrompt, imagePart]);
        const response = await result.response;
        analysis = parseAzureAIJSON(response.text());
      } else {
        // For OpenAI
        const response = await client.chat.completions.create({
          model: config.modelName,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: analysisPrompt },
                { type: 'image_url', image_url: { url: imageUrl || `data:image/png;base64,${screenshotBase64}` } }
              ]
            }
          ],
          max_tokens: 2048,
          response_format: { type: 'json_object' }
        });
        analysis = JSON.parse(response.choices[0].message.content || '{}');
      }

      // Generate code from analysis
      const generatedCode = await generateUICodeWithAI(client, config, analysis, provider);

      res.json({
        success: true,
        analysis,
        generatedCode,
        message: "UI analysis and code generation completed"
      });
    } catch (error: any) {
      console.error("Clone UI error:", error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Create page from template
   */
  async createPage(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { template, requirements, style = 'modern' } = req.body;
      
      if (!template || !requirements) {
        res.status(400).json({ error: 'Template and requirements are required' });
        return;
      }

      // Use Azure AI for page generation (requires AzureAIConfig)
      const { client, config } = createAzureAIClient();
      
      // Generate page structure
      const pageStructure = await generatePageWithAI(client, config, template, requirements, style);
      
      // Generate actual files
      const files = await generatePageFilesWithAI(client, config, pageStructure);

      res.json({
        success: true,
        pageStructure,
        files,
        message: `Generated ${files.length} files for ${template} page`
      });
    } catch (error: any) {
      console.error("Create page error:", error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Get page templates
   */
  async getTemplates(req: Request, res: Response): Promise<void> {
    const templates = [
      { id: 'landing', name: 'Landing Page', description: 'Marketing landing page with hero, features, CTA' },
      { id: 'dashboard', name: 'Dashboard', description: 'Admin dashboard with charts, tables, metrics' },
      { id: 'portfolio', name: 'Portfolio', description: 'Personal portfolio with projects, skills, contact' },
      { id: 'blog', name: 'Blog', description: 'Blog with posts list, categories, search' },
      { id: 'ecommerce', name: 'E-Commerce', description: 'Product listing, cart, checkout flow' }
    ];
    
    res.json({ success: true, templates });
  }

  /**
   * Analyze and improve code
   */
  async improveCode(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { code, focusAreas = ['performance', 'accessibility', 'maintainability'], provider = 'azure' } = req.body;
      
      if (!code) {
        res.status(400).json({ error: 'Code is required' });
        return;
      }

      // Check cache
      const cacheKey = getCacheKey(`improve-${code.substring(0, 200)}`, provider, { focusAreas });
      const cached = getCachedResponse(cacheKey);
      if (cached) {
        res.json({ success: true, ...cached, fromCache: true });
        return;
      }

      const { client, config } = createAIClient(provider);
      
      const analysisPrompt = `Analyze this code and provide improvements:

\`\`\`
${code}
\`\`\`

Focus areas: ${focusAreas.join(', ')}

Return JSON:
{
  "improvements": [
    {
      "type": "performance|accessibility|security|maintainability",
      "description": "issue description",
      "severity": "low|medium|high|critical",
      "line": "line number or range",
      "suggestion": "improved code or suggestion"
    }
  ],
  "optimizedCode": "the improved version of the code"
}`;

      let result;
      
      if (provider === 'gemini') {
        const model = client.getGenerativeModel({ 
          model: config.modelName,
          generationConfig: { temperature: 0.2, responseMimeType: 'application/json' }
        });
        const genResult = await model.generateContent(analysisPrompt);
        result = JSON.parse(genResult.response.text());
      } else if (provider === 'azure' || provider === 'azureai') {
        const response = await retryWithBackoff(async () => {
          return await client.path("/chat/completions").post({
            body: {
              messages: [{ role: 'user', content: analysisPrompt }],
              max_tokens: 4096,
              temperature: 0.2,
              model: config.modelName,
              response_format: { type: 'json_object' }
            }
          });
        }, config.maxRetries, config.retryDelay);
        
        if (response.status !== "200") {
          throw new Error(`Azure AI error: ${response.status}`);
        }
        result = parseAzureAIJSON(response.body.choices[0]?.message?.content || '');
      } else {
        const response = await client.chat.completions.create({
          model: config.modelName,
          messages: [{ role: 'user', content: analysisPrompt }],
          temperature: 0.2,
          response_format: { type: 'json_object' }
        });
        result = JSON.parse(response.choices[0].message.content || '{}');
      }

      if (!result || !result.improvements) {
        result = generateFallbackCodeAnalysis(code);
      }

      // Cache result
      setCachedResponse(cacheKey, result, 60);

      res.json({
        success: true,
        ...result
      });
    } catch (error: any) {
      console.error("Improve code error:", error);
      const fallback = generateFallbackCodeAnalysis(req.body.code || '');
      res.json({
        success: true,
        ...fallback,
        _fallback: true
      });
    }
  }

  /**
   * Analyze performance
   */
  async analyzePerformance(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { projectPath, metrics = ['loadTime', 'bundleSize', 'renderPerformance'], provider = 'azure' } = req.body;
      
      // Check cache
      const cacheKey = getCacheKey(`perf-${projectPath}`, provider, { metrics });
      const cached = getCachedResponse(cacheKey);
      if (cached) {
        res.json({ success: true, ...cached, fromCache: true });
        return;
      }

      const { client, config } = createAIClient(provider);
      
      const analysisPrompt = `Analyze performance for a React/TypeScript project.
Project path: ${projectPath}
Metrics to analyze: ${metrics.join(', ')}

Provide realistic performance metrics and optimization suggestions.

Return JSON with performanceMetrics, optimizationSuggestions, codeQualityMetrics, securityAssessment, and overallScore.`;

      let result;
      
      try {
        if (provider === 'azure' || provider === 'azureai') {
          const response = await retryWithBackoff(async () => {
            return await client.path("/chat/completions").post({
              body: {
                messages: [{ role: 'user', content: analysisPrompt }],
                max_tokens: 3072,
                temperature: 0.3,
                model: config.modelName,
                response_format: { type: 'json_object' }
              }
            });
          }, config.maxRetries, config.retryDelay);
          
          if (response.status !== "200") {
            throw new Error(`Azure AI error: ${response.status}`);
          }
          result = parseAzureAIJSON(response.body.choices[0]?.message?.content || '');
        } else {
          const model = client.getGenerativeModel?.({ 
            model: config.modelName,
            generationConfig: { temperature: 0.3, responseMimeType: 'application/json' }
          });
          
          if (model) {
            const genResult = await model.generateContent(analysisPrompt);
            result = JSON.parse(genResult.response.text());
          }
        }
      } catch (aiError) {
        console.warn('AI analysis failed, using fallback:', aiError);
      }

      if (!result || !result.performanceMetrics) {
        result = generateFallbackPerformanceAnalysis();
      }

      // Cache result
      setCachedResponse(cacheKey, result, 120);

      res.json({
        success: true,
        ...result
      });
    } catch (error: any) {
      console.error("Performance analysis error:", error);
      res.json({
        success: true,
        ...generateFallbackPerformanceAnalysis(),
        _fallback: true
      });
    }
  }

  /**
   * Analyze design patterns
   */
  async analyzeDesignPatterns(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { codebase, provider = 'azure' } = req.body;
      
      // Check cache
      const cacheKey = getCacheKey(`patterns-${(codebase || '').substring(0, 100)}`, provider, {});
      const cached = getCachedResponse(cacheKey);
      if (cached) {
        res.json({ success: true, ...cached, fromCache: true });
        return;
      }

      let result;
      
      try {
        const { client, config } = createAIClient(provider);
        
        const analysisPrompt = `Analyze the design patterns used in this codebase:

${codebase?.substring(0, 5000) || 'No code provided'}

Identify:
1. React patterns used (hooks, HOCs, render props, etc.)
2. State management patterns
3. Component composition patterns
4. Anti-patterns to avoid

Return JSON:
{
  "detected": [{ "name": "pattern name", "usage": "percentage", "recommendation": "advice" }],
  "antiPatterns": [{ "name": "pattern name", "instances": count, "severity": "low|medium|high" }]
}`;

        if (provider === 'azure' || provider === 'azureai') {
          const response = await retryWithBackoff(async () => {
            return await client.path("/chat/completions").post({
              body: {
                messages: [{ role: 'user', content: analysisPrompt }],
                max_tokens: 2048,
                temperature: 0.3,
                model: config.modelName,
                response_format: { type: 'json_object' }
              }
            });
          }, config.maxRetries, config.retryDelay);
          
          if (response.status === "200") {
            result = parseAzureAIJSON(response.body.choices[0]?.message?.content || '');
          }
        }
      } catch (aiError) {
        console.warn('AI pattern analysis failed:', aiError);
      }

      if (!result || !result.detected) {
        result = generateFallbackPatternAnalysis();
      }

      // Cache result
      setCachedResponse(cacheKey, result, 120);

      res.json({
        success: true,
        ...result
      });
    } catch (error: any) {
      console.error("Design patterns analysis error:", error);
      res.json({
        success: true,
        ...generateFallbackPatternAnalysis(),
        _fallback: true
      });
    }
  }

  /**
   * Get model capabilities
   */
  async getModelCapabilities(req: Request, res: Response): Promise<void> {
    const { modelId } = req.params;
    
    const capabilities: Record<string, any> = {
      'gemini-2.5-flash': {
        name: 'Gemini 2.5 Flash',
        provider: 'google',
        capabilities: ['text', 'code', 'vision', 'reasoning'],
        contextWindow: 1000000,
        maxOutput: 8192,
        strengths: ['Speed', 'Multimodal', 'Large context']
      },
      'gpt-4o-mini': {
        name: 'GPT-4o Mini',
        provider: 'openai',
        capabilities: ['text', 'code', 'vision', 'function_calling'],
        contextWindow: 128000,
        maxOutput: 16384,
        strengths: ['Accuracy', 'Function calling', 'JSON mode']
      },
      'nomadic-icdu-v8': {
        name: 'Nomadic ICDU v8',
        provider: 'lmstudio',
        capabilities: ['text', 'code', 'reasoning'],
        contextWindow: 32768,
        maxOutput: 4096,
        strengths: ['Local inference', 'Privacy', 'No API costs']
      }
    };

    const model = capabilities[modelId] || {
      name: modelId,
      provider: 'unknown',
      capabilities: ['text'],
      contextWindow: 4096,
      maxOutput: 2048,
      strengths: []
    };

    res.json({ success: true, model });
  }

  /**
   * Helper to fetch image as base64
   */
  private async fetchImageAsBase64(url: string): Promise<string> {
    const response = await fetch(url);
    const buffer = await response.arrayBuffer();
    return Buffer.from(buffer).toString('base64');
  }
}

// Export singleton instance
export const analysisController = new AnalysisController();

