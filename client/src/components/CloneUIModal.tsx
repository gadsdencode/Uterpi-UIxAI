import React, { useState, useCallback } from 'react';
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
  FolderOpen
} from 'lucide-react';
import { useFileManager, type FileItem } from '../hooks/useFileManager';
import { toast } from 'sonner';

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
}

interface ImageFileManagerModalProps {
  onFileSelect: (file: FileItem) => void;
  selectedFile: FileItem | null;
  preview: string | null;
}

const ImageFileManagerModal: React.FC<ImageFileManagerModalProps> = ({ onFileSelect, selectedFile, preview }) => {
  const fileManager = useFileManager();
  const [searchQuery, setSearchQuery] = useState('');
  
  // Filter for image files only
  const { data: fileList, isLoading } = fileManager.useFileList({
    search: searchQuery || undefined,
    mimeType: 'image/',
    limit: 20
  });

  const imageFiles = fileList?.files.filter(file => 
    file.mimeType.startsWith('image/')
  ) || [];

  return (
    <div className="space-y-4">
      <div className="relative">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search your images..."
          className="w-full p-3 bg-slate-800/50 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:border-violet-400 focus:outline-none"
        />
      </div>

      {preview && selectedFile && (
        <div className="p-4 bg-slate-800/50 border border-violet-400 rounded-lg">
          <div className="flex items-center space-x-4">
            <img
              src={preview}
              alt="Selected"
              className="w-16 h-16 object-cover rounded"
            />
            <div>
              <h3 className="font-medium text-violet-400">{selectedFile.name}</h3>
              <p className="text-sm text-slate-400">
                {(selectedFile.size / 1024).toFixed(1)} KB • {selectedFile.mimeType}
              </p>
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
          <div className="p-8 text-center text-slate-400">
            <ImageIcon className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No images found</p>
            <p className="text-sm">Upload some images first</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 p-4">
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
                <div className="aspect-square bg-slate-800">
                  {/* We'll need to handle image preview differently for stored files */}
                  <div className="w-full h-full flex items-center justify-center">
                    <ImageIcon className="w-8 h-8 text-slate-400" />
                  </div>
                </div>
                <div className="absolute bottom-0 left-0 right-0 bg-black/75 p-2">
                  <p className="text-xs text-white truncate">{file.name}</p>
                  <p className="text-xs text-slate-300">
                    {(file.size / 1024).toFixed(1)} KB
                  </p>
                </div>
                {selectedFile?.id === file.id && (
                  <div className="absolute top-2 right-2">
                    <Check className="w-4 h-4 text-violet-400" />
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
  
  const fileManager = useFileManager();

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
    if (!selectedFile) return;

    setStep('analyzing');

    const formData = new FormData();
    formData.append('image', selectedFile);
    
    // Get the current AI provider from localStorage
    const provider = localStorage.getItem('current-ai-provider') || 'gemini';
    formData.append('provider', provider);
    
    // Add API keys if needed
    if (provider === 'gemini') {
      const apiKey = localStorage.getItem('gemini-api-key');
      if (apiKey) formData.append('apiKey', apiKey);
    } else if (provider === 'openai') {
      const apiKey = localStorage.getItem('openai-api-key');
      if (apiKey) formData.append('apiKey', apiKey);
    }

    try {
      const response = await fetch('/api/clone-ui/analyze', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const result: GenerationResult = await response.json();
        setAnalysisResult(result);
        setStep('results');
      } else {
        throw new Error('Analysis failed');
      }
    } catch (error) {
      console.error('Analysis error:', error);
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
                  <div className="flex justify-center gap-3">
                    <button
                      onClick={resetModal}
                      className="px-6 py-2 text-slate-400 hover:text-white transition-colors"
                    >
                      Clear
                    </button>
                    <motion.button
                      onClick={analyzeImage}
                      className="px-8 py-3 bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 rounded-lg text-white font-medium flex items-center gap-2 transition-all"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <Sparkles className="w-4 h-4" />
                      Analyze & Generate
                    </motion.button>
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

                {/* Action Buttons */}
                <div className="flex justify-center gap-3 pt-4">
                  <button
                    onClick={resetModal}
                    className="px-6 py-2 text-slate-400 hover:text-white transition-colors"
                  >
                    Upload Another
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