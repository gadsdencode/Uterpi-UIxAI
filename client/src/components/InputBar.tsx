import React, { useState } from 'react';
import { Send, Paperclip, Mic, Files } from 'lucide-react';
import { FileManager } from './FileManager';

const InputBar: React.FC = () => {
  const [text, setText] = React.useState('');
  const [showFileManager, setShowFileManager] = useState(false);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  };

  return (
    <div className="p-4 bg-background border-t border-border">
      <div className="relative max-w-4xl mx-auto">
        <div className="flex items-end bg-secondary rounded-xl p-2">
          <button 
            onClick={() => setShowFileManager(true)}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors" 
            title="Open File Manager"
          >
            <Files className="w-5 h-5" />
          </button>
          <button className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors" title="Upload a file">
            <Paperclip className="w-5 h-5" />
          </button>
          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleInput}
            placeholder="Type your message or upload a file..."
            rows={1}
            className="flex-1 bg-transparent resize-none outline-none text-base placeholder:text-muted-foreground px-3 py-2 max-h-48"
          />
          <button className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors" title="Record audio">
            <Mic className="w-5 h-5" />
          </button>
          <button className="p-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ml-2" disabled={!text.trim()} title="Send message">
            <Send className="w-5 h-5" />
          </button>
        </div>
        <p className="text-xs text-center text-muted-foreground mt-2">
          AI can make mistakes. Consider checking important information.
        </p>
      </div>

      {/* File Manager Modal */}
      {showFileManager && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-background rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="text-xl font-semibold">File Manager</h2>
              <button
                onClick={() => setShowFileManager(false)}
                className="p-2 hover:bg-accent rounded-lg transition-colors"
                title="Close File Manager"
              >
                ✕
              </button>
            </div>
            <div className="p-4 max-h-[calc(90vh-80px)] overflow-auto">
              <FileManager />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InputBar;
