import React, { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Upload, 
  ImageIcon, 
  X, 
  Check, 
  Loader2, 
  Download, 
  Copy, 
  Eye,
  Sparkles,
  Zap,
  Code,
  FolderOpen,
  AlertCircle,
  Settings
} from 'lucide-react';
import { useFileManager, type FileItem } from '../hooks/useFileManager';
import { useAIProvider } from '../hooks/useAIProvider';
import { toast } from 'sonner';
import { AICreditsDisplay } from './AICreditsDisplay';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { FileEmptyStates } from './EmptyStates';

interface CloneUIModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface AnalysisResult {
  components: Array<{ type: string; description: string; complexity?: string }>;
  colorPalette: string[] | {
    primary?: string;
    secondary?: string;
    accent?: string;
    background?: string;
    text?: string;
    additional?: string[];
    [key: string]: string | string[] | undefined;
  };
  layout: string | {
    system?: string;
    structure?: string;
    responsive?: string;
  };
  estimatedComplexity: string;
  typography?: {
    primary?: string;
    secondary?: string;
    sizes?: string[];
  };
  implementationNotes?: string[];
}

interface GenerationResult {
  success: boolean;
  analysis: AnalysisResult;
  generatedCode: string;
  metadata?: {
    model?: string;
    provider?: string;
    responseTime?: string;
    creditsUsed?: number;
    tokensUsed?: number;
    cached?: boolean;
    analysisTime?: number;
  };
}

interface ImageFileManagerModalProps {
  onFileSelect: (file: FileItem) => void;
  selectedFile: FileItem | null;
  preview: string | null;
}

// Provider status header component
interface ProviderStatusHeaderProps {
  currentProvider: any;
  selectedLLMModel: any;
  isProviderConfigured: (provider: any) => boolean;
}

const ProviderStatusHeader: React.FC<ProviderStatusHeaderProps> = ({ 
  currentProvider, 
  selectedLLMModel, 
  isProviderConfigured 
}) => {
  const providerNames: { [key: string]: string } = {
    lmstudio: 'Uterpi AI',
    uterpi: 'Uterpi',
    openai: 'OpenAI',
    gemini: 'Google Gemini', 
    huggingface: 'Hugging Face'
  };

  const isConfigured = isProviderConfigured(currentProvider);
  
  return (
    <div className="flex items-center justify-between mb-4 p-3 bg-slate-800/30 rounded-lg">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-400">AI Provider:</span>
          <Badge 
            variant="outline" 
            className={`${isConfigured ? 'text-violet-400 border-violet-400/50' : 'text-orange-400 border-orange-400/50'}`}
          >
            {providerNames[currentProvider] || currentProvider}
          </Badge>
          {!isConfigured && (
            <div className="flex items-center gap-1 text-orange-400">
              <AlertCircle className="w-4 h-4" />
              <span className="text-xs">Not configured</span>
            </div>
          )}
        </div>
        {selectedLLMModel && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-400">Model:</span>
            <span className="text-sm text-white">{selectedLLMModel.name}</span>
          </div>
        )}
      </div>
      <div className="flex items-center gap-3">
        <AICreditsDisplay compact={true} />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            // Navigate to provider settings - you may need to implement this navigation
            toast.info('Provider settings - implement navigation');
          }}
          className="p-1 h-auto text-slate-400 hover:text-white"
        >
          <Settings className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
};

const ImageFileManagerModal: React.FC<ImageFileManagerModalProps> = ({ onFileSelect, selectedFile, preview }) => {
  const fileManager = useFileManager();
  const [searchQuery, setSearchQuery] = useState('');
  
  // Enhanced file filtering with better image support
  const { data: fileList, isLoading } = fileManager.useFileList({
    search: searchQuery || undefined,
    mimeType: 'image/',
    limit: 50 // Show more images
  });

  const imageFiles = fileList?.files.filter(file => 
    file.mimeType.startsWith('image/') && 
    ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.mimeType)
  ) || [];

  return (
    <div className="space-y-4">
      {/* Enhanced search with filters */}
      <div className="space-y-3">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search your images..."
          className="w-full p-3 bg-slate-800/50 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:border-violet-400 focus:outline-none"
        />
        
        {/* File type filters */}
        <div className="flex gap-2 text-xs">
          <Badge variant="outline" className="text-slate-400">
            {imageFiles.length} images found
          </Badge>
          <Badge variant="outline" className="text-slate-400">
            Supported: JPG, PNG, WebP, GIF
          </Badge>
        </div>
      </div>

      {/* Enhanced preview section */}
      {preview && selectedFile && (
        <div className="p-4 bg-slate-800/50 border border-violet-400 rounded-lg">
          <div className="flex items-start space-x-4">
            <img
              src={preview}
              alt="Selected"
              className="w-24 h-24 object-cover rounded border border-slate-600"
            />
            <div className="flex-1">
              <h3 className="font-medium text-violet-400">{selectedFile.name}</h3>
              <div className="space-y-1 text-sm text-slate-400">
                <p>{(selectedFile.size / 1024).toFixed(1)} KB • {selectedFile.mimeType}</p>
                <p>Selected for analysis</p>
              </div>
              <Badge variant="outline" className="mt-2 text-green-400 border-green-400/50">
                Ready for Analysis
              </Badge>
            </div>
          </div>
        </div>
      )}

      <div className="max-h-64 overflow-y-auto border border-slate-600 rounded-lg">
        {isLoading ? (
          <div className="p-8 text-center">
            <div className="animate-spin w-6 h-6 border-2 border-violet-400 border-t-transparent rounded-full mx-auto mb-2"></div>
            <p className="text-slate-400">Loading images...</p>
          </div>
        ) : imageFiles.length === 0 ? (
          <FileEmptyStates.NoFiles 
            onUpload={() => {
              // Trigger image upload
              const input = document.createElement('input');
              input.type = 'file';
              input.multiple = true;
              input.accept = 'image/*';
              input.onchange = (e) => {
                const files = (e.target as HTMLInputElement).files;
                if (files) {
                  // Handle image upload
                  console.log('Images selected for upload:', files);
                }
              };
              input.click();
            }}
          />
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4">
            {imageFiles.map((file) => (
              <button
                key={file.id}
                onClick={() => onFileSelect(file)}
                className={`relative group rounded-lg overflow-hidden border-2 transition-all ${
                  selectedFile?.id === file.id 
                    ? 'border-violet-400 ring-2 ring-violet-400/20' 
                    : 'border-slate-600 hover:border-slate-500'
                }`}
              >
                <div className="aspect-square bg-slate-800 relative">
                  {/* Enhanced image preview */}
                  <img 
                    src={`/api/files/${file.id}/download`}
                    alt={file.name}
                    className="w-full h-full object-cover"
                    loading="lazy"
                    onError={(e) => {
                      // Fallback to icon if image fails to load
                      e.currentTarget.classList.add('hidden');
                      const fallback = e.currentTarget.nextElementSibling as HTMLElement;
                      if (fallback) fallback.classList.remove('hidden');
                    }}
                  />
                  <div className="hidden w-full h-full items-center justify-center absolute inset-0 bg-slate-800">
                    <ImageIcon className="w-8 h-8 text-slate-400" />
                  </div>
                </div>
                
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                  <p className="text-xs text-white truncate">{file.name}</p>
                  <p className="text-xs text-slate-300">
                    {(file.size / 1024).toFixed(1)} KB
                  </p>
                </div>
                
                {selectedFile?.id === file.id && (
                  <div className="absolute top-2 right-2">
                    <Check className="w-4 h-4 text-violet-400 bg-slate-900/80 rounded-full p-0.5" />
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const CloneUIModal: React.FC<CloneUIModalProps> = ({ isOpen, onClose }) => {
  const [step, setStep] = useState<'upload' | 'analyzing' | 'results'>('upload');
  const [inputMethod, setInputMethod] = useState<'upload' | 'select'>('upload');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedStoredFile, setSelectedStoredFile] = useState<FileItem | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<GenerationResult | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [estimatedCredits] = useState(15); // UI analysis typically costs ~15 credits
  
  const fileManager = useFileManager();
  const {
    currentProvider,
    selectedLLMModel,
    isProviderConfigured
  } = useAIProvider();

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    const files = e.dataTransfer.files;
    if (files?.[0] && files[0].type.startsWith('image/')) {
      handleFileSelect(files[0]);
    }
  }, []);

  const handleFileSelect = (file: File) => {
    setSelectedFile(file);
    
    // Create preview
    const reader = new FileReader();
    reader.onload = (e) => {
      setPreview(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleStoredImageSelect = async (file: FileItem) => {
    setSelectedStoredFile(file);
    setSelectedFile(null); // Clear any uploaded file
    
    try {
      // Get image content as blob URL for preview
      const response = await fetch(`/api/files/${file.id}/download`);
      if (response.ok) {
        const blob = await response.blob();
        const previewUrl = URL.createObjectURL(blob);
        setPreview(previewUrl);
        toast.success(`Image "${file.name}" selected successfully`);
      }
    } catch (error) {
      toast.error('Failed to load image preview');
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const analyzeImage = async () => {
    if (!selectedFile && !selectedStoredFile) return;

    // Check if current provider is configured
    if (!isProviderConfigured(currentProvider)) {
      toast.error(`${currentProvider.charAt(0).toUpperCase() + currentProvider.slice(1)} is not properly configured. Please check your settings.`);
      return;
    }

    setStep('analyzing');

    try {
      const formData = new FormData();
      
      // Handle both uploaded and stored files
      if (selectedFile) {
        formData.append('image', selectedFile);
      } else if (selectedStoredFile) {
        // Get the file blob from storage for stored files
        const response = await fetch(`/api/files/${selectedStoredFile.id}/download`);
        if (!response.ok) {
          throw new Error('Failed to retrieve stored image');
        }
        const blob = await response.blob();
        formData.append('image', blob, selectedStoredFile.name);
      }
      
      // Use current provider from AI provider system
      formData.append('provider', currentProvider);
      
      // Add API keys if needed (for providers that require them)
      if (currentProvider === 'gemini') {
        const apiKey = localStorage.getItem('gemini-api-key');
        if (apiKey) formData.append('apiKey', apiKey);
      } else if (currentProvider === 'openai') {
        const apiKey = localStorage.getItem('openai-api-key');
        if (apiKey) formData.append('apiKey', apiKey);
      } else if (currentProvider === 'huggingface') {
        const apiKey = localStorage.getItem('hf-api-token');
        if (apiKey) formData.append('apiKey', apiKey);
      }

      const response = await fetch('/api/clone-ui/analyze', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const result: GenerationResult = await response.json();
        setAnalysisResult(result);
        setStep('results');
        
        // Show success feedback with credit info if available
        const creditsUsed = result.metadata?.creditsUsed || estimatedCredits;
        toast.success(`UI analysis complete! Generated ${result.analysis.components?.length || 0} components using ${creditsUsed} credits.`);
      } else {
        const errorData = await response.json();
        
        if (response.status === 402 && errorData.code === 'INSUFFICIENT_CREDITS') {
          toast.error(`Insufficient AI credits. You need ${errorData.creditsRequired || estimatedCredits} credits but have ${errorData.currentBalance || 0}.`);
        } else if (response.status === 401) {
          toast.error('Authentication required. Please log in to use UI analysis.');
        } else if (response.status === 403) {
          toast.error('UI analysis requires a paid subscription. Please upgrade your plan.');
        } else {
          throw new Error(errorData.error || 'Analysis failed');
        }
        setStep('upload');
      }
    } catch (error) {
      console.error('Analysis error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to analyze image. Please try again.');
      setStep('upload');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const downloadCode = () => {
    if (analysisResult?.generatedCode) {
      const blob = new Blob([analysisResult.generatedCode], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'GeneratedComponent.tsx';
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const resetModal = () => {
    setStep('upload');
    setSelectedFile(null);
    setPreview(null);
    setAnalysisResult(null);
    setDragActive(false);
  };

  const handleClose = () => {
    resetModal();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        {/* Backdrop */}
        <motion.div
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          onClick={handleClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        />

        {/* Modal */}
        <motion.div
          className="relative w-full max-w-4xl max-h-[90vh] mx-4 bg-slate-900/95 backdrop-blur-xl rounded-2xl border border-slate-700/50 overflow-hidden"
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          transition={{ type: "spring", duration: 0.5 }}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-slate-700/50">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-violet-500/20 rounded-lg">
                <ImageIcon className="w-6 h-6 text-violet-400" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-white">Clone UI from Image</h2>
                <p className="text-sm text-slate-400">Upload an image to generate React components</p>
              </div>
            </div>
            <button
              onClick={handleClose}
              className="p-2 hover:bg-slate-700/50 rounded-lg transition-colors"
              title="Close modal"
              aria-label="Close Clone UI modal"
            >
              <X className="w-5 h-5 text-slate-400" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 overflow-y-auto max-h-[calc(90vh-80px)]">
            {step === 'upload' && (
              <div className="space-y-6">
                {/* Provider Status Header */}
                <ProviderStatusHeader 
                  currentProvider={currentProvider}
                  selectedLLMModel={selectedLLMModel}
                  isProviderConfigured={isProviderConfigured}
                />
                
                {/* Input Method Selection */}
                <div className="flex justify-center gap-2">
                  <button
                    onClick={() => setInputMethod('upload')}
                    className={`px-4 py-2 rounded-lg transition-all ${
                      inputMethod === 'upload'
                        ? 'bg-violet-500/20 text-violet-400 border border-violet-400/50'
                        : 'text-slate-400 hover:text-white border border-slate-600'
                    }`}
                  >
                    <Upload className="w-4 h-4 mr-2 inline" />
                    Upload Image
                  </button>
                  <button
                    onClick={() => setInputMethod('select')}
                    className={`px-4 py-2 rounded-lg transition-all ${
                      inputMethod === 'select'
                        ? 'bg-violet-500/20 text-violet-400 border border-violet-400/50'
                        : 'text-slate-400 hover:text-white border border-slate-600'
                    }`}
                  >
                    <FolderOpen className="w-4 h-4 mr-2 inline" />
                    Select from Files
                  </button>
                </div>

                {inputMethod === 'upload' && (
                  /* Upload Area */
                  <div
                    className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-all ${
                      dragActive
                        ? 'border-violet-400 bg-violet-500/10'
                        : 'border-slate-600 hover:border-slate-500'
                    }`}
                    onDragEnter={handleDrag}
                    onDragLeave={handleDrag}
                    onDragOver={handleDrag}
                    onDrop={handleDrop}
                  >
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileInput}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      title="Upload image file"
                      aria-label="Upload image file for UI cloning"
                    />
                    
                    {preview ? (
                      <div className="space-y-4">
                        <img
                          src={preview}
                          alt="Preview"
                          className="max-w-md max-h-64 mx-auto rounded-lg shadow-lg"
                        />
                        <div className="flex items-center justify-center gap-2 text-sm text-green-400">
                          <Check className="w-4 h-4" />
                          Image selected: {selectedFile?.name}
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="p-4 bg-slate-800/50 rounded-full w-20 h-20 mx-auto flex items-center justify-center">
                          <Upload className="w-8 h-8 text-violet-400" />
                        </div>
                        <div>
                          <p className="text-lg font-medium text-white mb-2">
                            Drop your screenshot here
                          </p>
                          <p className="text-sm text-slate-400">
                            or click to browse • PNG, JPG, WebP up to 10MB
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {inputMethod === 'select' && (
                  <ImageFileManagerModal
                    onFileSelect={handleStoredImageSelect}
                    selectedFile={selectedStoredFile}
                    preview={preview}
                  />
                )}

                {/* Action Buttons */}
                {(selectedFile || selectedStoredFile) && (
                  <div className="space-y-4">
                    {/* Credit cost information */}
                    <div className="flex items-center justify-center gap-2 text-sm text-slate-400 bg-slate-800/30 rounded-lg p-3">
                      <Sparkles className="w-4 h-4 text-violet-400" />
                      <span>UI Analysis will use approximately <strong className="text-white">{estimatedCredits} AI credits</strong></span>
                    </div>
                    
                    <div className="flex justify-center gap-3">
                      <button
                        onClick={resetModal}
                        className="px-6 py-2 text-slate-400 hover:text-white transition-colors"
                      >
                        Clear
                      </button>
                      <motion.button
                        onClick={analyzeImage}
                        disabled={!isProviderConfigured(currentProvider)}
                        className={`px-8 py-3 rounded-lg text-white font-medium flex items-center gap-2 transition-all ${
                          isProviderConfigured(currentProvider)
                            ? 'bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700'
                            : 'bg-slate-600 cursor-not-allowed'
                        }`}
                        whileHover={isProviderConfigured(currentProvider) ? { scale: 1.02 } : {}}
                        whileTap={isProviderConfigured(currentProvider) ? { scale: 0.98 } : {}}
                      >
                        <Sparkles className="w-4 h-4" />
                        {isProviderConfigured(currentProvider) 
                          ? `Analyze & Generate (${estimatedCredits} credits)`
                          : 'Provider Not Configured'
                        }
                      </motion.button>
                    </div>
                    
                    {!isProviderConfigured(currentProvider) && (
                      <div className="flex items-center justify-center gap-2 text-sm text-orange-400 bg-orange-500/10 rounded-lg p-3">
                        <AlertCircle className="w-4 h-4" />
                        <span>Please configure your AI provider in settings before analyzing images</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {step === 'analyzing' && (
              <div className="flex flex-col items-center justify-center py-12 space-y-6">
                <div className="relative">
                  <motion.div
                    className="w-16 h-16 border-4 border-violet-500/30 border-t-violet-500 rounded-full"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  />
                  <motion.div
                    className="absolute inset-2 bg-violet-500/20 rounded-full flex items-center justify-center"
                    animate={{ scale: [1, 1.1, 1] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  >
                    <Zap className="w-6 h-6 text-violet-400" />
                  </motion.div>
                </div>
                <div className="text-center">
                  <h3 className="text-xl font-semibold text-white mb-2">Analyzing Your Design</h3>
                  <p className="text-slate-400">AI is examining the image and generating components...</p>
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <motion.div
                    className="w-2 h-2 bg-violet-400 rounded-full"
                    animate={{ opacity: [0, 1, 0] }}
                    transition={{ duration: 1, repeat: Infinity, delay: 0 }}
                  />
                  <motion.div
                    className="w-2 h-2 bg-violet-400 rounded-full"
                    animate={{ opacity: [0, 1, 0] }}
                    transition={{ duration: 1, repeat: Infinity, delay: 0.2 }}
                  />
                  <motion.div
                    className="w-2 h-2 bg-violet-400 rounded-full"
                    animate={{ opacity: [0, 1, 0] }}
                    transition={{ duration: 1, repeat: Infinity, delay: 0.4 }}
                  />
                </div>
              </div>
            )}

            {step === 'results' && analysisResult && (
              <div className="space-y-6">
                {/* Analysis Metadata */}
                <div className="flex items-center justify-between p-3 bg-slate-800/30 rounded-lg">
                  <div className="flex items-center gap-4 text-sm text-slate-400">
                    <span>Provider: <span className="text-white">{currentProvider.charAt(0).toUpperCase() + currentProvider.slice(1)}</span></span>
                    {selectedLLMModel && (
                      <span>Model: <span className="text-white">{selectedLLMModel.name}</span></span>
                    )}
                    {analysisResult.metadata?.responseTime && (
                      <span>Time: <span className="text-white">{analysisResult.metadata.responseTime}</span></span>
                    )}
                  </div>
                  {analysisResult.metadata?.creditsUsed && (
                    <Badge variant="outline" className="text-violet-400 border-violet-400/50">
                      {analysisResult.metadata.creditsUsed} credits used
                    </Badge>
                  )}
                </div>
                
                {/* Analysis Summary */}
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                      <Eye className="w-5 h-5 text-violet-400" />
                      Analysis Results
                    </h3>
                    
                    <div className="space-y-3">
                      <div className="p-4 bg-slate-800/50 rounded-lg">
                        <h4 className="font-medium text-white mb-2">Detected Components</h4>
                        <div className="space-y-1">
                          {analysisResult.analysis.components.map((comp, index) => (
                            <div key={index} className="text-sm text-slate-300">
                              <span className="font-medium text-violet-400">{comp.type}:</span> {comp.description}
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="p-4 bg-slate-800/50 rounded-lg">
                        <h4 className="font-medium text-white mb-2">Color Palette</h4>
                        <div className="flex gap-2 flex-wrap">
                          {(() => {
                            const palette = analysisResult.analysis.colorPalette;
                            // Handle both array format and object format
                            if (Array.isArray(palette)) {
                              return palette.map((color, index) => (
                                <div
                                  key={index}
                                  className="w-8 h-8 rounded-full border border-slate-600"
                                  style={{ backgroundColor: color }}
                                  title={color}
                                />
                              ));
                            } else if (palette && typeof palette === 'object') {
                              // Handle object format with properties like primary, secondary, etc.
                              return Object.entries(palette).map(([name, color]) => {
                                if (Array.isArray(color)) {
                                  // Handle additional colors array
                                  return color.map((c, i) => (
                                    <div
                                      key={`${name}-${i}`}
                                      className="w-8 h-8 rounded-full border border-slate-600"
                                      style={{ backgroundColor: c }}
                                      title={`${name}: ${c}`}
                                    />
                                  ));
                                }
                                return (
                                  <div
                                    key={name}
                                    className="w-8 h-8 rounded-full border border-slate-600"
                                    style={{ backgroundColor: color as string }}
                                    title={`${name}: ${color}`}
                                  />
                                );
                              }).flat();
                            }
                            return null;
                          })()}
                        </div>
                      </div>

                      <div className="p-4 bg-slate-800/50 rounded-lg">
                        <h4 className="font-medium text-white mb-2">Layout & Complexity</h4>
                        <div className="text-sm text-slate-300 space-y-1">
                          <div>
                            <span className="text-violet-400">Layout:</span> {
                              typeof analysisResult.analysis.layout === 'object' 
                                ? analysisResult.analysis.layout.system || 'Unknown'
                                : analysisResult.analysis.layout
                            }
                          </div>
                          {typeof analysisResult.analysis.layout === 'object' && analysisResult.analysis.layout.structure && (
                            <div>
                              <span className="text-violet-400">Structure:</span> {analysisResult.analysis.layout.structure}
                            </div>
                          )}
                          {typeof analysisResult.analysis.layout === 'object' && analysisResult.analysis.layout.responsive && (
                            <div>
                              <span className="text-violet-400">Responsive:</span> {analysisResult.analysis.layout.responsive}
                            </div>
                          )}
                          <div><span className="text-violet-400">Complexity:</span> {analysisResult.analysis.estimatedComplexity}</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                      <Code className="w-5 h-5 text-violet-400" />
                      Generated Code
                    </h3>
                    
                    <div className="relative">
                      <pre className="p-4 bg-slate-800/80 rounded-lg text-sm text-slate-300 overflow-x-auto max-h-80 border border-slate-700/50">
                        <code>{analysisResult.generatedCode}</code>
                      </pre>
                      
                      <div className="absolute top-2 right-2 flex gap-1">
                        <button
                          onClick={() => copyToClipboard(analysisResult.generatedCode)}
                          className="p-2 bg-slate-700/80 hover:bg-slate-600/80 rounded-md transition-colors"
                          title="Copy to clipboard"
                        >
                          <Copy className="w-4 h-4 text-slate-300" />
                        </button>
                        <button
                          onClick={downloadCode}
                          className="p-2 bg-slate-700/80 hover:bg-slate-600/80 rounded-md transition-colors"
                          title="Download file"
                        >
                          <Download className="w-4 h-4 text-slate-300" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Enhanced Action Buttons */}
                <div className="flex justify-center gap-3 pt-4">
                  <button
                    onClick={resetModal}
                    className="px-6 py-2 text-slate-400 hover:text-white transition-colors"
                  >
                    Analyze Another
                  </button>
                  <button
                    onClick={() => {
                      copyToClipboard(JSON.stringify(analysisResult.analysis, null, 2));
                      toast.success('Analysis data copied to clipboard');
                    }}
                    className="px-6 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors flex items-center gap-2"
                  >
                    <Copy className="w-4 h-4" />
                    Copy Analysis
                  </button>
                  <motion.button
                    onClick={handleClose}
                    className="px-8 py-3 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 rounded-lg text-white font-medium transition-all"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    Done
                  </motion.button>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default CloneUIModal; 