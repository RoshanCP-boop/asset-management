"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import Link from "next/link";
import { apiFetch, getErrorMessage } from "@/lib/api";
import { getToken, clearToken } from "@/lib/auth";
import { validatePassword, validateConfirmPassword } from "@/lib/validation";
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
  must_change_password: boolean;
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

export default function AssetsPage() {

  const router = useRouter();
  const searchParams = useSearchParams();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pendingRequestCount, setPendingRequestCount] = useState(0);

  // Change password form state
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);

  // Role-based permissions
  const canCreateAsset = currentUser?.role === "ADMIN";
  const canSeeUsers = currentUser?.role !== "EMPLOYEE";
  const isAdmin = currentUser?.role === "ADMIN";
  const mustChangePassword = currentUser?.must_change_password === true;

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
      if (!token) throw new Error("Not logged in");

      const [assetsData, meData] = await Promise.all([
        apiFetch<Asset[]>("/assets", {}, token),
        apiFetch<CurrentUser>("/auth/me", {}, token),
      ]);
      
      setAssets(assetsData);
      setCurrentUser(meData);

      // Fetch pending request count for admins
      if (meData.role === "ADMIN") {
        try {
          const countData = await apiFetch<{ count: number }>("/user-requests/pending-count", {}, token);
          setPendingRequestCount(countData.count);
        } catch {
          // Ignore errors
        }
      }
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function changePassword() {
    setPasswordError(null);
    setPasswordMessage(null);

    // Validate current password
    if (!currentPassword) {
      setPasswordError("Current password is required");
      return;
    }
    
    // Validate new password
    const newPwResult = validatePassword(newPassword);
    if (!newPwResult.isValid) {
      setPasswordError(newPwResult.error ?? "Invalid password");
      return;
    }
    
    // Validate confirm password
    const confirmResult = validateConfirmPassword(newPassword, confirmPassword);
    if (!confirmResult.isValid) {
      setPasswordError(confirmResult.error ?? "Passwords do not match");
      return;
    }

    setChangingPassword(true);
    try {
      const token = getToken();
      if (!token) throw new Error("Not logged in");

      await apiFetch(
        "/auth/change-password",
        {
          method: "POST",
          body: JSON.stringify({
            current_password: currentPassword,
            new_password: newPassword,
          }),
        },
        token
      );

      setPasswordMessage("Password changed successfully!");
      setShowPasswordForm(false);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      // Reload to update must_change_password status
      await loadAssets();
    } catch (err: unknown) {
      setPasswordError(getErrorMessage(err));
    } finally {
      setChangingPassword(false);
    }
  }

  function cancelPasswordChange() {
    setShowPasswordForm(false);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setPasswordError(null);
    setPasswordMessage(null);
  }

  useEffect(() => {
    loadAssets();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-subtle">
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
      <header className={`bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200/50 dark:border-slate-700/50 sticky top-0 shadow-soft ${showReminders || showProfileMenu ? "z-[80]" : "z-50"}`}>
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 group">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/25 transition-transform group-hover:scale-105">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              </div>
              <div>
                <h1 className="text-xl font-bold text-gradient">Asset Manager</h1>
                <p className="text-xs text-slate-500 dark:text-slate-400">Manage your inventory</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {canCreateAsset && (
                <Button 
                  onClick={() => router.push("/assets/new")}
                  className="btn-primary-gradient text-white active-scale"
                > 
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  New Asset         
                </Button>
              )}

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

              <Button variant="outline" onClick={loadAssets} disabled={refreshing} className="hover-lift active-scale">
                <svg className={`w-4 h-4 mr-2 transition-transform ${refreshing ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Refresh
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
                      className="absolute right-0 mt-2 w-80 bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 z-[70] animate-in fade-in slide-in-from-top-2 duration-200"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="p-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
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
                            <p className="text-sm text-slate-500 dark:text-slate-400">No upcoming expirations</p>
                          </div>
                        ) : (
                          <div className="divide-y divide-slate-100 dark:divide-slate-800">
                            {upcomingReminders.map((reminder) => (
                              <div
                                key={`${reminder.asset.id}-${reminder.type}`}
                                className="p-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors flex items-center gap-3"
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
                                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
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
                  className={`hover-lift active-scale flex items-center gap-2 ${mustChangePassword ? "border-orange-300" : ""}`}
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
                  {mustChangePassword && (
                    <span className="absolute -top-1 -right-1 w-3 h-3 bg-orange-500 rounded-full animate-pulse" />
                  )}
                </Button>

                {showProfileMenu && (
                    <div 
                      className="absolute right-0 mt-2 w-56 bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 z-[70] animate-in fade-in slide-in-from-top-2 duration-200"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {/* User Info */}
                      <div className="p-3 border-b border-slate-100 dark:border-slate-800">
                        <p className="font-medium text-sm text-slate-800 dark:text-slate-200 truncate">
                          {currentUser?.name}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {currentUser?.role}
                        </p>
                      </div>

                      <div className="py-1">
                        {/* Audit Dashboard - Admin and Auditor only */}
                        {(currentUser?.role === "ADMIN" || currentUser?.role === "AUDITOR") && (
                          <Link
                            href="/audit?tab=assets"
                            onClick={() => setShowProfileMenu(false)}
                            className="flex items-center gap-3 px-3 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                          >
                            <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            Audit Dashboard
                          </Link>
                        )}

                        {/* Change Password */}
                        <button
                          onClick={() => {
                            setShowProfileMenu(false);
                            setShowPasswordForm(true);
                          }}
                          className={`w-full flex items-center gap-3 px-3 py-2 text-sm transition-colors ${
                            mustChangePassword 
                              ? "text-orange-600 bg-orange-50 dark:bg-orange-900/20" 
                              : "text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                          }`}
                        >
                          <svg className={`w-4 h-4 ${mustChangePassword ? "text-orange-500" : "text-slate-500"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                          </svg>
                          Change Password
                          {mustChangePassword && (
                            <span className="ml-auto text-xs bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded">Required</span>
                          )}
                        </button>

                        <div className="border-t border-slate-100 dark:border-slate-800 my-1" />

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
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-6 space-y-4">
      <Card className="shadow-xl border-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm">
        <CardHeader className="border-b border-slate-100 dark:border-slate-800">
          <CardTitle className="text-lg font-semibold text-slate-800 dark:text-white flex items-center gap-2">
            <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            All Assets
            <span className="text-sm font-normal text-slate-500 ml-2">
              ({sortedAssets.length} total)
            </span>
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Change Password Form */}
          {showPasswordForm && (
            <Card className="border-2 border-blue-200">
              <CardHeader>
                <CardTitle className="text-lg">Change Password</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {passwordError && (
                  <p className="text-sm text-red-600">{passwordError}</p>
                )}
                {passwordMessage && (
                  <p className="text-sm text-emerald-600">{passwordMessage}</p>
                )}
                {/* Hidden username field for browser password manager */}
                <input
                  type="hidden"
                  name="username"
                  autoComplete="username"
                  value={currentUser?.email ?? ""}
                  readOnly
                />
                <div className="space-y-1">
                  <label className="text-sm font-medium">Current Password</label>
                  <Input
                    type="password"
                    name="current-password"
                    autoComplete="current-password"
                    placeholder="Enter current password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">New Password</label>
                  <Input
                    type="password"
                    name="new-password"
                    autoComplete="new-password"
                    placeholder="Minimum 8 characters"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Confirm New Password</label>
                  <Input
                    type="password"
                    name="confirm-password"
                    autoComplete="new-password"
                    placeholder="Re-enter new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </div>
                <div className="flex gap-2 pt-2">
                  <Button onClick={changePassword} disabled={changingPassword}>
                    {changingPassword ? "Changing..." : "Change Password"}
                  </Button>
                  <Button variant="outline" onClick={cancelPasswordChange} disabled={changingPassword}>
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Search and Filter */}
          <div className="flex flex-wrap gap-3 mb-4">
            <Input
              placeholder="Search by tag, model, category..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-64"
            />
            <select
              className="border rounded-md px-3 py-2 text-sm"
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as "" | "HARDWARE" | "SOFTWARE")}
            >
              <option value="">All Types</option>
              <option value="HARDWARE">Hardware</option>
              <option value="SOFTWARE">Software</option>
            </select>
            <select
              className="border rounded-md px-3 py-2 text-sm"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="">All Statuses</option>
              <option value="IN_STOCK">In Stock</option>
              <option value="ASSIGNED">Assigned</option>
              <option value="IN_REPAIR">In Repair</option>
              <option value="RETIRED">Retired</option>
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Tag</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedAssets.map((asset, index) => (
                  <TableRow key={asset.id} className="table-row-hover transition-all">
                    <TableCell className="font-medium text-slate-500">{(currentPage - 1) * itemsPerPage + index + 1}</TableCell>
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
                    <TableCell>{asset.asset_type}</TableCell>
                    <TableCell>
                      {asset.asset_type === "SOFTWARE"
                        ? "Subscription"
                        : getDisplayCategory(asset.category)}
                    </TableCell>
                    <TableCell>{asset.model ?? "-"}</TableCell>
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

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">
                    Showing {(currentPage - 1) * itemsPerPage + 1} to{" "}
                    {Math.min(currentPage * itemsPerPage, sortedAssets.length)} of{" "}
                    {sortedAssets.length} assets
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm">Rows per page:</span>
                  <select
                    className="border rounded px-2 py-1 text-sm"
                    value={itemsPerPage}
                    onChange={(e) => {
                      setItemsPerPage(Number(e.target.value));
                      handlePageChange(1);
                    }}
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
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
                    Page {currentPage} of {totalPages}
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
    </div>
  );
}
