// UI Generation Service - UI Code and Page Generation
// Handles AI-powered UI code generation, page structure creation, and fallbacks

import { aiService, retryWithBackoff, extractAzureAIError, parseAzureAIJSON } from "./aiService";
import type { 
  AzureAIConfig, 
  UIAnalysisResult, 
  PageGenerationResult,
  PerformanceAnalysisResult,
  CodeAnalysisResult,
  PatternAnalysisResult
} from "../types/ai";

/**
 * UI Generation Service - AI-powered UI code generation
 */
export class UIGenerationService {
  
  /**
   * Generate UI code from analysis using AI
   */
  async generateUICode(
    client: any, 
    config: any, 
    analysis: UIAnalysisResult, 
    provider: string = 'azure'
  ): Promise<string> {
    try {
      console.log("🚀 Starting enhanced UI code generation...");
      
      const codePrompt = this.buildUICodePrompt(analysis);
      let generatedCode: string | undefined;
      
      if (provider.toLowerCase() === 'gemini') {
        generatedCode = await this.generateWithGemini(client, config, codePrompt);
      } else if (provider.toLowerCase() === 'openai') {
        generatedCode = await this.generateWithOpenAI(client, config, codePrompt);
      } else if (provider.toLowerCase() === 'azure' || provider.toLowerCase() === 'azureai') {
        generatedCode = await this.generateWithAzure(client, config, codePrompt);
      } else {
        throw new Error(`Unsupported provider: ${provider}`);
      }
      
      if (!generatedCode || generatedCode.trim().length < 100) {
        console.warn("⚠️ Generated code seems too short, using enhanced fallback");
        return this.generateFallbackUICode(analysis);
      }

      console.log("✅ UI code generation successful, length:", generatedCode.length);
      return generatedCode;
      
    } catch (error) {
      console.error("❌ AI code generation error:", extractAzureAIError(error));
      return this.generateFallbackUICode(analysis);
    }
  }

  /**
   * Build the UI code generation prompt
   */
  private buildUICodePrompt(analysis: UIAnalysisResult): string {
    return `Generate a production-ready React TypeScript component based on this detailed UI analysis.

**UI ANALYSIS:**
${JSON.stringify(analysis, null, 2)}

**GENERATION REQUIREMENTS:**

1. **Component Structure**:
   - Main functional component with proper TypeScript interfaces
   - Modular sub-components for complex sections
   - Props interface for reusability

2. **Styling Implementation**:
   - Use Tailwind CSS classes exclusively
   - Implement the exact color palette provided
   - Responsive design (mobile-first approach)
   - Modern spacing and typography

3. **Code Quality**:
   - Follow React best practices and hooks patterns
   - Include proper TypeScript types and interfaces
   - Add meaningful prop types and default values
   - Use semantic HTML elements

4. **Accessibility**:
   - Include ARIA labels and roles
   - Proper heading hierarchy (h1, h2, h3...)
   - Alt text for images and meaningful link text
   - Keyboard navigation support

5. **Modern Features**:
   - Use React 18+ patterns
   - Implement proper state management if needed
   - Include loading states and error boundaries where applicable
   - Add hover effects and smooth transitions

**OUTPUT REQUIREMENTS:**
- Provide ONLY the complete React component code
- No markdown formatting, explanations, or comments outside the code
- Ensure the component is immediately usable
- Include all necessary imports at the top

**COMPONENT NAME:** GeneratedUIComponent`;
  }

  /**
   * Generate code using Gemini
   */
  private async generateWithGemini(client: any, config: any, prompt: string): Promise<string> {
    const model = client.getGenerativeModel({ 
      model: config.modelName,
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 4096
      }
    });
    
    const systemPrompt = "You are a senior React/TypeScript developer specializing in creating production-ready components. Generate clean, accessible, and modern code that follows industry best practices. Focus on code quality, performance, and maintainability.";
    const fullPrompt = `${systemPrompt}\n\n${prompt}`;
    
    const result = await model.generateContent(fullPrompt);
    const response = await result.response;
    return response.text();
  }

  /**
   * Generate code using OpenAI
   */
  private async generateWithOpenAI(client: any, config: any, prompt: string): Promise<string> {
    const response = await client.chat.completions.create({
      model: config.modelName,
      messages: [
        {
          role: "system",
          content: "You are a senior React/TypeScript developer specializing in creating production-ready components. Generate clean, accessible, and modern code that follows industry best practices. Focus on code quality, performance, and maintainability."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      max_tokens: 4096,
      temperature: 0.1
    });
    
    return response.choices[0].message.content || '';
  }

  /**
   * Generate code using Azure AI
   */
  private async generateWithAzure(client: any, config: any, prompt: string): Promise<string> {
    const response = await retryWithBackoff(async () => {
      return await client.path("/chat/completions").post({
        body: {
          messages: [
            {
              role: "system",
              content: "You are a senior React/TypeScript developer specializing in creating production-ready components. Generate clean, accessible, and modern code that follows industry best practices. Focus on code quality, performance, and maintainability."
            },
            {
              role: "user",
              content: prompt
            }
          ],
          max_tokens: 4096,
          temperature: 0.1,
          model: config.modelName,
          stream: false,
        },
      });
    }, config.maxRetries, config.retryDelay);

    if (response.status !== "200") {
      const errorDetail = extractAzureAIError(response.body?.error || response.body);
      throw new Error(`Azure AI API error (${response.status}): ${errorDetail}`);
    }

    return response.body.choices[0]?.message?.content || '';
  }

  /**
   * Generate fallback UI code when AI generation fails
   * Uses conversation context from the analysis to create relevant, dynamic fallback code
   */
  generateFallbackUICode(analysis: UIAnalysisResult): string {
    const components = analysis.components || [];
    const layout = analysis.layout || {};
    const theme = analysis.theme || {};
    const metadata = analysis.metadata || {};
    
    // Extract context from analysis for dynamic generation
    const title = metadata.title || layout.title || 'Your Application';
    const subtitle = metadata.subtitle || layout.subtitle || 'Generated with AI assistance';
    const primaryColor = theme.primaryColor || 'violet';
    const backgroundColor = theme.backgroundColor || 'slate';
    const pageType = metadata.pageType || layout.type || 'landing';
    
    // Generate navigation items from analysis or use sensible defaults
    const navItems = (layout.navigation || []).slice(0, 5);
    const defaultNavItems = ['Home', 'Features', 'About', 'Contact'];
    const finalNavItems = navItems.length > 0 ? navItems : defaultNavItems;
    
    // Generate component sections based on analysis
    const hasHero = components.some((c: any) => c.type?.toLowerCase().includes('hero'));
    const hasFeatures = components.some((c: any) => c.type?.toLowerCase().includes('feature'));
    const hasCTA = components.some((c: any) => 
      c.type?.toLowerCase().includes('cta') || c.type?.toLowerCase().includes('button')
    );
    
    // Build dynamic sections based on detected components
    const heroSection = this.generateHeroSection(title, subtitle, primaryColor, hasHero);
    const featuresSection = this.generateFeaturesSection(components, primaryColor, hasFeatures);
    const ctaSection = hasCTA ? this.generateCTASection(primaryColor) : '';
    
    return `
import React from 'react';

/**
 * Generated Component
 * Created based on: ${pageType} page analysis
 * Components detected: ${components.length}
 */
const GeneratedComponent: React.FC = () => {
  return (
    <div className="min-h-screen bg-${backgroundColor}-50">
      {/* Navigation */}
      <header className="bg-${backgroundColor}-900 text-white p-4">
        <nav className="max-w-6xl mx-auto flex justify-between items-center">
          <h1 className="text-xl font-bold">${title}</h1>
          <div className="hidden md:flex space-x-6">
            ${finalNavItems.map((item: string) => `
            <a href="#" className="hover:text-${primaryColor}-400 transition-colors">${item}</a>`).join('')}
          </div>
          {/* Mobile menu button */}
          <button className="md:hidden p-2 text-white hover:bg-${backgroundColor}-800 rounded">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </nav>
      </header>
      
      <main className="max-w-6xl mx-auto px-4 py-12">
        ${heroSection}
        
        ${featuresSection}
        
        ${ctaSection}
      </main>
      
      {/* Footer */}
      <footer className="bg-${backgroundColor}-900 text-white py-8 mt-16">
        <div className="max-w-6xl mx-auto px-4 text-center">
          <p className="text-${backgroundColor}-400">© ${new Date().getFullYear()} ${title}. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};

export default GeneratedComponent;
    `.trim();
  }
  
  /**
   * Generate hero section based on context
   */
  private generateHeroSection(title: string, subtitle: string, color: string, hasHeroComponent: boolean): string {
    if (!hasHeroComponent) {
      return `
        {/* Hero Section */}
        <section className="text-center mb-16 py-16">
          <h2 className="text-4xl md:text-5xl font-bold mb-4 text-slate-900">${title}</h2>
          <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">${subtitle}</p>
          <div className="flex justify-center gap-4">
            <button className="bg-${color}-600 text-white px-8 py-3 rounded-lg hover:bg-${color}-700 transition-colors">
              Get Started
            </button>
            <button className="border border-${color}-600 text-${color}-600 px-8 py-3 rounded-lg hover:bg-${color}-50 transition-colors">
              Learn More
            </button>
          </div>
        </section>`;
    }
    
    return `
        {/* Hero Section */}
        <section className="text-center mb-16 py-20 bg-gradient-to-br from-${color}-600 to-${color}-800 rounded-3xl text-white">
          <h2 className="text-4xl md:text-6xl font-bold mb-6">${title}</h2>
          <p className="text-xl opacity-90 mb-10 max-w-2xl mx-auto px-4">${subtitle}</p>
          <div className="flex flex-col sm:flex-row justify-center gap-4 px-4">
            <button className="bg-white text-${color}-700 px-10 py-4 rounded-lg font-semibold hover:bg-${color}-50 transition-colors">
              Get Started Free
            </button>
            <button className="border-2 border-white text-white px-10 py-4 rounded-lg font-semibold hover:bg-white/10 transition-colors">
              Watch Demo
            </button>
          </div>
        </section>`;
  }
  
  /**
   * Generate features section from components
   */
  private generateFeaturesSection(components: any[], color: string, hasFeatureComponents: boolean): string {
    const featureComponents = components.filter((c: any) => 
      c.type?.toLowerCase().includes('feature') || 
      c.type?.toLowerCase().includes('card') ||
      c.type?.toLowerCase().includes('section')
    );
    
    // Use analyzed components or generate defaults
    const features = featureComponents.length > 0 
      ? featureComponents.slice(0, 6)
      : [
          { type: 'Feature', description: 'Powerful AI integration for enhanced productivity' },
          { type: 'Feature', description: 'Seamless collaboration with your team' },
          { type: 'Feature', description: 'Advanced analytics and insights' }
        ];
    
    const gridCols = features.length <= 2 ? 'md:grid-cols-2' : 
                     features.length === 4 ? 'md:grid-cols-2 lg:grid-cols-4' : 'md:grid-cols-3';
    
    return `
        {/* Features Section */}
        <section className="mb-16">
          <h3 className="text-2xl md:text-3xl font-bold text-center mb-12 text-slate-900">
            ${hasFeatureComponents ? 'Our Features' : 'What We Offer'}
          </h3>
          <div className="grid ${gridCols} gap-8">
            ${features.map((comp: any, i: number) => `
            <div key={${i}} className="p-6 bg-white rounded-xl shadow-sm hover:shadow-lg transition-shadow border border-gray-100">
              <div className="w-12 h-12 bg-${color}-100 rounded-lg flex items-center justify-center mb-4">
                <div className="w-6 h-6 bg-${color}-600 rounded"></div>
              </div>
              <h4 className="text-xl font-semibold mb-2 text-slate-900">${comp.name || comp.type || 'Feature'}</h4>
              <p className="text-gray-600">${comp.description || 'A powerful feature to help you achieve more.'}</p>
            </div>
            `).join('')}
          </div>
        </section>`;
  }
  
  /**
   * Generate CTA section
   */
  private generateCTASection(color: string): string {
    return `
        {/* Call to Action */}
        <section className="bg-gradient-to-r from-${color}-600 to-${color}-700 rounded-2xl p-8 md:p-12 text-center text-white">
          <h3 className="text-2xl md:text-3xl font-bold mb-4">Ready to Get Started?</h3>
          <p className="text-lg opacity-90 mb-8 max-w-xl mx-auto">
            Join thousands of users who are already experiencing the future.
          </p>
          <button className="bg-white text-${color}-700 px-10 py-4 rounded-lg font-semibold hover:bg-${color}-50 transition-colors">
            Start Your Free Trial
          </button>
        </section>`;
  }

  /**
   * Generate page structure with AI
   */
  async generatePageStructure(
    client: any, 
    config: AzureAIConfig, 
    template: string, 
    requirements: string, 
    style: string
  ): Promise<PageGenerationResult> {
    try {
      console.log("🏗️ Starting enhanced page structure generation...");
      
      const pagePrompt = this.buildPageStructurePrompt(template, requirements, style);

      const response = await retryWithBackoff(async () => {
        return await client.path("/chat/completions").post({
          body: {
            messages: [
              {
                role: "system",
                content: "You are a senior web architect and full-stack developer specializing in modern React applications. Design comprehensive, production-ready page structures with careful attention to scalability, maintainability, and user experience. Focus on practical, implementable solutions."
              },
              {
                role: "user",
                content: pagePrompt
              }
            ],
            max_tokens: 3072,
            temperature: 0.3,
            model: config.modelName,
            stream: false,
            response_format: { type: "json_object" }
          },
        });
      }, config.maxRetries, config.retryDelay);

      if (response.status !== "200") {
        const errorDetail = extractAzureAIError(response.body?.error || response.body);
        throw new Error(`Azure AI API error (${response.status}): ${errorDetail}`);
      }

      const aiResponse = response.body.choices[0]?.message?.content || "";
      console.log("🎯 Page generation AI response received, length:", aiResponse.length);
      
      const parsed = parseAzureAIJSON(aiResponse);
      if (parsed && parsed.components) {
        console.log("✅ Page structure generation successful:", {
          componentsCount: parsed.components.length,
          sectionsCount: parsed.pageStructure?.sections?.length || 0,
          complexity: parsed.projectMetadata?.complexity
        });
        return parsed;
      }

      console.warn("⚠️ Failed to parse AI page generation, using fallback");
      return this.generateFallbackPageStructure(template, style);
      
    } catch (error) {
      console.error("❌ AI page generation error:", extractAzureAIError(error));
      return this.generateFallbackPageStructure(template, style);
    }
  }

  /**
   * Build page structure prompt
   */
  private buildPageStructurePrompt(template: string, requirements: string, style: string): string {
    return `Design a comprehensive ${template} page structure with modern web architecture principles.

**PROJECT SPECIFICATIONS:**
- Template Type: ${template}
- Requirements: ${requirements}
- Style Theme: ${style}
- Target Framework: React TypeScript with Tailwind CSS

**DESIGN REQUIREMENTS:**

1. **Component Architecture**:
   - Modular, reusable component structure
   - Proper component hierarchy and organization
   - TypeScript interfaces for all props
   - Accessibility-first design patterns

2. **Modern Web Principles**:
   - Mobile-first responsive design
   - Performance optimization considerations
   - SEO-friendly structure
   - Progressive enhancement approach

3. **User Experience**:
   - Intuitive navigation and information architecture
   - Clear visual hierarchy and content flow
   - Interactive elements and micro-interactions
   - Loading states and error handling

4. **Technical Implementation**:
   - Modern React patterns (hooks, context, suspense)
   - Code splitting and lazy loading opportunities
   - State management strategy
   - API integration points

**RESPONSE FORMAT:**
Respond with ONLY valid JSON in this exact structure:

{
  "projectMetadata": {
    "template": "${template}",
    "complexity": "low|medium|high",
    "estimatedDevTime": "estimated development time",
    "recommendedFeatures": ["feature suggestions based on requirements"]
  },
  "pageStructure": {
    "layout": "grid|flexbox|hybrid",
    "sections": [
      {
        "name": "section name",
        "type": "header|hero|content|sidebar|footer|etc",
        "purpose": "section purpose and content",
        "priority": "high|medium|low"
      }
    ]
  },
  "components": [
    {
      "name": "ComponentName",
      "type": "functional|class",
      "purpose": "component responsibility",
      "props": [
        {
          "name": "prop name",
          "type": "TypeScript type",
          "required": true,
          "description": "prop description"
        }
      ],
      "dependencies": ["required dependencies"],
      "complexity": "simple|moderate|complex"
    }
  ],
  "designSystem": {
    "colorPalette": {
      "primary": "#hex",
      "secondary": "#hex",
      "accent": "#hex",
      "neutral": "#hex",
      "background": "#hex",
      "text": "#hex"
    },
    "typography": {
      "headings": "font family and scales",
      "body": "body text specifications"
    },
    "spacing": {
      "scale": "spacing scale",
      "containerMaxWidth": "max container width",
      "sectionPadding": "section padding"
    }
  },
  "routes": ["route paths as simple strings"],
  "stateManagement": {
    "strategy": "context|redux|zustand|local",
    "globalState": ["global state requirements"],
    "localState": ["component-specific state needs"]
  }
}`;
  }

  /**
   * Generate fallback page structure
   */
  generateFallbackPageStructure(template: string, style: string): PageGenerationResult {
    const timestamp = Date.now();
    return {
      projectMetadata: {
        template: template || "landing",
        complexity: "medium",
        estimatedDevTime: "2-3 days",
        recommendedFeatures: ["Responsive design", "SEO optimization", "Performance monitoring"]
      },
      pageStructure: {
        layout: "flexbox",
        sections: [
          { name: "Header", type: "header", purpose: "Site navigation and branding", priority: "high" },
          { name: "Hero", type: "hero", purpose: "Main value proposition and call-to-action", priority: "high" },
          { name: "Features", type: "content", purpose: "Showcase key features and benefits", priority: "medium" },
          { name: "Footer", type: "footer", purpose: "Secondary navigation and contact info", priority: "low" }
        ]
      },
      components: [
        { 
          name: "Header", 
          type: "functional",
          purpose: "Site navigation and branding",
          props: [
            { name: "title", type: "string", required: true, description: "Site title" },
            { name: "navigation", type: "NavItem[]", required: true, description: "Navigation menu items" }
          ],
          dependencies: ["React", "Tailwind CSS"],
          complexity: "simple"
        },
        { 
          name: "Hero", 
          type: "functional",
          purpose: "Main landing section with call-to-action",
          props: [
            { name: "title", type: "string", required: true, description: "Main heading" },
            { name: "subtitle", type: "string", required: false, description: "Supporting text" },
            { name: "cta", type: "CTAButton", required: true, description: "Call-to-action button" }
          ],
          dependencies: ["React", "Tailwind CSS"],
          complexity: "simple"
        },
        { 
          name: "Features", 
          type: "functional",
          purpose: "Feature showcase grid",
          props: [
            { name: "items", type: "FeatureItem[]", required: true, description: "List of features" },
            { name: "layout", type: "grid|list", required: false, description: "Layout style" }
          ],
          dependencies: ["React", "Tailwind CSS"],
          complexity: "moderate"
        },
        { 
          name: "Footer", 
          type: "functional",
          purpose: "Site footer with links and information",
          props: [
            { name: "links", type: "FooterLink[]", required: true, description: "Footer navigation links" },
            { name: "copyright", type: "string", required: true, description: "Copyright notice" }
          ],
          dependencies: ["React", "Tailwind CSS"],
          complexity: "simple"
        }
      ],
      colorScheme: {
        primary: "#6366f1",
        secondary: "#1e293b",
        accent: "#f59e0b",
        neutral: "#6b7280",
        background: "#ffffff",
        text: "#111827"
      }
    } as any;
  }

  /**
   * Generate page files from structure
   */
  async generatePageFiles(
    client: any, 
    config: AzureAIConfig, 
    pageResult: any
  ): Promise<any[]> {
    let safePageResult: any;
    
    try {
      console.log("📁 Starting enhanced file generation...");
      
      // Normalize pageResult
      safePageResult = this.normalizePageResult(pageResult);
      
      const files: any[] = [];
      const designSystem = safePageResult.designSystem;
      const colorPalette = designSystem.colorPalette;
      const theme = designSystem.theme || "modern";
      const template = safePageResult.projectMetadata?.template || safePageResult.template || "landing";
      
      // Generate main App component
      const appCode = await this.generateAppComponent(client, config, safePageResult, template, theme, colorPalette, designSystem);
      if (appCode) {
        files.push({ name: "App.tsx", content: appCode, type: "component" });
        console.log("✅ Generated App.tsx component");
      }

      // Generate individual components
      const components = safePageResult.components?.slice(0, 3) || [];
      for (const component of components) {
        const componentCode = await this.generateComponentFile(client, config, component, theme, colorPalette, designSystem);
        if (componentCode) {
          files.push({
            name: `${component.name || 'Component'}.tsx`,
            content: componentCode,
            type: "component"
          });
          console.log(`✅ Generated ${component.name || 'Component'}.tsx component`);
        }
      }

      // Add configuration files
      files.push(
        { name: "tailwind.config.js", content: this.generateTailwindConfig(colorPalette), type: "config" },
        { name: "routes.ts", content: this.generateRoutesFile(safePageResult.routes || []), type: "config" }
      );
      
      console.log(`✅ File generation completed. Generated ${files.length} files.`);
      return files;
      
    } catch (error) {
      console.error("❌ AI file generation error:", extractAzureAIError(error));
      return this.generateFallbackPageFiles(safePageResult);
    }
  }

  /**
   * Normalize page result with safe defaults
   */
  private normalizePageResult(pageResult: any): any {
    if (!pageResult || typeof pageResult !== 'object') {
      pageResult = {};
    }
    
    const safePageResult = {
      template: "landing",
      components: [],
      designSystem: {
        colorPalette: {
          primary: "#6366f1",
          secondary: "#1e293b",
          accent: "#f59e0b",
          neutral: "#6b7280",
          background: "#ffffff",
          text: "#111827"
        },
        theme: "modern",
        typography: {
          headings: "Inter, system-ui, sans-serif",
          body: "Inter, system-ui, sans-serif"
        }
      },
      routes: [],
      projectMetadata: { template: "landing" },
      ...pageResult
    };
    
    if (pageResult?.designSystem) {
      safePageResult.designSystem = { ...safePageResult.designSystem, ...pageResult.designSystem };
    }
    
    if (pageResult?.designSystem?.colorPalette) {
      safePageResult.designSystem.colorPalette = {
        ...safePageResult.designSystem.colorPalette,
        ...pageResult.designSystem.colorPalette
      };
    }
    
    return safePageResult;
  }

  /**
   * Generate App component with AI
   */
  private async generateAppComponent(
    client: any, 
    config: AzureAIConfig, 
    pageResult: any, 
    template: string, 
    theme: string, 
    colorPalette: any,
    designSystem: any
  ): Promise<string | null> {
    const componentsList = pageResult.components?.map((c: any) => c?.name || 'Component').join(', ') || 'Header, Hero, Features, Footer';
    
    const appPrompt = `Generate a production-ready React TypeScript App component for a ${template} page.

**PROJECT SPECIFICATIONS:**
Template: ${template}
Components: ${componentsList}
Style Theme: ${theme}
Color Palette: ${JSON.stringify(colorPalette, null, 2)}

**DESIGN SYSTEM:**
${JSON.stringify(designSystem, null, 2)}

**GENERATION REQUIREMENTS:**
1. Complete React TypeScript functional component
2. Use Tailwind CSS classes with the specified color palette
3. Include all specified components in a logical layout
4. Implement responsive design (mobile-first)
5. Add proper TypeScript interfaces for all props
6. Include proper accessibility attributes
7. Use semantic HTML elements
8. Export as default

**CRITICAL: REACT RENDERING RULES:**
- NEVER render objects directly as React children
- Only render: strings, numbers, JSX elements, or arrays of these
- If you need to display route data, extract strings/properties first

**OUTPUT FORMAT:**
Provide ONLY the complete React component code with imports. No explanations or markdown.`;

    try {
      const response = await retryWithBackoff(async () => {
        return await client.path("/chat/completions").post({
          body: {
            messages: [
              { role: "system", content: "You are a senior React/TypeScript developer specializing in creating production-ready, accessible components. Generate clean, modern code using Tailwind CSS and React best practices." },
              { role: "user", content: appPrompt }
            ],
            max_tokens: 4096,
            temperature: 0.2,
            model: config.modelName,
            stream: false,
          },
        });
      }, config.maxRetries, config.retryDelay);

      if (response.status === "200") {
        return response.body.choices[0]?.message?.content || null;
      }
    } catch (error) {
      console.warn("⚠️ Failed to generate App component:", extractAzureAIError(error));
    }
    return null;
  }

  /**
   * Generate individual component file with AI
   */
  private async generateComponentFile(
    client: any,
    config: AzureAIConfig,
    component: any,
    theme: string,
    colorPalette: any,
    designSystem: any
  ): Promise<string | null> {
    const safeComponent = component || {};
    const propsDescription = Array.isArray(safeComponent.props)
      ? safeComponent.props.map((p: any) => typeof p === 'string' ? p : `${p?.name || 'prop'}: ${p?.type || 'any'}`).join(', ')
      : 'Standard React props';

    const componentPrompt = `Generate a React TypeScript ${safeComponent.name || 'Component'} component.

**COMPONENT SPECIFICATIONS:**
Name: ${safeComponent.name || 'Component'}
Purpose: ${safeComponent.purpose || 'UI component'}
Props: ${propsDescription}
Complexity: ${safeComponent.complexity || 'simple'}

**DESIGN SYSTEM:**
Style Theme: ${theme}
Color Palette: ${JSON.stringify(colorPalette, null, 2)}
Typography: ${JSON.stringify(designSystem.typography, null, 2)}

**REQUIREMENTS:**
1. Functional React TypeScript component
2. Proper TypeScript interface for props
3. Use Tailwind CSS with provided color palette
4. Responsive and accessible design
5. Clean, maintainable code structure
6. Export as default

**CRITICAL: REACT RENDERING RULES:**
- NEVER render objects directly as React children
- Only render: strings, numbers, JSX elements, or arrays of these

Provide ONLY the complete component code. No explanations.`;

    try {
      const response = await retryWithBackoff(async () => {
        return await client.path("/chat/completions").post({
          body: {
            messages: [
              { role: "system", content: "You are an expert React developer. Create reusable, accessible, and well-structured components using modern React patterns and Tailwind CSS." },
              { role: "user", content: componentPrompt }
            ],
            max_tokens: 2048,
            temperature: 0.2,
            model: config.modelName,
            stream: false,
          },
        });
      }, config.maxRetries, config.retryDelay);

      if (response.status === "200") {
        return response.body.choices?.[0]?.message?.content || null;
      }
    } catch (error) {
      console.warn(`⚠️ Failed to generate component ${safeComponent.name}:`, extractAzureAIError(error));
    }
    return null;
  }

  /**
   * Generate Tailwind config
   */
  generateTailwindConfig(colors: any): string {
    return `module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: "${colors?.primary || '#6366f1'}",
        secondary: "${colors?.secondary || '#1e293b'}",
        accent: "${colors?.accent || '#f59e0b'}"
      }
    }
  },
  plugins: []
};`;
  }

  /**
   * Generate routes file
   */
  generateRoutesFile(routes: string[]): string {
    return `export const routes = ${JSON.stringify(routes || [], null, 2)};
  
export default routes;`;
  }

  /**
   * Get default routes for template
   */
  getDefaultRoutes(template: string): string[] {
    const routes: Record<string, string[]> = {
      landing: ["/", "/about", "/contact"],
      dashboard: ["/dashboard", "/analytics", "/settings"],
      portfolio: ["/", "/projects", "/about", "/contact"],
      blog: ["/", "/posts", "/categories", "/about"],
      ecommerce: ["/", "/products", "/cart", "/checkout"]
    };
    return routes[template] || ["/"];
  }

  /**
   * Generate fallback page files
   */
  generateFallbackPageFiles(pageResult: any): any[] {
    console.log("🔄 Using fallback page files generation");
    
    const colors = pageResult?.designSystem?.colorPalette || pageResult?.styles?.colors || {
      primary: "#6366f1",
      secondary: "#1e293b",
      accent: "#f59e0b"
    };
    
    const routes = pageResult?.routes || [];
    
    return [
      { 
        name: "App.tsx", 
        content: `import React from 'react';

const App: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-slate-900 text-white p-4">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-xl font-bold">Your Application</h1>
        </div>
      </header>
      
      <main className="max-w-6xl mx-auto px-4 py-8">
        <section className="text-center mb-12">
          <h2 className="text-4xl font-bold mb-4">Welcome</h2>
          <p className="text-xl text-gray-600 mb-8">
            Your generated application is ready to be customized.
          </p>
          <button className="bg-violet-600 text-white px-8 py-3 rounded-lg hover:bg-violet-700 transition-colors">
            Get Started
          </button>
        </section>
      </main>
      
      <footer className="bg-gray-100 p-8 mt-16">
        <div className="max-w-6xl mx-auto text-center text-gray-600">
          <p>&copy; 2024 Your Application. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};

export default App;`, 
        type: "component" 
      },
      { 
        name: "Header.tsx", 
        content: `import React from 'react';

interface HeaderProps {
  title?: string;
  navigation?: Array<{ label: string; href: string }>;
}

const Header: React.FC<HeaderProps> = ({ 
  title = "Your App", 
  navigation = [] 
}) => {
  return (
    <header className="bg-slate-900 text-white p-4">
      <div className="max-w-6xl mx-auto flex justify-between items-center">
        <h1 className="text-xl font-bold">{title}</h1>
        <nav className="hidden md:flex space-x-6">
          {navigation.map((item, index) => (
            <a 
              key={index} 
              href={item.href} 
              className="hover:text-violet-400 transition-colors"
            >
              {item.label}
            </a>
          ))}
        </nav>
      </div>
    </header>
  );
};

export default Header;`, 
        type: "component" 
      },
      { name: "tailwind.config.js", content: this.generateTailwindConfig(colors), type: "config" },
      { name: "routes.ts", content: this.generateRoutesFile(routes), type: "config" }
    ];
  }

  /**
   * Generate fallback performance analysis
   */
  generateFallbackPerformanceAnalysis(): PerformanceAnalysisResult {
    const timestamp = Date.now();
    return {
      performanceMetrics: {
        loadTime: { value: "2.1", grade: "C", benchmark: "Above average for modern React applications" },
        bundleSize: { main: "285", chunks: "3 chunks averaging 95KB each", total: "570", grade: "B" },
        renderPerformance: {
          firstPaint: "820",
          firstContentfulPaint: "1240",
          largestContentfulPaint: "1850",
          cumulativeLayoutShift: "0.12",
          grade: "B"
        },
        memoryUsage: { initialHeap: "12", peakHeap: "28", memoryLeaks: "None detected", grade: "A" }
      },
      optimizationSuggestions: [
        {
          category: "loading",
          priority: "high",
          issue: "Large initial bundle size affecting load time",
          solution: "Implement code splitting with React.lazy() and dynamic imports for routes",
          expectedImprovement: "30-40% reduction in initial load time",
          effort: "medium",
          impact: "high"
        },
        {
          category: "rendering",
          priority: "medium",
          issue: "Unnecessary re-renders in component tree",
          solution: "Add React.memo() to expensive components and optimize useCallback/useMemo usage",
          expectedImprovement: "15-25% improvement in render performance",
          effort: "low",
          impact: "medium"
        }
      ],
      codeQualityMetrics: { codeSmells: "3", duplicateCode: "8%", complexity: "6.2", maintainability: "78" },
      securityAssessment: {
        vulnerabilities: "1",
        riskLevel: "low",
        recommendations: ["Update dependencies with known vulnerabilities"]
      },
      overallScore: {
        performance: "75",
        grade: "B",
        summary: "Good performance with room for optimization",
        priorityActions: ["Implement code splitting", "Optimize component re-renders"]
      },
      _fallback: true,
      _timestamp: timestamp
    };
  }

  /**
   * Generate fallback pattern analysis
   */
  generateFallbackPatternAnalysis(): PatternAnalysisResult {
    return {
      detected: [
        { name: "Component Composition", usage: "85%", recommendation: "Good usage of composition over inheritance" },
        { name: "Custom Hooks", usage: "70%", recommendation: "Well implemented for logic reuse" },
        { name: "State Management", usage: "60%", recommendation: "Consider upgrading to more robust solution for complex state" },
        { name: "Error Boundaries", usage: "40%", recommendation: "Add more error boundaries for better error handling" }
      ],
      antiPatterns: [
        { name: "Prop Drilling", instances: 3, severity: "medium" },
        { name: "Large Components", instances: 2, severity: "low" },
        { name: "Inline Styles", instances: 1, severity: "low" }
      ]
    };
  }

  /**
   * Generate fallback code analysis
   */
  generateFallbackCodeAnalysis(code: string): CodeAnalysisResult {
    return {
      improvements: [
        {
          type: "performance",
          description: "Consider using React.memo for expensive components",
          severity: "medium",
          line: 1,
          suggestion: "Wrap component with React.memo to prevent unnecessary re-renders"
        },
        {
          type: "accessibility",
          description: "Ensure proper ARIA labels and semantic HTML",
          severity: "high",
          line: 1,
          suggestion: "Add descriptive alt attributes and ARIA labels where needed"
        },
        {
          type: "security",
          description: "Validate and sanitize user inputs",
          severity: "high",
          line: 1,
          suggestion: "Use proper input validation and sanitization techniques"
        }
      ],
      optimizedCode: code
    };
  }
}

// Export singleton instance
export const uiGenerationService = new UIGenerationService();

// Export functions for backwards compatibility
export function generateUICodeWithAI(client: any, config: any, analysis: any, provider: string = 'azure'): Promise<string> {
  return uiGenerationService.generateUICode(client, config, analysis, provider);
}

export function generateFallbackUICode(analysis: any): string {
  return uiGenerationService.generateFallbackUICode(analysis);
}

export function generatePageWithAI(client: any, config: AzureAIConfig, template: string, requirements: string, style: string): Promise<any> {
  return uiGenerationService.generatePageStructure(client, config, template, requirements, style);
}

export function generatePageFilesWithAI(client: any, config: AzureAIConfig, pageResult: any): Promise<any[]> {
  return uiGenerationService.generatePageFiles(client, config, pageResult);
}

export function generateFallbackPageStructure(template: string, style: string): any {
  return uiGenerationService.generateFallbackPageStructure(template, style);
}

export function generateFallbackPageFiles(pageResult: any): any[] {
  return uiGenerationService.generateFallbackPageFiles(pageResult);
}

export function generateFallbackPerformanceAnalysis(): any {
  return uiGenerationService.generateFallbackPerformanceAnalysis();
}

export function generateFallbackPatternAnalysis(): any {
  return uiGenerationService.generateFallbackPatternAnalysis();
}

export function generateFallbackCodeAnalysis(code: string): any {
  return uiGenerationService.generateFallbackCodeAnalysis(code);
}

export function generateTailwindConfig(colors: any): string {
  return uiGenerationService.generateTailwindConfig(colors);
}

export function generateRoutesFile(routes: string[]): string {
  return uiGenerationService.generateRoutesFile(routes);
}

export function getDefaultRoutes(template: string): string[] {
  return uiGenerationService.getDefaultRoutes(template);
}

