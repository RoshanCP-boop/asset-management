"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch, getErrorMessage } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { formatDateTime } from "@/lib/date";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  role: string;
  is_active: boolean;
  status: string;
};

type Asset = {
  id: number;
  asset_tag: string;
  asset_type: string;
  category?: string | null;
  subscription?: string | null;
  model?: string | null;
  status: string;
  assigned_to_user_id?: number | null;
  seats_total?: number | null;
  seats_used?: number | null;
};

type CurrentUser = {
  id: number;
  role: string;
};

// Category priority for hardware sorting (lower = higher priority)
const CATEGORY_PRIORITY: Record<string, number> = {
  LAPTOP: 1,
  MONITOR: 2,
  TABLET: 3,
  PHONE: 4,
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

type AssetEvent = {
  id: number;
  asset_id: number;
  event_type: string;
  from_user_id?: number | null;
  to_user_id?: number | null;
  actor_user_id?: number | null;
  timestamp: string;
  notes?: string | null;
};


export default function UserDetailPage() {
  const params = useParams();
  const router = useRouter();
  const userId = params.id as string;

  const [user, setUser] = useState<User | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [events, setEvents] = useState<AssetEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Bulk assign state
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [allAssets, setAllAssets] = useState<Asset[]>([]);
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<number>>(new Set());
  const [assigning, setAssigning] = useState(false);
  const [showAssignSection, setShowAssignSection] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const canAssign = currentUser?.role === "ADMIN" || currentUser?.role === "MANAGER";

  // Get available assets (hardware: unassigned, software: has available seats, exclude retired)
  const availableAssets = allAssets.filter((a) => {
    // Exclude retired assets
    if (a.status === "RETIRED") return false;
    
    if (a.asset_type === "SOFTWARE") {
      const total = a.seats_total;
      const used = a.seats_used ?? 0;
      return total === null || total === undefined || used < total;
    }
    return a.assigned_to_user_id === null;
  });

  // Sort available assets: Hardware first (sorted by category), then Software
  const sortedAvailableAssets = useMemo(() => {
    return [...availableAssets].sort((a, b) => {
      // Hardware comes before Software
      if (a.asset_type !== b.asset_type) {
        return a.asset_type === "HARDWARE" ? -1 : 1;
      }
      // Within Hardware, sort by category priority
      if (a.asset_type === "HARDWARE") {
        const priorityA = CATEGORY_PRIORITY[a.category ?? ""] ?? 99;
        const priorityB = CATEGORY_PRIORITY[b.category ?? ""] ?? 99;
        if (priorityA !== priorityB) {
          return priorityA - priorityB;
        }
      }
      // Same type and category: sort by ID ascending
      return a.id - b.id;
    });
  }, [availableAssets]);

  async function loadUserData() {
    try {
      setError(null);
      const token = getToken();
      if (!token) throw new Error("Not logged in");

      const [userData, assetsData, eventsData, meData, allAssetsData] = await Promise.all([
        apiFetch<User>(`/users/${userId}`, {}, token),
        apiFetch<Asset[]>(`/users/${userId}/assets`, {}, token),
        apiFetch<AssetEvent[]>(`/users/${userId}/events`, {}, token),
        apiFetch<CurrentUser>(`/auth/me`, {}, token),
        apiFetch<Asset[]>(`/assets`, {}, token),
      ]);

      setUser(userData);
      setAssets(assetsData);
      setEvents(eventsData);
      setCurrentUser(meData);
      setAllAssets(allAssetsData);
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function bulkAssign() {
    if (selectedAssetIds.size === 0) {
      setActionError("Please select at least one asset to assign.");
      return;
    }

    setAssigning(true);
    setActionError(null);
    setActionMessage(null);
    const token = getToken();
    if (!token) {
      setActionError("Not logged in");
      setAssigning(false);
      return;
    }

    const results: { success: number; failed: string[] } = { success: 0, failed: [] };

    for (const assetId of selectedAssetIds) {
      try {
        await apiFetch(
          `/assets/${assetId}/assign`,
          {
            method: "POST",
            body: JSON.stringify({ user_id: parseInt(userId, 10) }),
          },
          token
        );
        results.success++;
      } catch (err: unknown) {
        const asset = allAssets.find((a) => a.id === assetId);
        results.failed.push(`${asset?.asset_tag ?? assetId}: ${getErrorMessage(err)}`);
      }
    }

    setAssigning(false);
    setSelectedAssetIds(new Set());
    setShowAssignSection(false);

    if (results.failed.length > 0) {
      setActionMessage(
        `Assigned ${results.success} asset(s). Failed: ${results.failed.join(", ")}`
      );
    } else {
      setActionMessage(`Successfully assigned ${results.success} asset(s).`);
    }

    // Reload data
    await loadUserData();
  }

  function toggleAssetSelection(assetId: number) {
    setSelectedAssetIds((prev) => {
      const next = new Set(prev);
      if (next.has(assetId)) {
        next.delete(assetId);
      } else {
        next.add(assetId);
      }
      return next;
    });
  }

  function selectAllAvailable() {
    setSelectedAssetIds(new Set(availableAssets.map((a) => a.id)));
  }

  function clearSelection() {
    setSelectedAssetIds(new Set());
  }

  useEffect(() => {
    loadUserData();
  }, [userId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-subtle flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 animate-fade-in">
          <div className="loading-spinner" />
          <p className="text-sm text-muted-foreground">Loading user details...</p>
        </div>
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center p-6">
        <Card className="max-w-md shadow-xl border-0">
          <CardContent className="pt-6 text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <p className="text-red-600 font-medium mb-2">Error</p>
            <p className="text-sm text-muted-foreground mb-4">{error ?? "User not found"}</p>
            <Button onClick={() => router.push("/users")} className="bg-gradient-to-r from-blue-600 to-indigo-600">
              Back to Users
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      {/* Header */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 shadow-sm">
        <div className="max-w-5xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/20 text-white text-xl font-bold">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-800 dark:text-white">{user.name}</h1>
                <p className="text-sm text-slate-500 dark:text-slate-400">{user.email}</p>
              </div>
            </div>
            <Button variant="outline" onClick={() => router.push("/users")} className="transition-all hover:-translate-y-0.5">
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Back to Users
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-6 space-y-6">
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
      {/* User Info Card */}
      <Card className="shadow-lg border-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm">
        <CardHeader className="border-b border-slate-100 dark:border-slate-800">
          <CardTitle className="flex items-center gap-2">
            <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            User Information
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
              <p className="text-xs text-slate-500 uppercase tracking-wide">ID</p>
              <p className="font-semibold text-slate-800 dark:text-white">{user.id}</p>
            </div>
            <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
              <p className="text-xs text-slate-500 uppercase tracking-wide">Name</p>
              <p className="font-semibold text-slate-800 dark:text-white">{user.name}</p>
            </div>
            <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
              <p className="text-xs text-slate-500 uppercase tracking-wide">Role</p>
              <p className="font-semibold text-slate-800 dark:text-white">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                  user.role === "ADMIN" ? "bg-purple-100 text-purple-800" :
                  user.role === "MANAGER" ? "bg-blue-100 text-blue-800" :
                  user.role === "AUDITOR" ? "bg-orange-100 text-orange-800" :
                  "bg-slate-100 text-slate-800"
                }`}>
                  {user.role}
                </span>
              </p>
            </div>
            <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
              <p className="text-xs text-slate-500 uppercase tracking-wide">Status</p>
              <p className="font-semibold">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                  user.is_active ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                }`}>
                  {user.status}
                </span>
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Assigned Assets */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Assigned Assets ({assets.length})</CardTitle>
          {canAssign && user.is_active && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAssignSection(!showAssignSection)}
            >
              {showAssignSection ? "Cancel" : "Assign Assets"}
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {assets.length === 0 ? (
            <p className="text-muted-foreground">No assets assigned to this user.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Tag</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Category/Subscription</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assets.map((asset, index) => (
                  <TableRow key={asset.id}>
                    <TableCell>{index + 1}</TableCell>
                    <TableCell>
                      <Link href={`/assets/${asset.id}`} className="text-blue-600 hover:underline">
                        {asset.asset_tag}
                      </Link>
                    </TableCell>
                    <TableCell>{asset.asset_type}</TableCell>
                    <TableCell>
                      {asset.asset_type === "SOFTWARE"
                        ? asset.subscription
                        : asset.category ?? "-"}
                    </TableCell>
                    <TableCell>{asset.model ?? "-"}</TableCell>
                    <TableCell>
                      {asset.asset_type === "SOFTWARE"
                        ? (() => {
                            if (asset.status === "RETIRED") return "EXPIRED";
                            const used = asset.seats_used ?? 0;
                            const total = asset.seats_total;
                            const isFull = total !== null && total !== undefined && used >= total;
                            return isFull ? "ASSIGNED" : "IN_STOCK";
                          })()
                        : asset.status}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Bulk Assign Assets */}
      {showAssignSection && canAssign && (
        <Card className="border-2 border-blue-200">
          <CardHeader>
            <CardTitle>Select Assets to Assign</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2 items-center">
              <Button variant="outline" size="sm" onClick={selectAllAvailable}>
                Select All ({availableAssets.length})
              </Button>
              <Button variant="outline" size="sm" onClick={clearSelection}>
                Clear Selection
              </Button>
              <span className="text-sm text-muted-foreground ml-2">
                {selectedAssetIds.size} selected
              </span>
            </div>

            {availableAssets.length === 0 ? (
              <p className="text-muted-foreground">No available assets to assign.</p>
            ) : (
              <div className="max-h-80 overflow-y-auto border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12"></TableHead>
                      <TableHead>#</TableHead>
                      <TableHead>Tag</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Category/Subscription</TableHead>
                      <TableHead>Model</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedAvailableAssets.map((asset, index) => (
                      <TableRow
                        key={asset.id}
                        className={selectedAssetIds.has(asset.id) ? "bg-blue-50" : ""}
                        onClick={() => toggleAssetSelection(asset.id)}
                        style={{ cursor: "pointer" }}
                      >
                        <TableCell>
                          <input
                            type="checkbox"
                            checked={selectedAssetIds.has(asset.id)}
                            onChange={() => toggleAssetSelection(asset.id)}
                            className="w-4 h-4"
                          />
                        </TableCell>
                        <TableCell>{index + 1}</TableCell>
                        <TableCell>{asset.asset_tag}</TableCell>
                        <TableCell>{asset.asset_type}</TableCell>
                        <TableCell>
                          {asset.asset_type === "SOFTWARE"
                            ? `${asset.subscription} (${asset.seats_used ?? 0}/${asset.seats_total ?? "∞"})`
                            : asset.category ?? "-"}
                        </TableCell>
                        <TableCell>{asset.model ?? "-"}</TableCell>
                        <TableCell>
                          {asset.asset_type === "SOFTWARE"
                            ? (() => {
                                if (asset.status === "RETIRED") return "EXPIRED";
                                const used = asset.seats_used ?? 0;
                                const total = asset.seats_total;
                                const isFull = total !== null && total !== undefined && used >= total;
                                return isFull ? "ASSIGNED" : "IN_STOCK";
                              })()
                            : asset.status}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            <div className="flex gap-2">
              <Button
                onClick={bulkAssign}
                disabled={assigning || selectedAssetIds.size === 0}
              >
                {assigning ? "Assigning..." : `Assign ${selectedAssetIds.size} Asset(s)`}
              </Button>
              <Button variant="outline" onClick={() => setShowAssignSection(false)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Event History */}
      <Card className="shadow-xl border-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm">
        <CardHeader className="border-b border-slate-100 dark:border-slate-800">
          <CardTitle className="text-lg font-semibold text-slate-800 dark:text-white flex items-center gap-2">
            <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Event History
            <span className="text-sm font-normal text-slate-500">({events.length})</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {events.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground">
              No events related to this user.
            </div>
          ) : (
            <div className="max-h-96 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-44">Timestamp</TableHead>
                    <TableHead className="w-28">Asset</TableHead>
                    <TableHead className="w-32">Event</TableHead>
                    <TableHead className="w-32">Role</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {events.map((event) => {
                    // Determine user's role in this event
                    const roles: string[] = [];
                    if (event.actor_user_id === user.id) roles.push("Performed");
                    if (event.to_user_id === user.id) roles.push("Assigned To");
                    if (event.from_user_id === user.id) roles.push("Returned From");
                    
                    return (
                      <TableRow key={event.id} className="table-row-hover">
                        <TableCell className="text-sm text-slate-600">
                          {formatDateTime(event.timestamp)}
                        </TableCell>
                        <TableCell>
                          <Link 
                            href={`/assets/${event.asset_id}`} 
                            className="text-indigo-600 hover:text-indigo-800 font-medium"
                          >
                            #{event.asset_id}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            event.event_type === "CREATE" ? "bg-green-100 text-green-800" :
                            event.event_type === "ASSIGN" ? "bg-blue-100 text-blue-800" :
                            event.event_type === "RETURN" ? "bg-amber-100 text-amber-800" :
                            event.event_type === "MOVE" ? "bg-purple-100 text-purple-800" :
                            event.event_type === "UPDATE" ? "bg-indigo-100 text-indigo-800" :
                            event.event_type === "REPAIR" ? "bg-cyan-100 text-cyan-800" :
                            event.event_type === "RETIRE" ? "bg-red-100 text-red-800" :
                            "bg-gray-100 text-gray-800"
                          }`}>
                            {event.event_type.replace(/_/g, " ")}
                          </span>
                        </TableCell>
                        <TableCell>
                          {roles.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {roles.map((role, i) => (
                                <span 
                                  key={i}
                                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                    role === "Performed" ? "bg-slate-100 text-slate-700" :
                                    role === "Assigned To" ? "bg-green-100 text-green-700" :
                                    "bg-amber-100 text-amber-700"
                                  }`}
                                >
                                  {role}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-slate-500 max-w-xs truncate" title={event.notes ?? ""}>
                          {event.notes ?? "-"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
      </main>
    </div>
  );
}
