"use client";

import { Suspense, useEffect, useState, useMemo, useCallback, useRef } from "react";
import Link from "next/link";
import { apiFetch, getErrorMessage, ApiError } from "@/lib/api";
import { getToken, clearToken } from "@/lib/auth";
import { getTheme, setTheme, type ThemeMode } from "@/lib/theme";
import { useRouter, useSearchParams } from "next/navigation";


import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Asset = {
  id: number;
  asset_tag: string;
  asset_type: "HARDWARE" | "SOFTWARE";
  category: string;
  subscription?: string | null;
  model?: string | null;
  status: string;
  seats_total?: number | null;
  seats_used?: number | null;
  warranty_start?: string | null;
  warranty_end?: string | null;
  renewal_date?: string | null;
};

type CurrentUser = {
  id: number;
  name: string;
  role: string;
  email: string;
};

type Organization = {
  id: number;
  name: string;
  logo_url: string | null;
};

type AssetRequest = {
  id: number;
  request_type: string;
  asset_type_requested: string | null;
  description: string | null;
  asset_id: number | null;
  requester_id: number;
  status: string;
  resolved_by_id: number | null;
  resolution_notes: string | null;
  created_at: string;
  resolved_at: string | null;
  requester_name: string | null;
  asset_tag: string | null;
  resolved_by_name: string | null;
};

type AvailableAsset = {
  id: number;
  asset_tag: string;
  asset_type: string;
  category: string | null;
  subscription: string | null;
  model: string | null;
  seats_total: number | null;
  seats_used: number | null;
};

// Category priority for hardware sorting (lower = higher priority)
const CATEGORY_PRIORITY: Record<string, number> = {
  LAPTOP: 1,
  MONITOR: 2,
  TABLET: 3,
  PHONE: 4,
  // Accessories
  MOUSE: 5,
  KEYBOARD: 6,
  HEADSET: 7,
  WEBCAM: 8,
  DOCKING_STATION: 9,
  CHARGER: 10,
  CABLE: 11,
  OTHER_ACCESSORY: 12,
  OTHER: 13,
};

// Accessory types for display purposes
const ACCESSORY_TYPES = new Set([
  "MOUSE", "KEYBOARD", "HEADSET", "WEBCAM", 
  "DOCKING_STATION", "CHARGER", "CABLE", "OTHER_ACCESSORY"
]);

function getDisplayCategory(category: string | null): string {
  if (!category) return "-";
  if (ACCESSORY_TYPES.has(category)) return "Accessory";
  return category;
}

function AssetsContent() {

  const router = useRouter();
  const searchParams = useSearchParams();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pendingRequestCount, setPendingRequestCount] = useState(0);
  
  // Helper to get proper logo URL
  const getLogoUrl = (url: string | null) => {
    if (!url) return null;
    if (url.startsWith("/organization/") || url.startsWith("/api/")) {
      const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      return `${apiBase}${url}`;
    }
    return url;
  };


  // Role-based permissions
  const canCreateAsset = currentUser?.role === "ADMIN";
  const canSeeUsers = true; // All users can view the users list
  const isAdmin = currentUser?.role === "ADMIN";
  const isManager = currentUser?.role === "MANAGER";
  const isEmployee = currentUser?.role === "EMPLOYEE";
  const canApproveRequests = isAdmin || isManager;

  // Asset request state
  const [showAssetRequestForm, setShowAssetRequestForm] = useState(false);
  const [assetRequests, setAssetRequests] = useState<AssetRequest[]>([]);
  const [pendingAssetRequestCount, setPendingAssetRequestCount] = useState(0);
  const [requestDescription, setRequestDescription] = useState("");

  // Bulk import state
  const [showBulkImportModal, setShowBulkImportModal] = useState(false);
  const [bulkImportFile, setBulkImportFile] = useState<File | null>(null);
  const [bulkImporting, setBulkImporting] = useState(false);
  const [bulkImportResult, setBulkImportResult] = useState<{
    success_count: number;
    error_count: number;
    errors: { row: number; asset_tag: string; error: string }[];
  } | null>(null);
  const [requestAssetType, setRequestAssetType] = useState<"HARDWARE" | "SOFTWARE">("HARDWARE");
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [requestSuccess, setRequestSuccess] = useState<string | null>(null);
  
  // Available assets for approval assignment
  const [availableAssets, setAvailableAssets] = useState<AvailableAsset[]>([]);
  const [selectedAssetForRequest, setSelectedAssetForRequest] = useState<Record<number, number | null>>({});

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [pageRestored, setPageRestored] = useState(false);

  // Restore page from sessionStorage after hydration
  useEffect(() => {
    const saved = sessionStorage.getItem("assetsPage");
    if (saved) {
      const page = parseInt(saved, 10);
      if (page > 0) {
        setCurrentPage(page);
      }
    }
    setPageRestored(true);
  }, []);

  // Save page to sessionStorage and update state
  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(page);
    sessionStorage.setItem("assetsPage", page.toString());
  }, []);

  // Search and filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<"" | "HARDWARE" | "SOFTWARE">("");
  const [filterStatus, setFilterStatus] = useState("");

  // Reminders dropdown state
  const [showReminders, setShowReminders] = useState(false);
  
  // Profile dropdown state
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>("light");
  
  // Mobile menu state
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  // Initialize theme state on mount
  useEffect(() => {
    setThemeMode(getTheme());
  }, []);

  // Dismissed reminders (stored in localStorage)
  const [dismissedReminders, setDismissedReminders] = useState<Set<string>>(new Set());

  // Load dismissed reminders from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem("dismissedReminders");
      if (stored) {
        const parsed = JSON.parse(stored);
        setDismissedReminders(new Set(parsed));
      }
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  // Save dismissed reminders to localStorage
  function dismissReminder(assetId: number, type: "warranty" | "renewal") {
    const key = `${assetId}-${type}`;
    const newDismissed = new Set(dismissedReminders);
    newDismissed.add(key);
    setDismissedReminders(newDismissed);
    try {
      localStorage.setItem("dismissedReminders", JSON.stringify([...newDismissed]));
    } catch {
      // Ignore localStorage errors
    }
  }

  // Clear all dismissed reminders
  function clearDismissedReminders() {
    setDismissedReminders(new Set());
    try {
      localStorage.removeItem("dismissedReminders");
    } catch {
      // Ignore localStorage errors
    }
  }

  // Reminder thresholds (days)
  const REMINDER_DAYS = 30;
  const WARNING_DAYS = 14;
  const URGENT_DAYS = 7;

  // Calculate upcoming expirations (excluding dismissed)
  const upcomingReminders = useMemo(() => {
    const now = new Date();
    const reminders: Array<{
      asset: Asset;
      type: "warranty" | "renewal";
      daysLeft: number;
      urgency: "normal" | "warning" | "urgent" | "expired";
    }> = [];

    assets.forEach((asset) => {
      // Check hardware warranty
      if (asset.asset_type === "HARDWARE" && asset.warranty_end && asset.status !== "RETIRED") {
        const key = `${asset.id}-warranty`;
        if (dismissedReminders.has(key)) return; // Skip dismissed
        
        const warrantyDate = new Date(asset.warranty_end);
        const daysLeft = Math.ceil((warrantyDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        
        if (daysLeft <= REMINDER_DAYS) {
          reminders.push({
            asset,
            type: "warranty",
            daysLeft,
            urgency: daysLeft <= 0 ? "expired" : daysLeft <= URGENT_DAYS ? "urgent" : daysLeft <= WARNING_DAYS ? "warning" : "normal",
          });
        }
      }

      // Check software renewal
      if (asset.asset_type === "SOFTWARE" && asset.renewal_date && asset.status !== "RETIRED") {
        const key = `${asset.id}-renewal`;
        if (dismissedReminders.has(key)) return; // Skip dismissed
        
        const renewalDate = new Date(asset.renewal_date);
        const daysLeft = Math.ceil((renewalDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        
        if (daysLeft <= REMINDER_DAYS) {
          reminders.push({
            asset,
            type: "renewal",
            daysLeft,
            urgency: daysLeft <= 0 ? "expired" : daysLeft <= URGENT_DAYS ? "urgent" : daysLeft <= WARNING_DAYS ? "warning" : "normal",
          });
        }
      }
    });

    // Sort by urgency (expired first, then by days left)
    return reminders.sort((a, b) => {
      const urgencyOrder = { expired: 0, urgent: 1, warning: 2, normal: 3 };
      if (urgencyOrder[a.urgency] !== urgencyOrder[b.urgency]) {
        return urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
      }
      return a.daysLeft - b.daysLeft;
    });
  }, [assets, dismissedReminders]);

  // Helper to check if an asset has an upcoming expiration
  function getAssetReminder(asset: Asset): { urgency: string; daysLeft: number } | null {
    const reminder = upcomingReminders.find((r) => r.asset.id === asset.id);
    return reminder ? { urgency: reminder.urgency, daysLeft: reminder.daysLeft } : null;
  }

  // Helper to get effective status (for software, computed from seats)
  function getEffectiveStatus(asset: Asset): string {
    if (asset.asset_type === "SOFTWARE") {
      if (asset.status === "RETIRED") return "RETIRED";
      const used = asset.seats_used ?? 0;
      const total = asset.seats_total;
      const isFull = total !== null && total !== undefined && used >= total;
      return isFull ? "ASSIGNED" : "IN_STOCK";
    }
    return asset.status;
  }

  // Filter and sort assets
  const filteredAssets = useMemo(() => {
    return assets.filter((asset) => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesTag = asset.asset_tag.toLowerCase().includes(query);
        const matchesModel = asset.model?.toLowerCase().includes(query) ?? false;
        const matchesCategory = asset.category?.toLowerCase().includes(query) ?? false;
        const matchesSubscription = asset.subscription?.toLowerCase().includes(query) ?? false;
        if (!matchesTag && !matchesModel && !matchesCategory && !matchesSubscription) {
          return false;
        }
      }
      // Type filter
      if (filterType && asset.asset_type !== filterType) {
        return false;
      }
      // Status filter - use effective status for software
      if (filterStatus) {
        const effectiveStatus = getEffectiveStatus(asset);
        if (effectiveStatus !== filterStatus) {
          return false;
        }
      }
      return true;
    });
  }, [assets, searchQuery, filterType, filterStatus]);

  // Sort filtered assets: Hardware first (sorted by category), then Software
  const sortedAssets = useMemo(() => {
    return [...filteredAssets].sort((a, b) => {
      // Hardware comes before Software
      if (a.asset_type !== b.asset_type) {
        return a.asset_type === "HARDWARE" ? -1 : 1;
      }
      // Within Hardware, sort by category priority
      if (a.asset_type === "HARDWARE") {
        const priorityA = CATEGORY_PRIORITY[a.category] ?? 99;
        const priorityB = CATEGORY_PRIORITY[b.category] ?? 99;
        if (priorityA !== priorityB) {
          return priorityA - priorityB;
        }
      }
      // Same type and category: sort by ID ascending
      return a.id - b.id;
    });
  }, [filteredAssets]);

  // Reset page when filters change (but not until after page is restored)
  const prevFilters = useRef({ searchQuery, filterType, filterStatus });
  
  useEffect(() => {
    // Don't reset until page has been restored from sessionStorage
    if (!pageRestored) return;
    
    // Check if filters actually changed
    const filtersChanged = 
      prevFilters.current.searchQuery !== searchQuery ||
      prevFilters.current.filterType !== filterType ||
      prevFilters.current.filterStatus !== filterStatus;
    
    if (filtersChanged) {
      setCurrentPage(1);
      sessionStorage.setItem("assetsPage", "1");
    }
    
    prevFilters.current = { searchQuery, filterType, filterStatus };
  }, [pageRestored, searchQuery, filterType, filterStatus]);

  // Paginated assets
  const totalPages = Math.ceil(sortedAssets.length / itemsPerPage);
  const paginatedAssets = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return sortedAssets.slice(startIndex, startIndex + itemsPerPage);
  }, [sortedAssets, currentPage, itemsPerPage]);

  // Clamp currentPage if it exceeds totalPages after filtering
  useEffect(() => {
    if (totalPages > 0 && currentPage > totalPages) {
      handlePageChange(totalPages);
    }
  }, [totalPages, currentPage, handlePageChange]);

  async function loadAssets() {
    try {
      setError(null);
      setRefreshing(true);
      const token = getToken();
      if (!token) {
        window.location.href = "/login";
        return;
      }

      const [assetsData, meData, orgData] = await Promise.all([
        apiFetch<Asset[]>("/assets", {}, token),
        apiFetch<CurrentUser>("/auth/me", {}, token),
        apiFetch<Organization>("/organization/current", {}, token).catch(() => null),
      ]);
      
      setAssets(assetsData);
      setCurrentUser(meData);
      setOrganization(orgData);

      // Fetch pending user request count for admins
      if (meData.role === "ADMIN") {
        try {
          const countData = await apiFetch<{ count: number }>("/user-requests/pending-count", {}, token);
          setPendingRequestCount(countData.count);
        } catch {
          // Ignore errors
        }
      }

      // Fetch asset requests
      if (meData.role === "ADMIN" || meData.role === "MANAGER") {
        // Admins/Managers see all pending requests and available assets
        try {
          const [requestsData, countData, availableData] = await Promise.all([
            apiFetch<AssetRequest[]>("/asset-requests?status_filter=PENDING", {}, token),
            apiFetch<{ count: number }>("/asset-requests/pending-count", {}, token),
            apiFetch<AvailableAsset[]>("/asset-requests/available-assets", {}, token),
          ]);
          setAssetRequests(requestsData);
          setPendingAssetRequestCount(countData.count);
          setAvailableAssets(availableData);
        } catch {
          // Ignore errors
        }
      } else {
        // Employees see their own requests
        try {
          const requestsData = await apiFetch<AssetRequest[]>("/asset-requests/my-requests", {}, token);
          setAssetRequests(requestsData);
        } catch {
          // Ignore errors
        }
      }
    } catch (err: unknown) {
      // Redirect to login on auth errors (401 Unauthorized)
      if (err instanceof ApiError && err.status === 401) {
        clearToken();
        window.location.href = "/login";
        return;
      }
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  // Asset request functions
  async function submitAssetRequest() {
    if (!requestDescription.trim()) {
      setRequestError("Please describe what you need");
      return;
    }

    setSubmittingRequest(true);
    setRequestError(null);
    setRequestSuccess(null);

    try {
      const token = getToken();
      if (!token) throw new Error("Not logged in");

      await apiFetch("/asset-requests", {
        method: "POST",
        body: JSON.stringify({
          request_type: "NEW_ASSET",
          asset_type_requested: requestAssetType,
          description: requestDescription,
        }),
      }, token);

      setRequestSuccess("Request submitted! An admin or manager will review it.");
      setRequestDescription("");
      setShowAssetRequestForm(false);
      await loadAssets();
    } catch (err: unknown) {
      setRequestError(getErrorMessage(err));
    } finally {
      setSubmittingRequest(false);
    }
  }

  async function approveAssetRequest(requestId: number, assignAssetId?: number | null) {
    try {
      const token = getToken();
      if (!token) return;

      await apiFetch(`/asset-requests/${requestId}/approve`, {
        method: "POST",
        body: JSON.stringify({
          assign_asset_id: assignAssetId || null,
        }),
      }, token);

      // Clear selection for this request
      setSelectedAssetForRequest(prev => {
        const updated = { ...prev };
        delete updated[requestId];
        return updated;
      });
      
      await loadAssets();
    } catch (err: unknown) {
      setRequestError(getErrorMessage(err));
    }
  }

  async function denyAssetRequest(requestId: number) {
    try {
      const token = getToken();
      if (!token) return;

      await apiFetch(`/asset-requests/${requestId}/deny`, {
        method: "POST",
      }, token);

      await loadAssets();
    } catch (err: unknown) {
      setRequestError(getErrorMessage(err));
    }
  }

  useEffect(() => {
    loadAssets();
  }, []);

  // Update favicon when organization logo changes
  useEffect(() => {
    if (organization?.logo_url) {
      const logoUrl = getLogoUrl(organization.logo_url);
      if (logoUrl) {
        // Update favicon
        const link = document.querySelector("link[rel*='icon']") as HTMLLinkElement || document.createElement('link');
        link.type = 'image/x-icon';
        link.rel = 'shortcut icon';
        link.href = logoUrl;
        document.head.appendChild(link);
        
        // Also update apple-touch-icon if it exists
        const appleIcon = document.querySelector("link[rel='apple-touch-icon']") as HTMLLinkElement;
        if (appleIcon) {
          appleIcon.href = logoUrl;
        }
      }
    }
  }, [organization?.logo_url]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      {/* Backdrop for reminders dropdown - closes on click anywhere */}
      {showReminders && (
        <div 
          className="fixed inset-0 z-[60]" 
          onClick={() => setShowReminders(false)}
        />
      )}
      
      {/* Backdrop for profile menu - closes on click anywhere */}
      {showProfileMenu && (
        <div 
          className="fixed inset-0 z-[60]" 
          onClick={() => setShowProfileMenu(false)}
        />
      )}
      
      {/* Header */}
      <header className={`bg-white/80 dark:bg-[#000000] backdrop-blur-md border-b border-slate-200/50 dark:border-[#2a2a2a]/50 sticky top-0 shadow-soft ${showReminders || showProfileMenu || showMobileMenu ? "z-[80]" : "z-50"}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 sm:gap-3 group min-w-0">
              {organization?.logo_url ? (
                <img 
                  src={getLogoUrl(organization.logo_url) || "/logo.png"} 
                  alt={organization.name || "ASTRA"} 
                  className="w-10 h-10 sm:w-14 sm:h-14 object-contain transition-transform group-hover:scale-105 flex-shrink-0 rounded-lg bg-white dark:bg-gray-800 p-0.5"
                />
              ) : (
                <img 
                  src="/logo.png" 
                  alt="ASTRA" 
                  className="w-10 h-10 sm:w-14 sm:h-14 object-contain transition-transform group-hover:scale-105 flex-shrink-0"
                />
              )}
              <div className="min-w-0">
                <h1 className="text-lg sm:text-xl font-bold text-gradient">{organization?.name || "ASTRA"}</h1>
                <p className="text-xs text-slate-500 dark:text-[#96989d] hidden sm:block">Asset Tracking, Simplified.</p>
              </div>
            </div>
            
            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center gap-2">
              {/* Primary Actions - Asset Creation */}
              {canCreateAsset && (
                <>
                  <Button 
                    onClick={() => router.push("/assets/new")}
                    className="btn-primary-gradient text-white active-scale"
                  > 
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    New Asset         
                  </Button>
                  {currentUser?.role === "ADMIN" && (
                    <Button 
                      variant="outline"
                      onClick={() => setShowBulkImportModal(true)}
                      className="hover-lift active-scale"
                      title="Bulk Import from CSV"
                    > 
                      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                      </svg>
                      Import
                    </Button>
                  )}
                </>
              )}

              {/* Divider */}
              {canCreateAsset && (
                <div className="h-6 w-px bg-slate-200 dark:bg-[#2a2a2a] mx-1" />
              )}

              {/* Navigation */}
              {canSeeUsers && (
                <Button variant="outline" onClick={() => router.push("/users")} className="relative hover-lift active-scale">
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                  </svg>
                  Users
                  {isAdmin && pendingRequestCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-gradient-to-r from-red-500 to-rose-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center animate-pulse-soft shadow-lg shadow-red-500/30">
                      {pendingRequestCount}
                    </span>
                  )}
                </Button>
              )}

              {/* Asset Requests */}
              <Button 
                variant="outline"
                onClick={() => setShowAssetRequestForm(true)}
                className="relative hover-lift active-scale"
              > 
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                {canApproveRequests ? "Requests" : "Request"}
                {canApproveRequests && pendingAssetRequestCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center animate-pulse-soft shadow-lg shadow-amber-500/30">
                    {pendingAssetRequestCount}
                  </span>
                )}
              </Button>

              {/* Divider */}
              <div className="h-6 w-px bg-slate-200 dark:bg-[#2a2a2a] mx-1" />

              {/* Utility buttons */}
              <Button variant="outline" onClick={loadAssets} disabled={refreshing} className="hover-lift active-scale" title="Refresh">
                <svg className={`w-4 h-4 transition-transform ${refreshing ? "animate-spin-reverse" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </Button>

              {/* Reminders Bell Icon */}
              <div className="relative">
                <Button
                  variant="outline"
                  onClick={() => setShowReminders(!showReminders)}
                  className={`hover-lift active-scale relative ${upcomingReminders.some(r => r.urgency === "expired" || r.urgency === "urgent") ? "border-orange-300" : ""}`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                  {upcomingReminders.length > 0 && (
                    <span className={`absolute -top-1 -right-1 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center shadow-lg ${
                      upcomingReminders.some(r => r.urgency === "expired") 
                        ? "bg-gradient-to-r from-red-500 to-rose-500 animate-pulse shadow-red-500/30" 
                        : upcomingReminders.some(r => r.urgency === "urgent")
                        ? "bg-gradient-to-r from-orange-500 to-amber-500 animate-pulse-soft shadow-orange-500/30"
                        : "bg-gradient-to-r from-amber-400 to-yellow-500 shadow-amber-500/30"
                    }`}>
                      {upcomingReminders.length}
                    </span>
                  )}
                </Button>

                {/* Reminders Dropdown */}
                {showReminders && (
                    <div 
                      className="absolute right-0 mt-2 w-80 bg-white dark:bg-[#0a0a0a] rounded-xl shadow-2xl border border-slate-200 dark:border-[#2a2a2a] z-[70] animate-in fade-in slide-in-from-top-2 duration-200"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="p-3 border-b border-slate-100 dark:border-[#2a2a2a] flex items-center justify-between">
                        <h3 className="font-semibold text-sm text-slate-800 dark:text-slate-200 flex items-center gap-2">
                          <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                          </svg>
                          Reminders
                        </h3>
                        {dismissedReminders.size > 0 && (
                          <button
                            onClick={clearDismissedReminders}
                            className="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200 transition-colors"
                          >
                            Restore {dismissedReminders.size} dismissed
                          </button>
                        )}
                      </div>
                      <div className="max-h-80 overflow-y-auto">
                        {upcomingReminders.length === 0 ? (
                          <div className="p-6 text-center">
                            <svg className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <p className="text-sm text-slate-500 dark:text-[#96989d]">No upcoming expirations</p>
                          </div>
                        ) : (
                          <div className="divide-y divide-slate-100 dark:divide-slate-800">
                            {upcomingReminders.map((reminder) => (
                              <div
                                key={`${reminder.asset.id}-${reminder.type}`}
                                className="p-3 hover:bg-slate-50 dark:hover:bg-[#2a2a2a]/50 transition-colors flex items-center gap-3"
                              >
                                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                                  reminder.urgency === "expired" ? "bg-red-500 animate-pulse" :
                                  reminder.urgency === "urgent" ? "bg-orange-500 animate-pulse" :
                                  reminder.urgency === "warning" ? "bg-amber-500" : "bg-yellow-400"
                                }`} />
                                <Link 
                                  href={`/assets/${reminder.asset.id}`}
                                  className="flex-1 min-w-0"
                                  onClick={() => setShowReminders(false)}
                                >
                                  <p className="font-medium text-sm text-slate-800 dark:text-slate-200 truncate">
                                    {reminder.asset.asset_tag}
                                  </p>
                                  <p className="text-xs text-slate-500 dark:text-[#96989d] truncate">
                                    {reminder.type === "warranty" ? "Warranty" : "Renewal"} • {reminder.asset.model ?? reminder.asset.subscription ?? "N/A"}
                                  </p>
                                </Link>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  <span className={`text-xs font-medium ${
                                    reminder.urgency === "expired" ? "text-red-600 dark:text-red-400" :
                                    reminder.urgency === "urgent" ? "text-orange-600 dark:text-orange-400" :
                                    reminder.urgency === "warning" ? "text-amber-600 dark:text-amber-400" : "text-yellow-600 dark:text-yellow-400"
                                  }`}>
                                    {reminder.daysLeft <= 0 ? "Expired" : `${reminder.daysLeft}d`}
                                  </span>
                                  <button
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      dismissReminder(reminder.asset.id, reminder.type);
                                    }}
                                    className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                                    title="Dismiss"
                                  >
                                    <svg className="w-3.5 h-3.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                )}
              </div>

              {/* User Profile Dropdown */}
              <div className="relative">
                <Button
                  variant="outline"
                  onClick={() => setShowProfileMenu(!showProfileMenu)}
                  className="hover-lift active-scale flex items-center gap-2"
                >
                  <div className="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xs font-medium">
                    {currentUser?.name?.charAt(0).toUpperCase() || "U"}
                  </div>
                  <span className="hidden sm:inline text-sm font-medium max-w-24 truncate">
                    {currentUser?.name || "User"}
                  </span>
                  <svg className={`w-4 h-4 transition-transform ${showProfileMenu ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </Button>

                {showProfileMenu && (
                    <div 
                      className="absolute right-0 mt-2 w-56 bg-white dark:bg-[#0a0a0a] rounded-xl shadow-2xl border border-slate-200 dark:border-[#2a2a2a] z-[70] animate-in fade-in slide-in-from-top-2 duration-200"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {/* User Info */}
                      <div className="p-3 border-b border-slate-100 dark:border-[#2a2a2a]">
                        <p className="font-medium text-sm text-slate-800 dark:text-slate-200 truncate">
                          {currentUser?.name}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-[#96989d]">
                          {currentUser?.role}
                        </p>
                      </div>

                      <div className="py-1">
                        {/* Company Dashboard - Admin only */}
                        {currentUser?.role === "ADMIN" && (
                          <Link
                            href="/company"
                            onClick={() => setShowProfileMenu(false)}
                            className="flex items-center gap-3 px-3 py-2 text-sm text-slate-700 dark:text-[#dcddde] hover:bg-slate-50 dark:hover:bg-[#2a2a2a] transition-colors"
                          >
                            <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                            </svg>
                            Company Dashboard
                          </Link>
                        )}

                        {/* Audit Dashboard - Admin and Auditor only */}
                        {(currentUser?.role === "ADMIN" || currentUser?.role === "AUDITOR") && (
                          <Link
                            href="/audit?tab=assets"
                            onClick={() => setShowProfileMenu(false)}
                            className="flex items-center gap-3 px-3 py-2 text-sm text-slate-700 dark:text-[#dcddde] hover:bg-slate-50 dark:hover:bg-[#2a2a2a] transition-colors"
                          >
                            <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            Audit Dashboard
                          </Link>
                        )}

                        {/* Theme Toggle */}
                        <button
                          onClick={() => {
                            const next = themeMode === "light" ? "dark" : "light";
                            setTheme(next);
                            setThemeMode(next);
                          }}
                          className="w-full flex items-center gap-3 px-3 py-2 text-sm text-slate-700 dark:text-[#dcddde] hover:bg-slate-50 dark:hover:bg-[#1a1a1a] transition-colors"
                        >
                          {themeMode === "dark" ? (
                            <svg className="w-4 h-4 text-slate-500 dark:text-[#96989d]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                            </svg>
                          ) : (
                            <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                            </svg>
                          )}
                          {themeMode === "dark" ? "Light Mode" : "Dark Mode"}
                        </button>

                        <div className="border-t border-slate-100 dark:border-[#2a2a2a] my-1" />

                        {/* Leave Organization */}
                        <button
                          onClick={async () => {
                            if (!window.confirm("Are you sure you want to leave this organization? Your account will be deleted and you'll need to sign in again to join a new organization.")) {
                              return;
                            }
                            try {
                              const token = getToken();
                              if (!token) return;
                              await apiFetch("/auth/leave-organization", { method: "DELETE" }, token);
                              clearToken();
                              window.location.href = "/login";
                            } catch (err) {
                              alert("Failed to leave organization: " + getErrorMessage(err));
                            }
                          }}
                          className="w-full flex items-center gap-3 px-3 py-2 text-sm text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                          </svg>
                          Leave Organization
                        </button>

                        {/* Logout */}
                        <button
                          onClick={() => {
                            clearToken();
                            window.location.href = "/login";
                          }}
                          className="w-full flex items-center gap-3 px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                          </svg>
                          Logout
                        </button>
                      </div>
                    </div>
                )}
              </div>
            </div>
            
            {/* Mobile Navigation */}
            <div className="flex md:hidden items-center gap-2">
              {/* Primary action - always visible */}
              {canCreateAsset && (
                <Button 
                  onClick={() => router.push("/assets/new")}
                  className="btn-primary-gradient text-white active-scale"
                  size="sm"
                > 
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </Button>
              )}
              
              {/* Reminders bell - mobile */}
              <div className="relative">
                <Button
                  variant="outline"
                  onClick={() => setShowReminders(!showReminders)}
                  size="sm"
                  className={`relative ${upcomingReminders.some(r => r.urgency === "expired" || r.urgency === "urgent") ? "border-orange-300" : ""}`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                  {upcomingReminders.length > 0 && (
                    <span className={`absolute -top-1 -right-1 text-white text-xs w-4 h-4 rounded-full flex items-center justify-center ${
                      upcomingReminders.some(r => r.urgency === "expired") 
                        ? "bg-red-500 animate-pulse" 
                        : upcomingReminders.some(r => r.urgency === "urgent")
                        ? "bg-orange-500"
                        : "bg-amber-500"
                    }`}>
                      {upcomingReminders.length}
                    </span>
                  )}
                </Button>
                
                {/* Reminders Dropdown - Mobile */}
                {showReminders && (
                  <div 
                    className="fixed top-16 left-4 right-4 sm:absolute sm:top-auto sm:left-auto sm:right-0 sm:mt-2 w-auto sm:w-72 bg-white dark:bg-[#0a0a0a] rounded-xl shadow-2xl border border-slate-200 dark:border-[#2a2a2a] z-[70] animate-in fade-in slide-in-from-top-2 duration-200 max-h-80 overflow-y-auto"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="p-3 border-b border-slate-100 dark:border-[#2a2a2a]">
                      <h3 className="font-semibold text-sm text-slate-800 dark:text-white">Upcoming Reminders</h3>
                    </div>
                    {upcomingReminders.length === 0 ? (
                      <div className="p-4 text-center text-sm text-slate-500 dark:text-[#96989d]">
                        No upcoming reminders
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-100 dark:divide-slate-800">
                        {upcomingReminders.map((reminder) => (
                          <div
                            key={`mobile-${reminder.asset.id}-${reminder.type}`}
                            className="p-3 hover:bg-slate-50 dark:hover:bg-[#2a2a2a]/50 transition-colors flex items-center gap-3"
                          >
                            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                              reminder.urgency === "expired" ? "bg-red-500 animate-pulse" :
                              reminder.urgency === "urgent" ? "bg-orange-500 animate-pulse" :
                              reminder.urgency === "warning" ? "bg-amber-500" : "bg-yellow-400"
                            }`} />
                            <Link 
                              href={`/assets/${reminder.asset.id}`}
                              className="flex-1 min-w-0"
                              onClick={() => setShowReminders(false)}
                            >
                              <p className="font-medium text-sm text-slate-800 dark:text-slate-200 truncate">
                                {reminder.asset.asset_tag}
                              </p>
                              <p className="text-xs text-slate-500 dark:text-[#96989d] truncate">
                                {reminder.type === "warranty" ? "Warranty" : "Renewal"}
                              </p>
                            </Link>
                            <span className={`text-xs font-medium ${
                              reminder.urgency === "expired" ? "text-red-600" :
                              reminder.urgency === "urgent" ? "text-orange-600" :
                              "text-amber-600"
                            }`}>
                              {reminder.daysLeft <= 0 ? "Exp" : `${reminder.daysLeft}d`}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
              
              {/* Mobile menu button */}
              <div className="relative">
                <Button
                  variant="outline"
                  onClick={() => setShowMobileMenu(!showMobileMenu)}
                  className="active-scale"
                  size="sm"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    {showMobileMenu ? (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                    )}
                  </svg>
                </Button>
                
                {/* Mobile menu dropdown */}
                {showMobileMenu && (
                  <div 
                    className="absolute right-0 mt-2 w-56 bg-white dark:bg-[#0a0a0a] rounded-xl shadow-2xl border border-slate-200 dark:border-[#2a2a2a] z-[70] animate-in fade-in slide-in-from-top-2 duration-200"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="py-1">
                      {/* User info */}
                      <div className="px-3 py-2 border-b border-slate-100 dark:border-[#2a2a2a]">
                        <p className="font-medium text-sm text-slate-800 dark:text-slate-200 truncate">{currentUser?.name}</p>
                        <p className="text-xs text-slate-500 dark:text-[#96989d]">{currentUser?.role}</p>
                      </div>
                      
                      {currentUser?.role === "ADMIN" && (
                        <button
                          onClick={() => { setShowBulkImportModal(true); setShowMobileMenu(false); }}
                          className="w-full flex items-center gap-3 px-3 py-2 text-sm text-slate-700 dark:text-[#dcddde] hover:bg-slate-50 dark:hover:bg-[#1a1a1a]"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                          </svg>
                          Import CSV
                        </button>
                      )}
                      
                      {canSeeUsers && (
                        <button
                          onClick={() => { router.push("/users"); setShowMobileMenu(false); }}
                          className="w-full flex items-center gap-3 px-3 py-2 text-sm text-slate-700 dark:text-[#dcddde] hover:bg-slate-50 dark:hover:bg-[#1a1a1a]"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                          </svg>
                          Users
                          {isAdmin && pendingRequestCount > 0 && (
                            <span className="ml-auto bg-red-500 text-white text-xs px-1.5 rounded-full">{pendingRequestCount}</span>
                          )}
                        </button>
                      )}
                      
                      <button
                        onClick={() => { setShowAssetRequestForm(true); setShowMobileMenu(false); }}
                        className="w-full flex items-center gap-3 px-3 py-2 text-sm text-slate-700 dark:text-[#dcddde] hover:bg-slate-50 dark:hover:bg-[#1a1a1a]"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                        {canApproveRequests ? "Requests" : "Request Asset"}
                        {canApproveRequests && pendingAssetRequestCount > 0 && (
                          <span className="ml-auto bg-amber-500 text-white text-xs px-1.5 rounded-full">{pendingAssetRequestCount}</span>
                        )}
                      </button>
                      
                      <button
                        onClick={() => { loadAssets(); setShowMobileMenu(false); }}
                        className="w-full flex items-center gap-3 px-3 py-2 text-sm text-slate-700 dark:text-[#dcddde] hover:bg-slate-50 dark:hover:bg-[#1a1a1a]"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        Refresh
                      </button>
                      
                      {currentUser?.role === "ADMIN" && (
                        <button
                          onClick={() => { router.push("/company"); setShowMobileMenu(false); }}
                          className="w-full flex items-center gap-3 px-3 py-2 text-sm text-slate-700 dark:text-[#dcddde] hover:bg-slate-50 dark:hover:bg-[#1a1a1a]"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                          </svg>
                          Company Dashboard
                        </button>
                      )}
                      
                      {(currentUser?.role === "ADMIN" || currentUser?.role === "AUDITOR") && (
                        <button
                          onClick={() => { router.push("/audit?tab=assets"); setShowMobileMenu(false); }}
                          className="w-full flex items-center gap-3 px-3 py-2 text-sm text-slate-700 dark:text-[#dcddde] hover:bg-slate-50 dark:hover:bg-[#1a1a1a]"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          Audit Dashboard
                        </button>
                      )}
                      
                      <div className="border-t border-slate-100 dark:border-[#2a2a2a] my-1" />
                      
                      <button
                        onClick={() => {
                          const next = themeMode === "light" ? "dark" : "light";
                          setTheme(next);
                          setThemeMode(next);
                          setShowMobileMenu(false);
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2 text-sm text-slate-700 dark:text-[#dcddde] hover:bg-slate-50 dark:hover:bg-[#1a1a1a]"
                      >
                        {themeMode === "dark" ? (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                          </svg>
                        )}
                        {themeMode === "dark" ? "Light Mode" : "Dark Mode"}
                      </button>
                      
                      {/* Leave Organization */}
                      <button
                        onClick={async () => {
                          if (!window.confirm("Are you sure you want to leave this organization? Your account will be deleted and you'll need to sign in again to join a new organization.")) {
                            return;
                          }
                          try {
                            const token = getToken();
                            if (!token) return;
                            await apiFetch("/auth/leave-organization", { method: "DELETE" }, token);
                            clearToken();
                            window.location.href = "/login";
                          } catch (err) {
                            alert("Failed to leave organization: " + getErrorMessage(err));
                          }
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2 text-sm text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/20"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                        </svg>
                        Leave Organization
                      </button>

                      <button
                        onClick={() => {
                          clearToken();
                          window.location.href = "/login";
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                        </svg>
                        Logout
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-6 space-y-4">
      <Card className="shadow-xl border border-slate-200 dark:border-[#2a2a2a] bg-white/90 dark:bg-[#000000] backdrop-blur-sm">
        <CardHeader className="border-b border-slate-100 dark:border-[#2a2a2a]">
          <CardTitle className="text-lg font-semibold text-slate-800 dark:text-[#f0f6fc] flex items-center gap-2">
            <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            All Assets
            <span className="text-sm font-normal text-slate-500 ml-2">
              ({sortedAssets.length} total)
            </span>
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-4 pt-6">
          {/* Search and Filter */}
          <div className="flex flex-wrap gap-3 mb-4">
            <Input
              placeholder="Search by tag, model, category..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full sm:w-64"
            />
            <select
              className="border border-slate-300 dark:border-[#2a2a2a] rounded-md px-3 py-2 text-sm bg-white dark:bg-[#000000] text-slate-800 dark:text-[#dcddde]"
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as "" | "HARDWARE" | "SOFTWARE")}
            >
              <option value="" className="bg-white dark:bg-[#0a0a0a]">All Types</option>
              <option value="HARDWARE">Hardware</option>
              <option value="SOFTWARE">Software</option>
            </select>
            <select
              className="border border-slate-300 dark:border-[#2a2a2a] rounded-md px-3 py-2 text-sm bg-white dark:bg-[#000000] text-slate-800 dark:text-[#dcddde]"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="" className="bg-white dark:bg-[#0a0a0a]">All Statuses</option>
              <option value="IN_STOCK" className="bg-white dark:bg-[#0a0a0a]">In Stock</option>
              <option value="ASSIGNED" className="bg-white dark:bg-[#0a0a0a]">Assigned</option>
              <option value="IN_REPAIR" className="bg-white dark:bg-[#0a0a0a]">In Repair</option>
              <option value="RETIRED" className="bg-white dark:bg-[#0a0a0a]">Retired</option>
            </select>
            {(searchQuery || filterType || filterStatus) && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearchQuery("");
                  setFilterType("");
                  setFilterStatus("");
                }}
              >
                Clear Filters
              </Button>
            )}
          </div>

          {loading && (
            <div className="space-y-2 animate-fade-in">
              <div className="flex items-center gap-3 mb-4">
                <div className="loading-spinner" />
                <span className="text-sm text-muted-foreground">Loading assets...</span>
              </div>
              {/* Skeleton table rows */}
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-slate-50 px-4 py-3 border-b">
                  <div className="flex gap-4">
                    <div className="skeleton-text w-8" />
                    <div className="skeleton-text w-24" />
                    <div className="skeleton-text w-20" />
                    <div className="skeleton-text w-24" />
                    <div className="skeleton-text w-28" />
                    <div className="skeleton-text w-20" />
                  </div>
                </div>
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="skeleton-row" style={{ animationDelay: `${i * 100}ms` }}>
                    <div className="skeleton-cell w-8" />
                    <div className="skeleton-cell w-28" />
                    <div className="skeleton-cell w-20" />
                    <div className="skeleton-cell w-24" />
                    <div className="skeleton-cell w-32" />
                    <div className="skeleton-cell w-20" />
                  </div>
                ))}
              </div>
            </div>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}

          {!loading && !error && (
            <>
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="hidden sm:table-cell">#</TableHead>
                  <TableHead>Tag</TableHead>
                  <TableHead className="hidden sm:table-cell">Type</TableHead>
                  <TableHead className="hidden md:table-cell">Category</TableHead>
                  <TableHead className="hidden lg:table-cell">Model</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedAssets.map((asset, index) => (
                  <TableRow key={asset.id} className="table-row-hover transition-all [&>td]:py-3">
                    <TableCell className="hidden sm:table-cell font-medium text-slate-500">{(currentPage - 1) * itemsPerPage + index + 1}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/assets/${asset.id}`}
                          className="underline"
                        >
                          {asset.asset_tag}
                        </Link>
                        {(() => {
                          const reminder = getAssetReminder(asset);
                          if (!reminder) return null;
                          return (
                            <span 
                              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                reminder.urgency === "expired" 
                                  ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" 
                                  : reminder.urgency === "urgent"
                                  ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
                                  : reminder.urgency === "warning"
                                  ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                                  : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                              }`}
                              title={reminder.daysLeft <= 0 ? "Expired" : `${reminder.daysLeft} days until expiration`}
                            >
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              {reminder.daysLeft <= 0 ? "!" : reminder.daysLeft + "d"}
                            </span>
                          );
                        })()}
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">{asset.asset_type}</TableCell>
                    <TableCell className="hidden md:table-cell">
                      {asset.asset_type === "SOFTWARE"
                        ? "Subscription"
                        : getDisplayCategory(asset.category)}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">{asset.model ?? "-"}</TableCell>
                    <TableCell>
                      {asset.asset_type === "SOFTWARE" 
                        ? (() => {
                            if (asset.status === "RETIRED") {
                              return (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium status-expired">
                                  EXPIRED
                                </span>
                              );
                            }
                            const used = asset.seats_used ?? 0;
                            const total = asset.seats_total;
                            const isFull = total !== null && total !== undefined && used >= total;
                            const status = isFull ? "ASSIGNED" : "IN_STOCK";
                            const statusClass = isFull ? "status-assigned" : "status-in-stock";
                            return (
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusClass}`}>
                                {status} ({used}/{total ?? "∞"})
                              </span>
                            );
                          })()
                        : (
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            asset.status === "IN_STOCK" ? "status-in-stock" :
                            asset.status === "ASSIGNED" ? "status-assigned" :
                            asset.status === "IN_REPAIR" ? "status-in-repair" : "status-retired"
                          }`}>
                            {asset.status}
                          </span>
                        )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground text-center sm:text-left">
                    Showing {(currentPage - 1) * itemsPerPage + 1} to{" "}
                    {Math.min(currentPage * itemsPerPage, sortedAssets.length)} of{" "}
                    {sortedAssets.length} assets
                  </span>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <span className="text-sm hidden sm:inline">Rows per page:</span>
                  <select
                    className="border border-slate-300 dark:border-[#2a2a2a] rounded px-2 py-1 text-sm bg-white dark:bg-[#000000] text-slate-800 dark:text-[#dcddde]"
                    value={itemsPerPage}
                    onChange={(e) => {
                      setItemsPerPage(Number(e.target.value));
                      handlePageChange(1);
                    }}
                  >
                    <option value={10} className="bg-white dark:bg-[#0a0a0a]">10</option>
                    <option value={25} className="bg-white dark:bg-[#0a0a0a]">25</option>
                    <option value={50} className="bg-white dark:bg-[#0a0a0a]">50</option>
                    <option value={100} className="bg-white dark:bg-[#0a0a0a]">100</option>
                  </select>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                  >
                    Previous
                  </Button>
                  <span className="text-sm">
                    {currentPage}/{totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage === totalPages}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
            </>
          )}
        </CardContent>
      </Card>
      </main>

      {/* Asset Request Modal */}
      {showAssetRequestForm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowAssetRequestForm(false)}
          />
          
          {/* Modal content */}
          <div className="relative bg-white dark:bg-[#1a1a1a] rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">
                  {canApproveRequests ? "Asset Requests" : "Request an Asset"}
                </h2>
                <button
                  onClick={() => setShowAssetRequestForm(false)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Success/Error messages */}
              {requestSuccess && (
                <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm">
                  {requestSuccess}
                </div>
              )}
              {requestError && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
                  {requestError}
                </div>
              )}

              {/* Request form for employees */}
              {!canApproveRequests && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1 text-slate-700 dark:text-[#dcddde]">Asset Type</label>
                    <select
                      className="w-full border border-slate-300 dark:border-[#2a2a2a] rounded-lg px-3 py-2 bg-white dark:bg-[#000000] text-slate-800 dark:text-[#dcddde]"
                      value={requestAssetType}
                      onChange={(e) => setRequestAssetType(e.target.value as "HARDWARE" | "SOFTWARE")}
                    >
                      <option value="HARDWARE" className="bg-white dark:bg-[#0a0a0a]">Hardware</option>
                      <option value="SOFTWARE" className="bg-white dark:bg-[#0a0a0a]">Software</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 text-slate-700 dark:text-[#dcddde]">What do you need?</label>
                    <textarea
                      className="w-full border border-slate-300 dark:border-[#2a2a2a] rounded-lg px-3 py-2 min-h-[100px] bg-white dark:bg-[#000000] text-slate-800 dark:text-[#dcddde]"
                      placeholder="Describe the asset you need (e.g., 'I need a laptop for development work')"
                      value={requestDescription}
                      onChange={(e) => setRequestDescription(e.target.value)}
                    />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button variant="outline" onClick={() => setShowAssetRequestForm(false)}>
                      Cancel
                    </Button>
                    <Button 
                      className="btn-primary-gradient text-white"
                      onClick={submitAssetRequest}
                      disabled={submittingRequest}
                    >
                      {submittingRequest ? "Submitting..." : "Submit Request"}
                    </Button>
                  </div>
                </div>
              )}

              {/* Request list for admins/managers */}
              {canApproveRequests && (
                <div className="space-y-4">
                  {/* Pending requests */}
                  <h3 className="text-sm font-medium text-slate-700 dark:text-[#dcddde]">Pending Requests</h3>
                  {assetRequests.filter(r => r.status === "PENDING").length === 0 ? (
                    <p className="text-sm text-slate-500 dark:text-[#96989d] text-center py-4">No pending requests</p>
                  ) : (
                    <div className="space-y-3">
                      {assetRequests.filter(r => r.status === "PENDING").map((request) => {
                        // Filter available assets by requested type
                        const matchingAssets = availableAssets.filter(a => 
                          !request.asset_type_requested || a.asset_type === request.asset_type_requested
                        );
                        const selectedId = selectedAssetForRequest[request.id];
                        
                        return (
                        <div key={request.id} className="border border-slate-200 dark:border-[#2a2a2a] rounded-lg p-3 bg-white dark:bg-[#0a0a0a]">
                          <div className="flex flex-col gap-2">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="font-medium text-sm text-slate-800 dark:text-white">{request.requester_name}</span>
                                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                                    request.asset_type_requested === "HARDWARE" 
                                      ? "bg-blue-100 text-blue-700" 
                                      : "bg-purple-100 text-purple-700"
                                  }`}>
                                    {request.asset_type_requested || "N/A"}
                                  </span>
                                </div>
                                <p className="text-sm text-slate-700 dark:text-[#dcddde]">{request.description}</p>
                                <p className="text-xs text-slate-500 dark:text-[#96989d] mt-1">
                                  {new Date(request.created_at).toLocaleDateString()}
                                </p>
                              </div>
                            </div>
                            
                            {/* Asset selection for assignment */}
                            <div className="pt-2 border-t border-slate-200 dark:border-[#2a2a2a] space-y-2">
                              <select
                                className="w-full border border-slate-300 dark:border-[#2a2a2a] rounded px-2 py-1.5 text-sm bg-white dark:bg-[#000000] text-slate-800 dark:text-[#dcddde]"
                                value={selectedId ?? ""}
                                onChange={(e) => {
                                  const val = e.target.value ? parseInt(e.target.value) : null;
                                  setSelectedAssetForRequest(prev => ({
                                    ...prev,
                                    [request.id]: val
                                  }));
                                }}
                              >
                                <option value="" className="bg-white dark:bg-[#0a0a0a]">-- Select asset to assign (optional) --</option>
                                {matchingAssets.map(asset => (
                                  <option key={asset.id} value={asset.id} className="bg-white dark:bg-[#0a0a0a]">
                                    {asset.asset_tag} - {asset.category || asset.subscription || "Asset"} 
                                    {asset.model ? ` (${asset.model})` : ""}
                                    {asset.asset_type === "SOFTWARE" && asset.seats_total 
                                      ? ` [${(asset.seats_used || 0)}/${asset.seats_total} seats used]` 
                                      : ""}
                                  </option>
                                ))}
                              </select>
                              <div className="flex gap-2">
                                <Button 
                                  size="sm" 
                                  variant="outline"
                                  className="flex-1 text-green-600 dark:text-green-400 border-green-300 dark:border-green-700 hover:bg-green-50 dark:hover:bg-green-900/30"
                                  onClick={() => approveAssetRequest(request.id, selectedId)}
                                >
                                  {selectedId ? "Approve & Assign" : "Approve"}
                                </Button>
                                <Button 
                                  size="sm" 
                                  variant="outline"
                                  className="flex-1 text-red-600 dark:text-red-400 border-red-300 dark:border-red-700 hover:bg-red-50 dark:hover:bg-red-900/30"
                                  onClick={() => denyAssetRequest(request.id)}
                                >
                                  Deny
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>
                      );})}
                    </div>
                  )}

                  {/* Show previous requests too */}
                  {assetRequests.filter(r => r.status !== "PENDING").length > 0 && (
                    <>
                      <h3 className="text-sm font-medium text-slate-700 dark:text-[#dcddde] mt-6">Recent Decisions</h3>
                      <div className="space-y-2">
                        {assetRequests.filter(r => r.status !== "PENDING").slice(0, 5).map((request) => (
                          <div key={request.id} className="border border-slate-200 dark:border-[#2a2a2a] rounded-lg p-2 text-sm flex items-center justify-between">
                            <div>
                              <span className="font-medium text-slate-800 dark:text-white">{request.requester_name}</span>
                              <span className="text-slate-400 dark:text-[#96989d] mx-2">-</span>
                              <span className="text-slate-600 dark:text-[#dcddde]">{request.description?.slice(0, 50)}...</span>
                            </div>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                              request.status === "APPROVED" 
                                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" 
                                : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                            }`}>
                              {request.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Employee's own request history */}
              {!canApproveRequests && assetRequests.length > 0 && (
                <div className="mt-6 pt-4 border-t border-slate-200 dark:border-[#2a2a2a]">
                  <h3 className="text-sm font-medium text-slate-700 dark:text-[#dcddde] mb-3">Your Requests</h3>
                  <div className="space-y-2">
                    {assetRequests.map((request) => (
                      <div key={request.id} className="border border-slate-200 dark:border-[#2a2a2a] rounded-lg p-2 text-sm flex items-center justify-between">
                        <div>
                          <span className="text-slate-700 dark:text-[#dcddde]">{request.description?.slice(0, 50)}{(request.description?.length ?? 0) > 50 ? "..." : ""}</span>
                        </div>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          request.status === "PENDING" 
                            ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" 
                            : request.status === "APPROVED"
                              ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" 
                              : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                        }`}>
                          {request.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Bulk Import Modal */}
      {showBulkImportModal && (
        <>
          <div 
            className="fixed inset-0 bg-black/50 z-50"
            onClick={() => {
              setShowBulkImportModal(false);
              setBulkImportFile(null);
              setBulkImportResult(null);
            }}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-[#1a1a1a] rounded-xl shadow-2xl max-w-lg w-full p-6 animate-scale-in max-h-[80vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-slate-800 dark:text-[#f0f6fc]">Bulk Import Assets</h3>
                <button 
                  onClick={() => {
                    setShowBulkImportModal(false);
                    setBulkImportFile(null);
                    setBulkImportResult(null);
                  }}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {!bulkImportResult ? (
                <>
                  <p className="text-sm text-slate-600 dark:text-[#96989d] mb-3">
                    Upload a CSV file with assets to import.
                  </p>
                  <div className="text-xs text-slate-500 dark:text-[#96989d] mb-4 space-y-1">
                    <p><span className="font-medium text-slate-700 dark:text-[#dcddde]">Required:</span> asset_tag, asset_type (HARDWARE/SOFTWARE)</p>
                    <p><span className="font-medium text-slate-700 dark:text-[#dcddde]">Hardware:</span> category (LAPTOP, MONITOR, etc.), manufacturer, model, serial_number</p>
                    <p><span className="font-medium text-slate-700 dark:text-[#dcddde]">Software:</span> subscription (required), seats_total</p>
                  </div>

                  <div className={`border-2 border-dashed rounded-lg p-6 text-center mb-4 transition-colors ${
                    bulkImportFile 
                      ? "border-green-400 dark:border-green-600 bg-green-50 dark:bg-green-900/20" 
                      : "border-slate-300 dark:border-slate-600"
                  }`}>
                    <input
                      type="file"
                      accept=".csv"
                      onChange={(e) => setBulkImportFile(e.target.files?.[0] || null)}
                      className="hidden"
                      id="csv-upload"
                    />
                    <label htmlFor="csv-upload" className="cursor-pointer block">
                      {bulkImportFile ? (
                        <>
                          <div className="w-12 h-12 mx-auto mb-3 bg-green-100 dark:bg-green-900/40 rounded-full flex items-center justify-center">
                            <svg className="w-6 h-6 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          </div>
                          <p className="text-sm font-medium text-slate-800 dark:text-[#f0f6fc] mb-1">
                            {bulkImportFile.name}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-[#96989d]">
                            {(bulkImportFile.size / 1024).toFixed(1)} KB
                          </p>
                          <p className="text-xs text-green-600 dark:text-green-400 mt-2">
                            Ready to import • Click to change file
                          </p>
                        </>
                      ) : (
                        <>
                          <svg className="w-10 h-10 mx-auto text-slate-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                          </svg>
                          <p className="text-sm text-slate-600 dark:text-[#96989d]">
                            Click to select a CSV file
                          </p>
                          <p className="text-xs text-slate-400 dark:text-[#6e7681] mt-1">
                            or drag and drop
                          </p>
                        </>
                      )}
                    </label>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => {
                        // Download sample CSV with clear examples
                        const sample = `asset_tag,asset_type,category,subscription,manufacturer,model,serial_number,status,condition,seats_total,warranty_end,notes
HW-LAPTOP-001,HARDWARE,Laptop,,Dell,XPS 15,SN-ABC123,IN_STOCK,NEW,,2027-01-15,Intel i7 with 32GB RAM
HW-MONITOR-001,HARDWARE,Monitor,,LG,27UK850,SN-DEF456,IN_STOCK,GOOD,,2027-06-15,27" 4K Monitor
HW-PHONE-001,HARDWARE,Phone,,Apple,iPhone 15,SN-GHI789,IN_STOCK,NEW,,2027-03-01,Company mobile device
SW-OFFICE-001,SOFTWARE,,Microsoft 365 Business,,,,IN_STOCK,NEW,50,,Annual subscription - 50 seats
SW-SLACK-001,SOFTWARE,,Slack Enterprise,,,,IN_STOCK,NEW,100,,Annual subscription - 100 seats`;
                        const blob = new Blob([sample], { type: 'text/csv' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = 'asset-import-template.csv';
                        a.click();
                      }}
                    >
                      Download Template
                    </Button>
                    <Button
                      className="flex-1"
                      disabled={!bulkImportFile || bulkImporting}
                      onClick={async () => {
                        if (!bulkImportFile) return;
                        
                        setBulkImporting(true);
                        try {
                          const text = await bulkImportFile.text();
                          const lines = text.split('\n').filter(line => line.trim());
                          const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
                          
                          const assets = lines.slice(1).map(line => {
                            const values = line.split(',').map(v => v.trim());
                            const obj: Record<string, string | number | null> = {};
                            headers.forEach((h, i) => {
                              if (values[i]) {
                                if (h === 'seats_total' || h === 'seats_used') {
                                  obj[h] = parseInt(values[i]) || null;
                                } else {
                                  obj[h] = values[i];
                                }
                              }
                            });
                            return obj;
                          }).filter(a => a.asset_tag && a.asset_type);

                          const token = getToken();
                          if (!token) throw new Error("Not logged in");

                          const result = await apiFetch<{
                            success_count: number;
                            error_count: number;
                            errors: { row: number; asset_tag: string; error: string }[];
                          }>("/assets/bulk-import", {
                            method: "POST",
                            body: JSON.stringify(assets),
                          }, token);

                          setBulkImportResult(result);
                          if (result.success_count > 0) {
                            loadAssets();
                          }
                        } catch (err) {
                          setBulkImportResult({
                            success_count: 0,
                            error_count: 1,
                            errors: [{ row: 0, asset_tag: '', error: getErrorMessage(err) }]
                          });
                        } finally {
                          setBulkImporting(false);
                        }
                      }}
                    >
                      {bulkImporting ? "Importing..." : "Import"}
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <div className={`p-4 rounded-lg mb-4 ${bulkImportResult.error_count === 0 ? 'bg-green-50 dark:bg-green-900/20' : 'bg-amber-50 dark:bg-amber-900/20'}`}>
                    <p className={`font-medium ${bulkImportResult.error_count === 0 ? 'text-green-700 dark:text-green-300' : 'text-amber-700 dark:text-amber-300'}`}>
                      {bulkImportResult.success_count} assets imported successfully
                      {bulkImportResult.error_count > 0 && `, ${bulkImportResult.error_count} failed`}
                    </p>
                  </div>

                  {bulkImportResult.errors.length > 0 && (
                    <div className="mb-4">
                      <p className="text-sm font-medium text-slate-700 dark:text-[#dcddde] mb-2">Errors:</p>
                      <div className="max-h-40 overflow-y-auto space-y-1">
                        {bulkImportResult.errors.map((err, i) => (
                          <div key={i} className="text-xs bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 p-2 rounded">
                            {err.row > 0 && <span>Row {err.row}</span>}
                            {err.asset_tag && <span> ({err.asset_tag})</span>}
                            : {err.error}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <Button
                    className="w-full"
                    onClick={() => {
                      setShowBulkImportModal(false);
                      setBulkImportFile(null);
                      setBulkImportResult(null);
                    }}
                  >
                    Done
                  </Button>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function AssetsPageFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
      <div className="text-center">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-blue-200 border-t-blue-600 mb-4" />
        <p className="text-slate-600 dark:text-slate-400">Loading assets...</p>
      </div>
    </div>
  );
}

export default function AssetsPage() {
  return (
    <Suspense fallback={<AssetsPageFallback />}>
      <AssetsContent />
    </Suspense>
  );
}
