"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Unhandled error:", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50 to-indigo-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-800 flex items-center justify-center px-4">
      <Card className="max-w-md w-full shadow-xl border-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-lg text-slate-800 dark:text-white">Something went wrong</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            An unexpected error occurred. You can try again or go back to the dashboard.
          </p>
          <div className="flex gap-2">
            <Button onClick={() => reset()}>Try Again</Button>
            <Button variant="outline" onClick={() => (window.location.href = "/assets")}>
              Go to Assets
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
