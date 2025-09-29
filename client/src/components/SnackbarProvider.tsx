import React, { useState, useCallback, useContext, createContext, ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle, AlertCircle, Info } from 'lucide-react';

// --- TYPES ---
type SnackbarType = 'success' | 'error' | 'info';

interface SnackbarMessage {
  id: number;
  message: string;
  type: SnackbarType;
}

interface SnackbarContextType {
  show: (message: string, type?: SnackbarType) => void;
}

// --- CONTEXT ---
const SnackbarContext = createContext<SnackbarContextType | undefined>(undefined);

// --- PROVIDER COMPONENT ---
export const SnackbarProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [messages, setMessages] = useState<SnackbarMessage[]>([]);

  const show = useCallback((message: string, type: SnackbarType = 'success') => {
    const id = Date.now();
    const newMessage: SnackbarMessage = { id, message, type };
    setMessages([newMessage]); // Replace any existing message with the new one

    setTimeout(() => {
      setMessages((currentMessages) => currentMessages.filter((msg) => msg.id !== id));
    }, 3000); // Auto-dismiss after 3 seconds
  }, []);

  const getIcon = (type: SnackbarType) => {
    switch (type) {
      case 'success':
        return <CheckCircle className="h-5 w-5 text-green-400" />;
      case 'error':
        return <AlertCircle className="h-5 w-5 text-red-400" />;
      case 'info':
        return <Info className="h-5 w-5 text-blue-400" />;
    }
  };

  return (
    <SnackbarContext.Provider value={{ show }}>
      {children}
      <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[9999] flex flex-col items-center gap-2 pointer-events-none">
        <AnimatePresence>
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.9 }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
              layout
              className="flex items-center gap-3 px-4 py-2 bg-slate-800 text-white rounded-full shadow-lg border border-slate-700 text-sm font-medium pointer-events-auto"
            >
              {getIcon(msg.type)}
              <span>{msg.message}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </SnackbarContext.Provider>
  );
};

// --- HOOK ---
export const useSnackbar = (): SnackbarContextType => {
  const context = useContext(SnackbarContext);
  if (context === undefined) {
    throw new Error('useSnackbar must be used within a SnackbarProvider');
  }
  return context;
};
