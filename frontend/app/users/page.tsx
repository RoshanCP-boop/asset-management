"use client";

import { Suspense, useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { apiFetch, getErrorMessage, ApiError } from "@/lib/api";
import { getToken, clearToken } from "@/lib/auth";
import { getTheme, setTheme, type ThemeMode } from "@/lib/theme";
import { formatDate } from "@/lib/date";

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

type User = {
  id: number;
  name: string;
  email: string;
  employee_id: string | null;
  role: string;
  is_active: boolean;
  status: string;
};

type CurrentUser = {
  id: number;
  name: string;
  role: string;
  organization_id?: number;
  organization_name?: string;
};

type Organization = {
  id: number;
  name: string;
  logo_url: string | null;
};

type InviteCode = {
  id: number;
  code: string;
  organization_id: number;
  max_uses: number | null;
  uses: number;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
};

const ROLE_OPTIONS = ["EMPLOYEE", "MANAGER", "ADMIN", "AUDITOR"];

// Role priority for sorting (lower = higher priority)
const ROLE_PRIORITY: Record<string, number> = {
  ADMIN: 1,
  MANAGER: 2,
  EMPLOYEE: 3,
  AUDITOR: 4,
};

function UsersContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [users, setUsers] = useState<User[]>([]);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>("light");
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  
  // Helper to get proper logo URL
  const getLogoUrl = (url: string | null) => {
    if (!url) return null;
    if (url.startsWith("/organization/") || url.startsWith("/api/")) {
      const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      return `${apiBase}${url}`;
    }
    return url;
  };
  
  // Invite code state
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteCodes, setInviteCodes] = useState<InviteCode[]>([]);
  const [loadingInvites, setLoadingInvites] = useState(false);
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [inviteExpiry, setInviteExpiry] = useState<string>("7d"); // default 7 days
  const [inviteMaxUses, setInviteMaxUses] = useState<string>(""); // default unlimited
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  // Initialize theme state on mount
  useEffect(() => {
    setThemeMode(getTheme());
  }, []);

  const isAdmin = currentUser?.role === "ADMIN";
  const isManager = currentUser?.role === "MANAGER";
  const isEmployee = currentUser?.role === "EMPLOYEE";

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [pageRestored, setPageRestored] = useState(false);

  // Restore page from sessionStorage after hydration
  useEffect(() => {
    const saved = sessionStorage.getItem("usersPage");
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
    sessionStorage.setItem("usersPage", page.toString());
  }, []);

  // Search and filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [filterRole, setFilterRole] = useState("");
  const [filterStatus, setFilterStatus] = useState<"" | "active" | "inactive">("");

  // Filter users
  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesName = user.name.toLowerCase().includes(query);
        const matchesEmail = user.email.toLowerCase().includes(query);
        const matchesEmployeeId = user.employee_id?.toLowerCase().includes(query);
        if (!matchesName && !matchesEmail && !matchesEmployeeId) {
          return false;
        }
      }
      // Role filter
      if (filterRole && user.role !== filterRole) {
        return false;
      }
      // Status filter
      if (filterStatus === "active" && !user.is_active) {
        return false;
      }
      if (filterStatus === "inactive" && user.is_active) {
        return false;
      }
      return true;
    });
  }, [users, searchQuery, filterRole, filterStatus]);

  // Sort filtered users by role priority, then by ID ascending
  const sortedUsers = useMemo(() => {
    return [...filteredUsers].sort((a, b) => {
      const priorityA = ROLE_PRIORITY[a.role] ?? 99;
      const priorityB = ROLE_PRIORITY[b.role] ?? 99;
      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }
      // Same role: sort by ID ascending
      return a.id - b.id;
    });
  }, [filteredUsers]);

  // Paginated users
  const totalPages = Math.ceil(sortedUsers.length / itemsPerPage);
  const paginatedUsers = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return sortedUsers.slice(startIndex, startIndex + itemsPerPage);
  }, [sortedUsers, currentPage, itemsPerPage]);

  // Reset page when filters change (but not until after page is restored)
  const prevFilters = useRef({ searchQuery, filterRole, filterStatus });
  
  useEffect(() => {
    // Don't reset until page has been restored from sessionStorage
    if (!pageRestored) return;
    
    // Check if filters actually changed
    const filtersChanged = 
      prevFilters.current.searchQuery !== searchQuery ||
      prevFilters.current.filterRole !== filterRole ||
      prevFilters.current.filterStatus !== filterStatus;
    
    if (filtersChanged) {
      setCurrentPage(1);
      sessionStorage.setItem("usersPage", "1");
    }
    
    prevFilters.current = { searchQuery, filterRole, filterStatus };
  }, [pageRestored, searchQuery, filterRole, filterStatus]);

  // Clamp currentPage if it exceeds totalPages
  useEffect(() => {
    if (totalPages > 0 && currentPage > totalPages) {
      handlePageChange(totalPages);
    }
  }, [totalPages, currentPage, handlePageChange]);

  async function loadUsers() {
    try {
      setError(null);
      setRefreshing(true);
      const token = getToken();
      if (!token) {
        window.location.href = "/login";
        return;
      }

      const [usersData, meData, orgData] = await Promise.all([
        apiFetch<User[]>("/users", {}, token),
        apiFetch<CurrentUser>("/auth/me", {}, token),
        apiFetch<Organization>("/organization/current", {}, token).catch(() => null),
      ]);

      setUsers(usersData);
      setCurrentUser(meData);
      setOrganization(orgData);
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

  async function deactivateUser(userId: number, userName: string, userRole: string) {
    const isTargetAdmin = userRole === "ADMIN";
    
    const message = isTargetAdmin
      ? `Are you sure you want to deactivate ADMIN user "${userName}"? This action requires confirmation.\n\nAll assets assigned to this user will be automatically returned.`
      : `Are you sure you want to deactivate user "${userName}"?\n\nAll assets assigned to this user will be automatically returned.`;

    if (!window.confirm(message)) return;

    try {
      setActionError(null);
      setActionMessage(null);
      const token = getToken();
      if (!token) throw new Error("Not logged in");

      const url = isTargetAdmin
        ? `/users/${userId}?confirm=true`
        : `/users/${userId}`;

      const result = await apiFetch<{ message: string; returned_assets?: string[] }>(
        url,
        { method: "DELETE" },
        token
      );
      
      // Show which assets were returned
      if (result.returned_assets && result.returned_assets.length > 0) {
        setActionMessage(
          `User deactivated. Returned assets: ${result.returned_assets.join(", ")}`
        );
      } else {
        setActionMessage("User deactivated.");
      }
      
      await loadUsers();
    } catch (err: unknown) {
      setActionError(getErrorMessage(err));
    }
  }

  async function activateUser(userId: number, userName: string) {
    const message = `Are you sure you want to reactivate user "${userName}"?`;
    if (!window.confirm(message)) return;

    try {
      setActionError(null);
      setActionMessage(null);
      const token = getToken();
      if (!token) throw new Error("Not logged in");

      await apiFetch(`/users/${userId}/activate`, { method: "POST" }, token);
      await loadUsers();
    } catch (err: unknown) {
      setActionError(getErrorMessage(err));
    }
  }

  // Invite code functions
  async function loadInviteCodes() {
    try {
      setLoadingInvites(true);
      const token = getToken();
      if (!token) throw new Error("Not logged in");
      
      const codes = await apiFetch<InviteCode[]>("/auth/invite-codes", {}, token);
      setInviteCodes(codes);
    } catch (err: unknown) {
      console.error("Failed to load invite codes:", err);
    } finally {
      setLoadingInvites(false);
    }
  }

  async function createInviteCode() {
    try {
      setCreatingInvite(true);
      const token = getToken();
      if (!token) throw new Error("Not logged in");
      
      // Calculate expiration date based on selected option
      let expires_at: string | null = null;
      if (inviteExpiry) {
        const now = new Date();
        const expiryMs: Record<string, number> = {
          "30m": 30 * 60 * 1000,
          "1h": 60 * 60 * 1000,
          "6h": 6 * 60 * 60 * 1000,
          "12h": 12 * 60 * 60 * 1000,
          "1d": 24 * 60 * 60 * 1000,
          "7d": 7 * 24 * 60 * 60 * 1000,
        };
        if (expiryMs[inviteExpiry]) {
          expires_at = new Date(now.getTime() + expiryMs[inviteExpiry]).toISOString();
        }
      }
      
      const max_uses = inviteMaxUses ? parseInt(inviteMaxUses, 10) : null;
      
      await apiFetch<InviteCode>("/auth/invite-codes", { 
        method: "POST",
        body: JSON.stringify({ expires_at, max_uses })
      }, token);
      
      await loadInviteCodes();
    } catch (err: unknown) {
      setActionError(getErrorMessage(err));
    } finally {
      setCreatingInvite(false);
    }
  }

  async function deactivateInviteCode(codeId: number) {
    if (!window.confirm("Are you sure you want to deactivate this invite code?")) return;
    
    try {
      const token = getToken();
      if (!token) throw new Error("Not logged in");
      
      await apiFetch(`/auth/invite-codes/${codeId}`, { method: "DELETE" }, token);
      await loadInviteCodes();
    } catch (err: unknown) {
      setActionError(getErrorMessage(err));
    }
  }

  async function deleteInviteCode(codeId: number) {
    if (!window.confirm("Permanently delete this invite code?")) return;
    
    try {
      const token = getToken();
      if (!token) throw new Error("Not logged in");
      
      await apiFetch(`/auth/invite-codes/${codeId}`, { method: "DELETE" }, token);
      await loadInviteCodes();
    } catch (err: unknown) {
      setActionError(getErrorMessage(err));
    }
  }

  function copyInviteLink(code: string) {
    const link = `${window.location.origin}/join/${code}`;
    navigator.clipboard.writeText(link);
    setActionMessage("Invite link copied to clipboard!");
    setTimeout(() => setActionMessage(null), 3000);
  }

  async function changeUserRole(userId: number, userName: string, currentRole: string, newRole: string) {
    if (currentRole === newRole) return;

    const message = `Are you sure you want to change ${userName}'s role from ${currentRole} to ${newRole}?`;
    if (!window.confirm(message)) return;

    try {
      setActionError(null);
      setActionMessage(null);
      const token = getToken();
      if (!token) throw new Error("Not logged in");

      await apiFetch(
        `/users/${userId}/role?new_role=${encodeURIComponent(newRole)}`,
        { method: "PATCH" },
        token
      );
      await loadUsers();
    } catch (err: unknown) {
      setActionError(getErrorMessage(err));
    }
  }

  useEffect(() => {
    loadUsers();
  }, []);

  // Show loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Loading users...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      {/* Backdrop for profile menu - closes on click anywhere */}
      {showProfileMenu && (
        <div 
          className="fixed inset-0 z-[60]" 
          onClick={() => setShowProfileMenu(false)}
        />
      )}
      
      {/* Header */}
      <header className={`bg-white/80 dark:bg-[#000000] backdrop-blur-md border-b border-slate-200/50 dark:border-[#2a2a2a]/50 sticky top-0 shadow-soft ${showProfileMenu || showMobileMenu ? "z-[80]" : "z-50"}`}>
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
                <p className="text-xs text-slate-500 dark:text-[#96989d] hidden sm:block">User Management</p>
              </div>
            </div>
            
            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center gap-2">
              <Button variant="outline" onClick={() => router.push("/assets")} className="hover-lift active-scale">
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
                Assets
              </Button>
              {isAdmin && (
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setShowInviteModal(true);
                    loadInviteCodes();
                  }} 
                  className="hover-lift active-scale"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                  </svg>
                  Invite Team
                </Button>
              )}
              <Button variant="outline" onClick={loadUsers} disabled={refreshing} className="hover-lift active-scale" title="Refresh">
                <svg className={`w-4 h-4 transition-transform ${refreshing ? "animate-spin-reverse" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </Button>
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
                        {/* Audit Dashboard - Admin and Auditor only */}
                        {(currentUser?.role === "ADMIN" || currentUser?.role === "AUDITOR") && (
                          <Link
                            href="/audit?tab=users"
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
              <div className="relative">
                <Button
                  variant="outline"
                  onClick={() => setShowMobileMenu(!showMobileMenu)}
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
                
                {showMobileMenu && (
                  <div 
                    className="absolute right-0 mt-2 w-48 bg-white dark:bg-[#0a0a0a] rounded-xl shadow-2xl border border-slate-200 dark:border-[#2a2a2a] z-[70] animate-in fade-in slide-in-from-top-2 duration-200"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="py-1">
                      <div className="px-3 py-2 border-b border-slate-100 dark:border-[#2a2a2a]">
                        <p className="font-medium text-sm text-slate-800 dark:text-slate-200 truncate">{currentUser?.name}</p>
                        <p className="text-xs text-slate-500 dark:text-[#96989d]">{currentUser?.role}</p>
                      </div>
                      
                      <button
                        onClick={() => { router.push("/assets"); setShowMobileMenu(false); }}
                        className="w-full flex items-center gap-3 px-3 py-2 text-sm text-slate-700 dark:text-[#dcddde] hover:bg-slate-50 dark:hover:bg-[#1a1a1a]"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                        </svg>
                        Assets
                      </button>
                      
                      {isAdmin && (
                        <button
                          onClick={() => { setShowInviteModal(true); loadInviteCodes(); setShowMobileMenu(false); }}
                          className="w-full flex items-center gap-3 px-3 py-2 text-sm text-slate-700 dark:text-[#dcddde] hover:bg-slate-50 dark:hover:bg-[#1a1a1a]"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                          </svg>
                          Invite Team
                        </button>
                      )}
                      
                      <button
                        onClick={() => { loadUsers(); setShowMobileMenu(false); }}
                        className="w-full flex items-center gap-3 px-3 py-2 text-sm text-slate-700 dark:text-[#dcddde] hover:bg-slate-50 dark:hover:bg-[#1a1a1a]"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        Refresh
                      </button>
                      
                      {(currentUser?.role === "ADMIN" || currentUser?.role === "AUDITOR") && (
                        <button
                          onClick={() => { router.push("/audit?tab=users"); setShowMobileMenu(false); }}
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
      {actionError && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-sm text-amber-700">{actionError}</p>
        </div>
      )}
      {actionMessage && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
          <p className="text-sm text-emerald-700">{actionMessage}</p>
        </div>
      )}
      <Card className="shadow-xl border border-slate-200 dark:border-[#2a2a2a] bg-white/90 dark:bg-[#000000] backdrop-blur-sm">
        <CardHeader className="border-b border-slate-100 dark:border-[#2a2a2a]">
          <CardTitle className="text-lg font-semibold text-slate-800 dark:text-[#f0f6fc] flex items-center gap-2">
            <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            All Users
            <span className="text-sm font-normal text-slate-500 ml-2">
              ({sortedUsers.length} total)
            </span>
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-4 pt-6">
          {/* Search and Filter */}
          <div className="flex flex-wrap gap-3 mb-4">
            <Input
              placeholder="Search by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full sm:w-64"
            />
            <select
              className="border border-slate-300 dark:border-[#2a2a2a] rounded-md px-3 py-2 text-sm bg-white dark:bg-[#000000] text-slate-800 dark:text-[#dcddde]"
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value)}
            >
              <option value="" className="bg-white dark:bg-[#0a0a0a]">All Roles</option>
              <option value="ADMIN">Admin</option>
              <option value="MANAGER">Manager</option>
              <option value="EMPLOYEE">Employee</option>
              <option value="AUDITOR">Auditor</option>
            </select>
            <select
              className="border border-slate-300 dark:border-[#2a2a2a] rounded-md px-3 py-2 text-sm bg-white dark:bg-[#000000] text-slate-800 dark:text-[#dcddde]"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as "" | "active" | "inactive")}
            >
              <option value="" className="bg-white dark:bg-[#0a0a0a]">All Statuses</option>
              <option value="active" className="bg-white dark:bg-[#0a0a0a]">Active</option>
              <option value="inactive" className="bg-white dark:bg-[#0a0a0a]">Inactive</option>
            </select>
            {(searchQuery || filterRole || filterStatus) && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearchQuery("");
                  setFilterRole("");
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
                <span className="text-sm text-muted-foreground">Loading users...</span>
              </div>
              {/* Skeleton table rows */}
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-slate-50 px-4 py-3 border-b">
                  <div className="flex gap-4">
                    <div className="skeleton-text w-8" />
                    <div className="skeleton-text w-28" />
                    <div className="skeleton-text w-40" />
                    <div className="skeleton-text w-20" />
                    <div className="skeleton-text w-20" />
                  </div>
                </div>
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="skeleton-row" style={{ animationDelay: `${i * 100}ms` }}>
                    <div className="skeleton-cell w-8" />
                    <div className="skeleton-cell w-32" />
                    <div className="skeleton-cell w-44" />
                    <div className="skeleton-cell w-20" />
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
                  <TableHead className="hidden sm:table-cell">ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="hidden md:table-cell">Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="hidden sm:table-cell">Status</TableHead>
                  {isAdmin && <TableHead>Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedUsers.map((user, index) => (
                  <TableRow key={user.id} className="table-row-hover transition-all">
                    <TableCell className="hidden sm:table-cell">
                      {user.employee_id ? (
                        <span className="font-mono text-sm font-medium text-slate-700 dark:text-slate-300">
                          {user.employee_id}
                        </span>
                      ) : (
                        <span className="text-slate-400 text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Link href={`/users/${user.id}`} className="text-blue-600 hover:underline">
                        {user.name}
                      </Link>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{user.email}</TableCell>
                    <TableCell>
                      {isAdmin && user.id !== currentUser?.id ? (
                        <select
                          className="border border-slate-300 dark:border-[#2a2a2a] rounded-lg px-2 py-1 bg-white dark:bg-[#000000] text-slate-800 dark:text-[#dcddde] text-sm focus:ring-2 focus:ring-[#58a6ff]/20 focus:border-[#58a6ff] transition-all"
                          value={user.role}
                          onChange={(e) =>
                            changeUserRole(user.id, user.name, user.role, e.target.value)
                          }
                        >
                          {ROLE_OPTIONS.map((role) => (
                            <option key={role} value={role} className="bg-white dark:bg-[#0a0a0a] text-slate-800 dark:text-[#dcddde]">
                              {role}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          user.role === "ADMIN" ? "role-admin" :
                          user.role === "MANAGER" ? "role-manager" :
                          user.role === "AUDITOR" ? "role-auditor" : "role-employee"
                        }`}>
                          {user.role}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          user.is_active
                            ? "status-in-stock"
                            : "status-retired"
                        }`}
                      >
                        {user.status}
                      </span>
                    </TableCell>
                    {isAdmin && (
                      <TableCell>
                        {user.is_active && user.id !== currentUser?.id && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              deactivateUser(user.id, user.name, user.role)
                            }
                          >
                            Deactivate
                          </Button>
                        )}
                        {user.id === currentUser?.id && (
                          <span className="text-sm text-muted-foreground">
                            (You)
                          </span>
                        )}
                        {!user.is_active && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => activateUser(user.id, user.name)}
                          >
                            Activate
                          </Button>
                        )}
                      </TableCell>
                    )}
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
                    {Math.min(currentPage * itemsPerPage, sortedUsers.length)} of{" "}
                    {sortedUsers.length} users
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

      {/* Invite Team Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start sm:items-center justify-center p-4 pt-16 sm:pt-4 overflow-y-auto" onClick={() => setShowInviteModal(false)}>
          <div 
            className="bg-white dark:bg-[#0a0a0a] rounded-xl shadow-2xl border border-slate-200 dark:border-[#2a2a2a] w-full max-w-lg animate-in fade-in zoom-in-95 duration-200 max-h-[calc(100vh-5rem)] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 sm:p-6 border-b border-slate-100 dark:border-[#2a2a2a] flex items-start justify-between gap-2 sticky top-0 bg-white dark:bg-[#0a0a0a]">
              <div className="min-w-0">
                <h2 className="text-lg sm:text-xl font-semibold text-slate-800 dark:text-[#f0f6fc]">Invite Team</h2>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-[#96989d] mt-1 truncate">
                  {currentUser?.organization_name && `${currentUser.organization_name}`}
                </p>
              </div>
              <button onClick={() => setShowInviteModal(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 flex-shrink-0 p-1">
                <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="p-4 sm:p-6 space-y-4">
              <p className="text-sm text-slate-600 dark:text-[#dcddde]">
                Share an invite link to add people to your organization.
              </p>
              
              <div className="flex flex-wrap items-end gap-3 p-3 bg-slate-50 dark:bg-[#1a1a1a] rounded-lg border border-slate-200 dark:border-[#2a2a2a]">
                <div className="flex-1 min-w-[120px]">
                  <label className="block text-xs font-medium text-slate-500 dark:text-[#96989d] mb-1">
                    Expires after
                  </label>
                  <select
                    value={inviteExpiry}
                    onChange={(e) => setInviteExpiry(e.target.value)}
                    className="w-full px-2 py-1.5 text-sm rounded border border-slate-300 dark:border-[#3a3a3a] bg-white dark:bg-[#0a0a0a] text-slate-700 dark:text-[#dcddde]"
                  >
                    <option value="30m">30 minutes</option>
                    <option value="1h">1 hour</option>
                    <option value="6h">6 hours</option>
                    <option value="12h">12 hours</option>
                    <option value="1d">1 day</option>
                    <option value="7d">7 days</option>
                    <option value="">Never</option>
                  </select>
                </div>
                <div className="flex-1 min-w-[120px]">
                  <label className="block text-xs font-medium text-slate-500 dark:text-[#96989d] mb-1">
                    Max uses
                  </label>
                  <select
                    value={inviteMaxUses}
                    onChange={(e) => setInviteMaxUses(e.target.value)}
                    className="w-full px-2 py-1.5 text-sm rounded border border-slate-300 dark:border-[#3a3a3a] bg-white dark:bg-[#0a0a0a] text-slate-700 dark:text-[#dcddde]"
                  >
                    <option value="">No limit</option>
                    <option value="1">1 use</option>
                    <option value="5">5 uses</option>
                    <option value="10">10 uses</option>
                    <option value="25">25 uses</option>
                    <option value="50">50 uses</option>
                    <option value="100">100 uses</option>
                  </select>
                </div>
                <Button onClick={createInviteCode} disabled={creatingInvite} size="sm">
                  {creatingInvite ? "Creating..." : "Create Invite"}
                </Button>
              </div>
              
              {loadingInvites ? (
                <div className="text-center py-4 text-slate-500">Loading...</div>
              ) : inviteCodes.length === 0 ? (
                <div className="text-center py-8 text-slate-500 dark:text-[#96989d]">
                  <svg className="w-12 h-12 mx-auto mb-3 text-slate-300 dark:text-[#2a2a2a]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                  <p>No invite codes yet.</p>
                  <p className="text-sm mt-1">Create one to invite team members.</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-64 overflow-y-auto">
                  {inviteCodes.map((invite) => (
                    <div 
                      key={invite.id}
                      className={`p-3 rounded-lg border ${
                        invite.is_active 
                          ? "bg-slate-50 dark:bg-[#1a1a1a] border-slate-200 dark:border-[#2a2a2a]" 
                          : "bg-slate-100 dark:bg-[#0a0a0a] border-slate-300 dark:border-[#1a1a1a] opacity-50"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <code className="text-sm font-mono text-slate-700 dark:text-[#dcddde]">{invite.code}</code>
                          <div className="text-xs text-slate-500 dark:text-[#96989d] mt-1">
                            Used: {invite.uses}{invite.max_uses ? `/${invite.max_uses}` : ""} times
                            {invite.expires_at && ` • Expires: ${formatDate(invite.expires_at)}`}
                            {!invite.is_active && " • Deactivated"}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {invite.is_active ? (
                            <>
                              <Button 
                                size="sm" 
                                variant="outline"
                                onClick={() => copyInviteLink(invite.code)}
                              >
                                Copy Link
                              </Button>
                              <Button 
                                size="sm" 
                                variant="outline"
                                onClick={() => deactivateInviteCode(invite.id)}
                                className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                                title="Deactivate"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                                </svg>
                              </Button>
                            </>
                          ) : (
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => deleteInviteCode(invite.id)}
                              className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                              title="Delete permanently"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      </main>
    </div>
  );
}

function UsersPageFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
      <div className="text-center">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-blue-200 border-t-blue-600 mb-4" />
        <p className="text-slate-600 dark:text-slate-400">Loading users...</p>
      </div>
    </div>
  );
}

export default function UsersPage() {
  return (
    <Suspense fallback={<UsersPageFallback />}>
      <UsersContent />
    </Suspense>
  );
}
