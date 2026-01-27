"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { apiFetch, getErrorMessage } from "@/lib/api";
import { getToken, clearToken } from "@/lib/auth";
import { validatePassword, validateConfirmPassword } from "@/lib/validation";
import { useRouter } from "next/navigation";


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
};

type CurrentUser = {
  id: number;
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
  const [assets, setAssets] = useState<Asset[]>([]);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingRequestCount, setPendingRequestCount] = useState(0);

  // Change password form state
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Role-based permissions
  const canCreateAsset = currentUser?.role === "ADMIN";
  const canSeeUsers = currentUser?.role !== "EMPLOYEE";
  const isAdmin = currentUser?.role === "ADMIN";
  const mustChangePassword = currentUser?.must_change_password === true;

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Search and filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<"" | "HARDWARE" | "SOFTWARE">("");
  const [filterStatus, setFilterStatus] = useState("");

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

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterType, filterStatus]);

  // Paginated assets
  const totalPages = Math.ceil(sortedAssets.length / itemsPerPage);
  const paginatedAssets = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return sortedAssets.slice(startIndex, startIndex + itemsPerPage);
  }, [sortedAssets, currentPage, itemsPerPage]);

  // Reset to page 1 when assets change
  useEffect(() => {
    setCurrentPage(1);
  }, [assets.length]);

  async function loadAssets() {
    try {
      setError(null);
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
    }
  }

  async function changePassword() {
    setPasswordError(null);

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

      alert("Password changed successfully!");
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
  }

  useEffect(() => {
    loadAssets();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      {/* Header */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-800 dark:text-white">Asset Manager</h1>
                <p className="text-xs text-slate-500 dark:text-slate-400">Manage your inventory</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {canCreateAsset && (
                <Button 
                  onClick={() => router.push("/assets/new")}
                  className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-md shadow-blue-500/20 transition-all hover:shadow-lg hover:-translate-y-0.5"
                > 
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  New Asset         
                </Button>
              )}

              {canSeeUsers && (
                <Button variant="outline" onClick={() => router.push("/users")} className="relative transition-all hover:-translate-y-0.5">
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                  </svg>
                  Users
                  {isAdmin && pendingRequestCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center animate-pulse">
                      {pendingRequestCount}
                    </span>
                  )}
                </Button>
              )}

              <Button variant="outline" onClick={loadAssets} className="transition-all hover:-translate-y-0.5">
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Refresh
              </Button>

              {mustChangePassword && (
                <Button variant="outline" onClick={() => setShowPasswordForm(true)} className="border-orange-300 text-orange-600 hover:bg-orange-50">
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                  </svg>
                  Change Password
                </Button>
              )}

              <Button
                variant="ghost"
                onClick={() => {
                  clearToken();
                  window.location.href = "/login";
                }}
                className="text-slate-600 hover:text-red-600 hover:bg-red-50 transition-colors"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Logout
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-6">
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

          {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
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
                  <TableRow key={asset.id}>
                    <TableCell>{(currentPage - 1) * itemsPerPage + index + 1}</TableCell>
                    <TableCell>
                      <Link
                        href={`/assets/${asset.id}`}
                        className="underline"
                      >
                        {asset.asset_tag}
                      </Link>
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
                            if (asset.status === "RETIRED") return "EXPIRED";
                            const used = asset.seats_used ?? 0;
                            const total = asset.seats_total;
                            const isFull = total !== null && total !== undefined && used >= total;
                            const status = isFull ? "ASSIGNED" : "IN_STOCK";
                            return `${status} (${used}/${total ?? "∞"})`;
                          })()
                        : asset.status}
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
                      setCurrentPage(1);
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
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
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
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
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
