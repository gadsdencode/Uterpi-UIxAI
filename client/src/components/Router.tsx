// client/src/components/Router.tsx
// Main application router using react-router-dom

import React from 'react';
import { 
  BrowserRouter, 
  Routes, 
  Route, 
  Navigate,
  useNavigate,
  useSearchParams
} from 'react-router-dom';
import { AuthProvider, useAuth } from '../hooks/useAuth';
import { Toaster } from './ui/sonner';
import { SnackbarProvider } from './SnackbarProvider';

// Views
import App from '../App';
import { DashboardView, TeamsView } from './views';
import PricingPage from './PricingPage';
import { CheckoutSuccessPage, CheckoutCancelPage } from './CheckoutPages';
import { ResetPasswordForm } from './auth/ResetPasswordForm';
import { SubscriptionPage } from './SubscriptionPage';

// Components
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { AlertCircle } from 'lucide-react';

/**
 * Protected route wrapper - redirects to login if not authenticated
 */
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-violet-500" />
      </div>
    );
  }
  
  if (!user) {
    return <Navigate to="/" replace />;
  }
  
  return <>{children}</>;
};

/**
 * Reset password page component with token validation
 */
const ResetPasswordPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');

  const navigateToLogin = () => {
    navigate('/');
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-4">
        <Card className="w-full max-w-md mx-auto bg-slate-900 border-slate-700">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
              <AlertCircle className="h-8 w-8 text-red-600" />
            </div>
            <CardTitle className="text-white">Invalid Reset Link</CardTitle>
            <CardDescription className="text-slate-400">
              This password reset link is missing or invalid.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={navigateToLogin} className="w-full">
              Back to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-4">
      <ResetPasswordForm
        token={token}
        onSuccess={navigateToLogin}
        onBackToLogin={navigateToLogin}
      />
    </div>
  );
};

/**
 * Main App routes wrapped in a layout
 */
const AppRoutes: React.FC = () => {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/" element={
        <SnackbarProvider>
          <App />
        </SnackbarProvider>
      } />
      <Route path="/pricing" element={<PricingPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      
      {/* Checkout routes */}
      <Route path="/checkout/success" element={<CheckoutSuccessPage />} />
      <Route path="/checkout/cancel" element={<CheckoutCancelPage />} />
      
      {/* Protected routes */}
      <Route path="/chat" element={
        <ProtectedRoute>
          <SnackbarProvider>
            <App />
          </SnackbarProvider>
        </ProtectedRoute>
      } />
      
      <Route path="/dashboard" element={
        <ProtectedRoute>
          <DashboardView />
        </ProtectedRoute>
      } />
      
      <Route path="/teams" element={
        <ProtectedRoute>
          <TeamsView />
        </ProtectedRoute>
      } />
      
      <Route path="/subscription" element={
        <ProtectedRoute>
          <SubscriptionPage />
        </ProtectedRoute>
      } />
      
      {/* Catch all - redirect to home */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

/**
 * Navigation utility hook for use outside of Router context
 */
export const useAppNavigate = () => {
  const navigate = useNavigate();
  return {
    navigateTo: (path: string) => navigate(path),
    goBack: () => navigate(-1),
  };
};

/**
 * Legacy navigation utility for backwards compatibility
 * @deprecated Use useAppNavigate hook or Link component instead
 */
export const navigateTo = (path: string) => {
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
};

/**
 * Main Router component
 */
export function Router() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
        <Toaster />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default Router;
