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
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-500/20 rounded-full blur-3xl animate-pulse" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-indigo-500/20 rounded-full blur-3xl animate-pulse delay-1000" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl animate-pulse delay-500" />
      </div>

      <Card className="w-full max-w-md relative z-10 shadow-2xl border-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm animate-in fade-in slide-in-from-bottom-4 duration-500">
        <CardHeader className="text-center pb-2">
          {/* Logo/Icon */}
          <div className="mx-auto mb-4 w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/30 animate-in zoom-in duration-300">
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
          <CardTitle className="text-2xl font-bold bg-gradient-to-r from-slate-800 to-slate-600 dark:from-white dark:to-slate-300 bg-clip-text text-transparent">
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
              className="w-full h-11 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-medium shadow-lg shadow-blue-500/25 transition-all duration-200 hover:shadow-xl hover:shadow-blue-500/30 hover:-translate-y-0.5" 
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
                "Sign in"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
