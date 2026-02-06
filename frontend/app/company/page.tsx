"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, getErrorMessage } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import Link from "next/link";

type DashboardData = {
  organization: {
    id: number;
    name: string;
    logo_url: string | null;
    employee_id_prefix: string | null;
  };
  totals: {
    users: number;
    assets: number;
    hardware: number;
    software: number;
  };
  status_breakdown: Record<string, number>;
  condition_breakdown: Record<string, number>;
  needs_data_wipe: number;
  warranty_expiring_soon: Array<{
    id: number;
    asset_tag: string;
    category: string | null;
    model: string | null;
    warranty_end: string;
  }>;
  renewals_coming_soon: Array<{
    id: number;
    asset_tag: string;
    subscription: string | null;
    renewal_date: string;
    seats_total: number | null;
    seats_used: number | null;
  }>;
  category_breakdown: Array<{ category: string; count: number }>;
};

type CurrentUser = {
  id: number;
  role: string;
};

export default function CompanyDashboardPage() {
  const router = useRouter();
  const token = getToken();

  const [data, setData] = useState<DashboardData | null>(null);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit mode
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editPrefix, setEditPrefix] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);

  const isAdmin = currentUser?.role === "ADMIN";
  
  // Get proper logo URL (handle relative API paths)
  const getLogoUrl = (url: string | null) => {
    if (!url) return null;
    if (url.startsWith("/api/")) {
      // It's a relative API path, prepend the API base URL
      const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      return `${apiBase}${url}`;
    }
    return url;
  };

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    if (!token) {
      router.push("/login");
      return;
    }

    try {
      const [dashboardData, userData] = await Promise.all([
        apiFetch<DashboardData>("/organization/dashboard", {}, token),
        apiFetch<CurrentUser>("/auth/me", {}, token),
      ]);
      setData(dashboardData);
      setCurrentUser(userData);
      setEditName(dashboardData.organization.name);
      setEditPrefix(dashboardData.organization.employee_id_prefix || "");
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function saveSettings() {
    if (!token) return;
    setSaving(true);
    try {
      await apiFetch("/organization/current", {
        method: "PUT",
        body: JSON.stringify({
          name: editName,
          employee_id_prefix: editPrefix || null,
        }),
      }, token);
      await loadData();
      setEditing(false);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function uploadLogo(file: File) {
    if (!token) return;
    
    // Validate file type
    const allowedTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'];
    if (!allowedTypes.includes(file.type)) {
      setLogoError("Invalid file type. Please use PNG, JPG, GIF, WebP, or SVG.");
      return;
    }
    
    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      setLogoError("File too large. Maximum size is 5MB.");
      return;
    }

    setUploadingLogo(true);
    setLogoError(null);
    
    try {
      const formData = new FormData();
      formData.append("file", file);
      
      const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const response = await fetch(`${apiBase}/organization/logo`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
        },
        body: formData,
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || "Failed to upload logo");
      }
      
      await loadData();
    } catch (err) {
      setLogoError(getErrorMessage(err));
    } finally {
      setUploadingLogo(false);
    }
  }

  async function deleteLogo() {
    if (!token) return;
    
    setUploadingLogo(true);
    setLogoError(null);
    
    try {
      await apiFetch("/organization/logo", { method: "DELETE" }, token);
      await loadData();
    } catch (err) {
      setLogoError(getErrorMessage(err));
    } finally {
      setUploadingLogo(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="w-96">
          <CardContent className="pt-6">
            <p className="text-red-500">{error || "Failed to load dashboard"}</p>
            <Button onClick={() => router.push("/assets")} className="mt-4">
              Back to Assets
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    IN_STOCK: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    ASSIGNED: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    MAINTENANCE: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
    RETIRED: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
  };

  const conditionColors: Record<string, string> = {
    NEW: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
    GOOD: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    FAIR: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
    DAMAGED: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => router.push("/assets")}>
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Back
            </Button>
            <div className="flex items-center gap-3">
              {data.organization.logo_url ? (
                <img 
                  src={getLogoUrl(data.organization.logo_url) || ""} 
                  alt="Company Logo" 
                  className="w-12 h-12 object-contain rounded-lg bg-white dark:bg-gray-800 p-1"
                />
              ) : (
                <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center">
                  <span className="text-white text-xl font-bold">
                    {data.organization.name.charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
              <div>
                <h1 className="text-2xl font-bold">{data.organization.name}</h1>
                <p className="text-sm text-muted-foreground">Company Dashboard</p>
              </div>
            </div>
          </div>
          {isAdmin && !editing && (
            <Button onClick={() => setEditing(true)} variant="outline">
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Settings
            </Button>
          )}
        </div>

        {/* Settings Edit Panel */}
        {editing && (
          <Card>
            <CardHeader>
              <CardTitle>Organization Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Logo Upload Section */}
              <div className="space-y-3">
                <label className="text-sm font-medium">Company Logo</label>
                <div className="flex items-start gap-4">
                  {/* Logo Preview */}
                  <div className="w-20 h-20 rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-600 flex items-center justify-center bg-slate-50 dark:bg-slate-900 overflow-hidden">
                    {data?.organization.logo_url ? (
                      <img 
                        src={getLogoUrl(data.organization.logo_url) || ""} 
                        alt="Logo" 
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <span className="text-2xl font-bold text-slate-400">
                        {data?.organization.name.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>
                  
                  {/* Upload Controls */}
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <label className="cursor-pointer">
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) uploadLogo(file);
                            e.target.value = ""; // Reset input
                          }}
                          className="hidden"
                          disabled={uploadingLogo}
                        />
                        <span className="inline-flex items-center gap-2 px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors cursor-pointer">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                          </svg>
                          {uploadingLogo ? "Uploading..." : "Upload Logo"}
                        </span>
                      </label>
                      {data?.organization.logo_url && (
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={deleteLogo}
                          disabled={uploadingLogo}
                          className="text-red-600 hover:text-red-700"
                        >
                          Remove
                        </Button>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Supported formats: PNG, JPG, GIF, WebP, SVG. Max 5MB.
                    </p>
                    {logoError && (
                      <p className="text-xs text-red-500">{logoError}</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium">Company Name</label>
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Company Name"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Employee ID Prefix</label>
                  <Input
                    value={editPrefix}
                    onChange={(e) => setEditPrefix(e.target.value.toUpperCase())}
                    placeholder="e.g., DOCK"
                    maxLength={10}
                  />
                  <p className="text-xs text-muted-foreground">
                    Employee IDs will be: {editPrefix || "XXX"}001, {editPrefix || "XXX"}002, etc.
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button onClick={saveSettings} disabled={saving}>
                  {saving ? "Saving..." : "Save Settings"}
                </Button>
                <Button variant="outline" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Stats Overview */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{data.totals.users}</div>
              <p className="text-sm text-muted-foreground">Active Users</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{data.totals.assets}</div>
              <p className="text-sm text-muted-foreground">Total Assets</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{data.totals.hardware}</div>
              <p className="text-sm text-muted-foreground">Hardware</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{data.totals.software}</div>
              <p className="text-sm text-muted-foreground">Software</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Status Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Asset Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {Object.entries(data.status_breakdown).map(([status, count]) => (
                <div key={status} className="flex items-center justify-between">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[status] || 'bg-gray-100'}`}>
                    {status.replace(/_/g, " ")}
                  </span>
                  <span className="font-semibold">{count}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Condition Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Hardware Condition</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {Object.entries(data.condition_breakdown).map(([condition, count]) => (
                <div key={condition} className="flex items-center justify-between">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${conditionColors[condition] || 'bg-gray-100'}`}>
                    {condition}
                  </span>
                  <span className="font-semibold">{count}</span>
                </div>
              ))}
              {data.needs_data_wipe > 0 && (
                <div className="flex items-center justify-between pt-2 border-t">
                  <span className="px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400">
                    ⚠️ Needs Data Wipe
                  </span>
                  <span className="font-semibold text-orange-600">{data.needs_data_wipe}</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Category Breakdown */}
        {data.category_breakdown.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Assets by Category</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {data.category_breakdown.map(({ category, count }) => (
                  <div key={category} className="bg-slate-50 dark:bg-slate-900 rounded-lg p-3 text-center">
                    <div className="text-lg font-bold">{count}</div>
                    <div className="text-xs text-muted-foreground">{category.replace(/_/g, " ")}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid md:grid-cols-2 gap-6">
          {/* Warranty Expiring Soon */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <svg className="w-5 h-5 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Warranty Expiring (30 days)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.warranty_expiring_soon.length === 0 ? (
                <p className="text-sm text-muted-foreground">No warranties expiring soon</p>
              ) : (
                <div className="space-y-2">
                  {data.warranty_expiring_soon.map((asset) => (
                    <Link 
                      key={asset.id} 
                      href={`/assets/${asset.id}`}
                      className="block p-3 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 hover:bg-yellow-100 dark:hover:bg-yellow-900/30 transition-colors"
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="font-medium">{asset.asset_tag}</div>
                          <div className="text-sm text-muted-foreground">
                            {asset.category} {asset.model && `- ${asset.model}`}
                          </div>
                        </div>
                        <div className="text-sm text-yellow-600 dark:text-yellow-400 font-medium">
                          {new Date(asset.warranty_end).toLocaleDateString()}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Renewals Coming Soon */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Renewals Coming (30 days)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.renewals_coming_soon.length === 0 ? (
                <p className="text-sm text-muted-foreground">No renewals coming up</p>
              ) : (
                <div className="space-y-2">
                  {data.renewals_coming_soon.map((asset) => (
                    <Link 
                      key={asset.id} 
                      href={`/assets/${asset.id}`}
                      className="block p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="font-medium">{asset.subscription || asset.asset_tag}</div>
                          <div className="text-sm text-muted-foreground">
                            {asset.seats_used ?? 0}/{asset.seats_total ?? "∞"} seats used
                          </div>
                        </div>
                        <div className="text-sm text-blue-600 dark:text-blue-400 font-medium">
                          {new Date(asset.renewal_date).toLocaleDateString()}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
