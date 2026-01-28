"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { login } from "@/lib/login";
import { setToken } from "@/lib/auth";
import { getErrorMessage } from "@/lib/api";
import { validateEmail } from "@/lib/validation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  
  const usernameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  function validateEmailField() {
    const email = usernameRef.current?.value ?? "";
    const result = validateEmail(email);
    setEmailError(result.isValid ? null : result.error ?? null);
    return result.isValid;
  }

  function validatePasswordField() {
    const password = passwordRef.current?.value ?? "";
    if (!password) {
      setPasswordError("Password is required");
      return false;
    }
    setPasswordError(null);
    return true;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    
    // Validate all fields
    const emailValid = validateEmailField();
    const passwordValid = validatePasswordField();
    
    if (!emailValid || !passwordValid) {
      return;
    }

    setLoading(true);
    
    // Read directly from DOM to handle browser autofill
    const username = usernameRef.current?.value ?? "";
    const password = passwordRef.current?.value ?? "";
    
    try {
      const data = await login(username, password);
      setToken(data.access_token);
      router.push("/assets");
    } catch (e: unknown) {
      setErr(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
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

      <Card className="w-full max-w-md relative z-10 shadow-2xl border-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl animate-scale-in">
        {/* Subtle gradient border effect */}
        <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-blue-500/20 via-transparent to-indigo-500/20 pointer-events-none" />
        
        <CardHeader className="text-center pb-2 relative">
          {/* Logo/Icon */}
          <div className="mx-auto mb-4 w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/30 animate-float">
            <svg
              className="w-8 h-8 text-white"
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
            Sign in to manage your assets
          </p>
        </CardHeader>
        <CardContent className="pt-4">
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Email
              </label>
              <Input
                ref={usernameRef}
                name="email"
                type="email"
                placeholder="you@example.com"
                autoComplete="email"
                onBlur={validateEmailField}
                className={`h-11 transition-all duration-200 ${
                  emailError 
                    ? "border-red-500 focus:ring-red-500/20" 
                    : "focus:ring-blue-500/20 focus:border-blue-500"
                }`}
              />
              {emailError && (
                <p className="text-xs text-red-600 animate-in fade-in slide-in-from-top-1 duration-200">
                  {emailError}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Password
              </label>
              <Input
                ref={passwordRef}
                name="password"
                type="password"
                placeholder="Enter your password"
                autoComplete="current-password"
                onBlur={validatePasswordField}
                className={`h-11 transition-all duration-200 ${
                  passwordError 
                    ? "border-red-500 focus:ring-red-500/20" 
                    : "focus:ring-blue-500/20 focus:border-blue-500"
                }`}
              />
              {passwordError && (
                <p className="text-xs text-red-600 animate-in fade-in slide-in-from-top-1 duration-200">
                  {passwordError}
                </p>
              )}
            </div>
            {err && (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg animate-in fade-in shake duration-200">
                <p className="text-sm text-red-600 dark:text-red-400 text-center">{err}</p>
              </div>
            )}
            <Button 
              className="w-full h-11 btn-primary-gradient text-white font-medium active-scale" 
              disabled={loading}
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Signing in...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  Sign in
                  <svg className="w-4 h-4 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </span>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
