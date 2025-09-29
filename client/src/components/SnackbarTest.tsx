import React from 'react';
import { useSnackbar } from './SnackbarProvider';
import { useToast } from '../hooks/use-toast';
import { toast } from 'sonner';
import { CheckCircle, AlertCircle, Info, Sparkles } from 'lucide-react';

/**
 * Test component to demonstrate the difference between:
 * 1. Snackbars (action confirmations) - bottom-center, simple, auto-dismiss
 * 2. Intelligent Toasts (AI insights) - top-right, complex, branded
 */
export const SnackbarTest: React.FC = () => {
  const snackbar = useSnackbar();
  const { toast: customToast } = useToast();

  const testSnackbarSuccess = () => {
    snackbar.show("Settings saved successfully!", "success");
  };

  const testSnackbarError = () => {
    snackbar.show("Could not save settings.", "error");
  };

  const testSnackbarInfo = () => {
    snackbar.show("New feature available!", "info");
  };

  const testIntelligentToast = () => {
    // This simulates an AI Coach insight
    toast("🧠 AI Coach Insight", {
      description: "Consider switching to a more efficient model for your current task. This could improve response time by 40%.",
      duration: 8000,
      action: {
        label: "Show me",
        onClick: () => console.log("Show optimization details")
      }
    });
  };

  const testCustomToast = () => {
    customToast({
      title: "Custom Toast",
      description: "This is a custom toast using the existing system",
      duration: 5000
    });
  };

  return (
    <div className="p-6 bg-slate-900 rounded-lg border border-slate-700">
      <h3 className="text-lg font-semibold text-white mb-4">Notification System Test</h3>
      
      <div className="space-y-4">
        <div>
          <h4 className="text-sm font-medium text-slate-300 mb-2">Snackbars (Action Confirmations)</h4>
          <p className="text-xs text-slate-400 mb-3">Bottom-center, simple, auto-dismiss after 3 seconds</p>
          <div className="flex gap-2">
            <button
              onClick={testSnackbarSuccess}
              className="px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded text-sm flex items-center gap-2"
            >
              <CheckCircle className="w-4 h-4" />
              Success
            </button>
            <button
              onClick={testSnackbarError}
              className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded text-sm flex items-center gap-2"
            >
              <AlertCircle className="w-4 h-4" />
              Error
            </button>
            <button
              onClick={testSnackbarInfo}
              className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm flex items-center gap-2"
            >
              <Info className="w-4 h-4" />
              Info
            </button>
          </div>
        </div>

        <div>
          <h4 className="text-sm font-medium text-slate-300 mb-2">Intelligent Toasts (AI Insights)</h4>
          <p className="text-xs text-slate-400 mb-3">Top-right, complex, branded with AI Coach icon</p>
          <div className="flex gap-2">
            <button
              onClick={testIntelligentToast}
              className="px-3 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded text-sm flex items-center gap-2"
            >
              <Sparkles className="w-4 h-4" />
              AI Insight
            </button>
            <button
              onClick={testCustomToast}
              className="px-3 py-2 bg-slate-600 hover:bg-slate-700 text-white rounded text-sm flex items-center gap-2"
            >
              Custom Toast
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
