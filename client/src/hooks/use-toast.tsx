import { toast as sonnerToast } from 'sonner';

interface ToastOptions {
  title?: string;
  description?: string;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export const useToast = () => {
  const toast = (options: ToastOptions) => {
    const { title, description, duration, action } = options;
    
    sonnerToast(title || '', {
      description,
      duration: duration || 5000,
      action: action ? {
        label: action.label,
        onClick: action.onClick,
      } : undefined,
    });
  };

  return { toast };
};
