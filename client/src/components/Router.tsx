import React, { useEffect, useState } from 'react';
import App from '../App';
import { ResetPasswordForm } from './auth/ResetPasswordForm';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { AlertCircle } from 'lucide-react';

interface RouteState {
  path: string;
  token?: string;
}

export function Router() {
  const [route, setRoute] = useState<RouteState>({ path: '/' });

  useEffect(() => {
    const handlePopState = () => {
      updateRoute();
    };

    const updateRoute = () => {
      const path = window.location.pathname;
      const params = new URLSearchParams(window.location.search);
      const token = params.get('token');

      setRoute({ path, token: token || undefined });
    };

    // Initial route setup
    updateRoute();

    // Listen for navigation events
    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  const navigateToLogin = () => {
    window.history.pushState({}, '', '/');
    setRoute({ path: '/' });
  };

  // Handle reset password page
  if (route.path === '/reset-password') {
    if (!route.token) {
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
          token={route.token}
          onSuccess={navigateToLogin}
          onBackToLogin={navigateToLogin}
        />
      </div>
    );
  }

  // Default to main app
  return <App />;
} 