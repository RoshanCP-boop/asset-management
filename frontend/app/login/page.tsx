"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function LoginPage() {
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Check for error in URL params
    const errorParam = searchParams.get("error");
    if (errorParam) {
      const errorMessages: Record<string, string> = {
        auth_failed: "Authentication failed. Please try again.",
        no_user_info: "Could not get user info from Google.",
        no_email: "No email provided by Google.",
        account_disabled: "Your account has been disabled.",
      };
      setError(errorMessages[errorParam] || "An error occurred. Please try again.");
    }
  }, [searchParams]);

  function handleGoogleLogin() {
    setLoading(true);
    // Redirect to backend Google OAuth endpoint
    window.location.href = `${API_URL}/auth/google`;
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 relative overflow-hidden">
      {/* Animated mesh gradient background */}
      <div className="absolute inset-0 overflow-hidden">
        {/* Morphing gradient blobs */}
        <div className="absolute -top-40 -right-40 w-[500px] h-[500px] bg-gradient-to-br from-blue-500/30 to-cyan-500/20 blur-3xl animate-morph animate-drift" />
        <div className="absolute -bottom-40 -left-40 w-[500px] h-[500px] bg-gradient-to-tr from-indigo-500/30 to-purple-500/20 blur-3xl animate-morph delay-500" style={{ animationDirection: 'reverse' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-to-r from-cyan-500/15 to-blue-500/15 blur-3xl animate-pulse-soft delay-300" />
        <div className="absolute top-10 left-1/4 w-80 h-80 bg-gradient-to-br from-purple-500/20 to-pink-500/10 blur-3xl animate-morph delay-700" />
        <div className="absolute bottom-10 right-1/4 w-96 h-96 bg-gradient-to-tl from-teal-500/15 to-emerald-500/10 blur-3xl animate-drift delay-300" style={{ animationDirection: 'reverse' }} />
        
        {/* Grid overlay */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:60px_60px]" />
        
        {/* Twinkling stars */}
        <div className="absolute top-[8%] left-[12%] w-1 h-1 bg-white/60 rounded-full animate-twinkle" />
        <div className="absolute top-[15%] right-[18%] w-1.5 h-1.5 bg-white/50 rounded-full animate-twinkle delay-300" />
        <div className="absolute top-[22%] left-[28%] w-1 h-1 bg-white/70 rounded-full animate-twinkle delay-700" />
        <div className="absolute top-[12%] left-[55%] w-1 h-1 bg-white/50 rounded-full animate-twinkle delay-500" />
        <div className="absolute top-[30%] right-[25%] w-1 h-1 bg-white/60 rounded-full animate-twinkle delay-200" />
        <div className="absolute top-[5%] right-[40%] w-1.5 h-1.5 bg-white/40 rounded-full animate-twinkle delay-1000" />
        
        {/* Floating orbs with drift */}
        <div className="absolute top-[40%] left-[5%] w-3 h-3 bg-blue-400/40 rounded-full animate-drift blur-[1px]" />
        <div className="absolute top-[35%] right-[8%] w-4 h-4 bg-indigo-400/30 rounded-full animate-drift delay-500 blur-[1px]" />
        <div className="absolute top-[60%] left-[15%] w-2.5 h-2.5 bg-cyan-400/35 rounded-full animate-float-rotate delay-300" />
        <div className="absolute top-[50%] right-[20%] w-3 h-3 bg-purple-400/30 rounded-full animate-float-rotate delay-700" />
        
        {/* Bottom floating particles */}
        <div className="absolute bottom-[25%] left-[22%] w-2 h-2 bg-blue-400/50 rounded-full animate-float delay-150" />
        <div className="absolute bottom-[20%] right-[12%] w-3 h-3 bg-teal-400/40 rounded-full animate-drift delay-500" />
        <div className="absolute bottom-[30%] left-[8%] w-2.5 h-2.5 bg-indigo-400/35 rounded-full animate-float-rotate delay-700" />
        <div className="absolute bottom-[15%] right-[35%] w-2 h-2 bg-cyan-300/45 rounded-full animate-twinkle delay-200" />
        <div className="absolute bottom-[35%] left-[40%] w-1.5 h-1.5 bg-purple-400/40 rounded-full animate-float delay-300" />
        <div className="absolute bottom-[8%] left-[30%] w-2 h-2 bg-blue-400/35 rounded-full animate-drift delay-100" />
        <div className="absolute bottom-[42%] right-[6%] w-3.5 h-3.5 bg-indigo-300/25 rounded-full animate-float-rotate delay-500" />
        
        {/* Additional twinkling stars at bottom */}
        <div className="absolute bottom-[18%] left-[18%] w-1 h-1 bg-white/50 rounded-full animate-twinkle delay-300" />
        <div className="absolute bottom-[12%] right-[22%] w-1 h-1 bg-white/60 rounded-full animate-twinkle delay-700" />
        <div className="absolute bottom-[28%] right-[45%] w-1.5 h-1.5 bg-white/40 rounded-full animate-twinkle delay-500" />
      </div>

      <div className="relative z-10 w-full max-w-md animate-scale-in">
        {/* Welcome text above card */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">Welcome</h1>
          <p className="text-blue-200/80">Your company&apos;s asset management portal</p>
        </div>

        <Card className="shadow-2xl border-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl">
          {/* Subtle gradient border effect */}
          <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-blue-500/20 via-transparent to-indigo-500/20 pointer-events-none" />
          
          <CardHeader className="text-center pb-2 relative">
            {/* Logo/Icon */}
            <div className="mx-auto mb-4 w-20 h-20 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/30 animate-float">
              <svg
                className="w-10 h-10 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                />
              </svg>
            </div>
            <CardTitle className="text-2xl font-bold text-gradient">
              Asset Manager
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Track, manage, and organize your assets
            </p>
          </CardHeader>
          <CardContent className="pt-4 pb-8">
            <div className="space-y-6">
              {error && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg animate-in fade-in duration-200">
                  <p className="text-sm text-red-600 dark:text-red-400 text-center">{error}</p>
                </div>
              )}
              
              <Button 
                onClick={handleGoogleLogin}
                disabled={loading}
                className="w-full h-12 bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 shadow-sm font-medium active-scale flex items-center justify-center gap-3"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin h-5 w-5 text-gray-500" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Redirecting...
                  </span>
                ) : (
                  <>
                    {/* Google Logo */}
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                      <path
                        fill="#4285F4"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      />
                    </svg>
                    Sign in with Google
                  </>
                )}
              </Button>

              {/* Divider */}
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-200 dark:border-gray-700" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-white dark:bg-slate-900 px-3 text-gray-500">Secure login powered by Google</span>
                </div>
              </div>

              {/* Feature highlights */}
              <div className="grid grid-cols-3 gap-3 pt-2">
                <div className="text-center">
                  <div className="w-10 h-10 mx-auto mb-2 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center">
                    <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-400 font-medium">Secure</p>
                </div>
                <div className="text-center">
                  <div className="w-10 h-10 mx-auto mb-2 rounded-lg bg-green-50 dark:bg-green-900/30 flex items-center justify-center">
                    <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-400 font-medium">Fast</p>
                </div>
                <div className="text-center">
                  <div className="w-10 h-10 mx-auto mb-2 rounded-lg bg-purple-50 dark:bg-purple-900/30 flex items-center justify-center">
                    <svg className="w-5 h-5 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-400 font-medium">Trackable</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Footer text */}
        <p className="text-xs text-center text-blue-200/60 mt-6">
          By signing in, you agree to our terms of service
        </p>
      </div>
    </div>
  );
}
