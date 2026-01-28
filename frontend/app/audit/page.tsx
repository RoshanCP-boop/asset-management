"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch, getErrorMessage } from "@/lib/api";
import { getToken, clearToken } from "@/lib/auth";
import { formatDateTime } from "@/lib/date";

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

// Event type options for filters
const USER_EVENT_TYPES = [
  "USER_CREATED",
  "USER_DEACTIVATED",
  "USER_REACTIVATED",
  "ROLE_CHANGED",
  "PASSWORD_CHANGED",
  "REQUEST_CREATED",
  "REQUEST_APPROVED",
  "REQUEST_DENIED",
];

const ASSET_EVENT_TYPES = [
  "CREATE",
  "ASSIGN",
  "RETURN",
  "UPDATE",
  "MOVE",
  "REPAIR",
  "RETIRE",
];

type CurrentUser = {
  id: number;
  role: string;
  email: string;
};

type AuditSummary = {
  total_users: number;
  active_users: number;
  inactive_users: number;
  total_assets: number;
  hardware_count: number;
  software_count: number;
  assigned_assets: number;
  in_stock_assets: number;
  retired_assets: number;
  user_events_today: number;
  user_events_week: number;
  asset_events_today: number;
  asset_events_week: number;
};

type UserEvent = {
  id: number;
  event_type: string;
  timestamp: string;
  target_user_id: number | null;
  actor_user_id: number | null;
  old_value: string | null;
  new_value: string | null;
  notes: string | null;
  target_user_name: string | null;
  actor_user_name: string | null;
};

type AssetEvent = {
  id: number;
  asset_id: number;
  asset_tag: string;
  event_type: string;
  from_user_id: number | null;
  to_user_id: number | null;
  from_location_id: number | null;
  to_location_id: number | null;
  actor_user_id: number | null;
  timestamp: string;
  notes: string | null;
  from_user_name: string | null;
  to_user_name: string | null;
  actor_user_name: string | null;
};

export default function AuditDashboardPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Data state
  const [summary, setSummary] = useState<AuditSummary | null>(null);
  const [userEvents, setUserEvents] = useState<UserEvent[]>([]);
  const [assetEvents, setAssetEvents] = useState<AssetEvent[]>([]);

  // Tab state - initialize from URL param
  const initialTab = searchParams.get("tab");
  const defaultTab = initialTab === "users" ? "users" : initialTab === "assets" ? "assets" : "summary";
  const [activeTab, setActiveTab] = useState<"summary" | "users" | "assets">(defaultTab);
  const [refreshing, setRefreshing] = useState(false);

  // Filter state for user events
  const [userEventSearch, setUserEventSearch] = useState("");
  const [userEventTypeFilter, setUserEventTypeFilter] = useState("");

  // Filter state for asset events
  const [assetEventSearch, setAssetEventSearch] = useState("");
  const [assetEventTypeFilter, setAssetEventTypeFilter] = useState("");

  // Filtered user events
  const filteredUserEvents = useMemo(() => {
    return userEvents.filter((event) => {
      // Filter by event type
      if (userEventTypeFilter && event.event_type !== userEventTypeFilter) {
        return false;
      }
      // Filter by search (target user, actor, or notes)
      if (userEventSearch) {
        const search = userEventSearch.toLowerCase();
        const matchesTarget = event.target_user_name?.toLowerCase().includes(search);
        const matchesActor = event.actor_user_name?.toLowerCase().includes(search);
        const matchesNotes = event.notes?.toLowerCase().includes(search);
        if (!matchesTarget && !matchesActor && !matchesNotes) {
          return false;
        }
      }
      return true;
    });
  }, [userEvents, userEventSearch, userEventTypeFilter]);

  // Filtered asset events
  const filteredAssetEvents = useMemo(() => {
    return assetEvents.filter((event) => {
      // Filter by event type
      if (assetEventTypeFilter && event.event_type !== assetEventTypeFilter) {
        return false;
      }
      // Filter by search (asset tag, user names, or notes)
      if (assetEventSearch) {
        const search = assetEventSearch.toLowerCase();
        const matchesTag = event.asset_tag?.toLowerCase().includes(search);
        const matchesFromUser = event.from_user_name?.toLowerCase().includes(search);
        const matchesToUser = event.to_user_name?.toLowerCase().includes(search);
        const matchesActor = event.actor_user_name?.toLowerCase().includes(search);
        const matchesNotes = event.notes?.toLowerCase().includes(search);
        if (!matchesTag && !matchesFromUser && !matchesToUser && !matchesActor && !matchesNotes) {
          return false;
        }
      }
      return true;
    });
  }, [assetEvents, assetEventSearch, assetEventTypeFilter]);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      setError(null);
      const token = getToken();
      if (!token) {
        router.push("/login");
        return;
      }

      // Load current user first to check permissions
      const meData = await apiFetch<CurrentUser>("/auth/me", {}, token);
      setCurrentUser(meData);

      // Only admin and auditor can access
      if (meData.role !== "ADMIN" && meData.role !== "AUDITOR") {
        router.push("/assets");
        return;
      }

      // Load all audit data in parallel
      const [summaryData, userEventsData, assetEventsData] = await Promise.all([
        apiFetch<AuditSummary>("/audit/summary", {}, token),
        apiFetch<UserEvent[]>("/audit/user-events?limit=100", {}, token),
        apiFetch<AssetEvent[]>("/audit/asset-events?limit=100", {}, token),
      ]);

      setSummary(summaryData);
      setUserEvents(userEventsData);
      setAssetEvents(assetEventsData);
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }


  function getUserEventBadgeColor(eventType: string) {
    switch (eventType) {
      case "USER_CREATED": return "bg-green-100 text-green-800";
      case "USER_DEACTIVATED": return "bg-red-100 text-red-800";
      case "USER_REACTIVATED": return "bg-blue-100 text-blue-800";
      case "ROLE_CHANGED": return "bg-purple-100 text-purple-800";
      case "REQUEST_CREATED": return "bg-yellow-100 text-yellow-800";
      case "REQUEST_APPROVED": return "bg-emerald-100 text-emerald-800";
      case "REQUEST_DENIED": return "bg-orange-100 text-orange-800";
      case "PASSWORD_CHANGED": return "bg-slate-100 text-slate-800";
      default: return "bg-gray-100 text-gray-800";
    }
  }

  function getAssetEventBadgeColor(eventType: string) {
    switch (eventType) {
      case "CREATE": return "bg-green-100 text-green-800";
      case "ASSIGN": return "bg-blue-100 text-blue-800";
      case "RETURN": return "bg-amber-100 text-amber-800";
      case "MOVE": return "bg-purple-100 text-purple-800";
      case "UPDATE": return "bg-indigo-100 text-indigo-800";
      case "REPAIR": return "bg-cyan-100 text-cyan-800";
      case "RETIRE": return "bg-red-100 text-red-800";
      default: return "bg-gray-100 text-gray-800";
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50 to-indigo-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-800 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="loading-spinner w-12 h-12" />
          <p className="text-slate-600 dark:text-slate-400">Loading audit dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50 to-indigo-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-800 flex items-center justify-center">
        <Card className="max-w-md mx-auto">
          <CardContent className="p-6">
            <p className="text-red-600 mb-4">{error}</p>
            <Button onClick={() => router.push("/login")}>Go to Login</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50 to-indigo-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-800">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-700 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/assets" className="flex items-center gap-3 group">
                <div className="w-10 h-10 rounded-xl btn-primary-gradient flex items-center justify-center shadow-lg group-hover:shadow-xl transition-all">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <h1 className="text-xl font-bold text-slate-800 dark:text-white">Audit Dashboard</h1>
                  <p className="text-sm text-slate-500">System activity & compliance</p>
                </div>
              </Link>
            </div>

            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                onClick={handleRefresh}
                disabled={refreshing}
                className="hover-lift"
              >
                <svg className={`w-4 h-4 mr-2 ${refreshing ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Refresh
              </Button>

              <Link href="/assets">
                <Button variant="outline" className="hover-lift">
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
                  Assets
                </Button>
              </Link>

              <Link href="/users">
                <Button variant="outline" className="hover-lift">
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                  </svg>
                  Users
                </Button>
              </Link>

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
      <main className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* Summary Cards */}
        {summary && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Users Card */}
            <Card className="shadow-lg border-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">Total Users</p>
                    <p className="text-2xl font-bold text-slate-800">{summary.total_users}</p>
                    <p className="text-xs text-slate-400">
                      <span className="text-green-600">{summary.active_users} active</span>
                      {summary.inactive_users > 0 && (
                        <span className="text-red-500 ml-2">{summary.inactive_users} inactive</span>
                      )}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Assets Card */}
            <Card className="shadow-lg border-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center shadow-lg">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">Total Assets</p>
                    <p className="text-2xl font-bold text-slate-800">{summary.total_assets}</p>
                    <p className="text-xs text-slate-400">
                      <span className="text-blue-600">{summary.hardware_count} HW</span>
                      <span className="text-purple-600 ml-2">{summary.software_count} SW</span>
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* User Activity Card */}
            <Card className="shadow-lg border-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shadow-lg">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">User Events</p>
                    <p className="text-2xl font-bold text-slate-800">{summary.user_events_week}</p>
                    <p className="text-xs text-slate-400">
                      <span className="text-emerald-600">{summary.user_events_today} today</span>
                      <span className="text-slate-400 ml-2">/ {summary.user_events_week} this week</span>
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Asset Activity Card */}
            <Card className="shadow-lg border-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center shadow-lg">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">Asset Events</p>
                    <p className="text-2xl font-bold text-slate-800">{summary.asset_events_week}</p>
                    <p className="text-xs text-slate-400">
                      <span className="text-amber-600">{summary.asset_events_today} today</span>
                      <span className="text-slate-400 ml-2">/ {summary.asset_events_week} this week</span>
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Asset Status Breakdown */}
        {summary && (
          <Card className="shadow-lg border-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm">
            <CardHeader className="border-b border-slate-100 dark:border-slate-800 pb-4">
              <CardTitle className="text-lg font-semibold text-slate-800 dark:text-white flex items-center gap-2">
                <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                Asset Status Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="grid grid-cols-3 gap-6">
                <div className="text-center p-4 bg-green-50 rounded-xl">
                  <p className="text-3xl font-bold text-green-600">{summary.in_stock_assets}</p>
                  <p className="text-sm text-green-700 mt-1">In Stock</p>
                </div>
                <div className="text-center p-4 bg-blue-50 rounded-xl">
                  <p className="text-3xl font-bold text-blue-600">{summary.assigned_assets}</p>
                  <p className="text-sm text-blue-700 mt-1">Assigned</p>
                </div>
                <div className="text-center p-4 bg-slate-50 rounded-xl">
                  <p className="text-3xl font-bold text-slate-600">{summary.retired_assets}</p>
                  <p className="text-sm text-slate-700 mt-1">Retired</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Tabs for Activity Logs */}
        <Card className="shadow-xl border-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm">
          <CardHeader className="border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg font-semibold text-slate-800 dark:text-white">
                Activity Logs
              </CardTitle>
              <div className="flex gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
                <button
                  onClick={() => setActiveTab("users")}
                  className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
                    activeTab === "users"
                      ? "bg-white dark:bg-slate-700 text-indigo-600 shadow-sm"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  User Events ({filteredUserEvents.length})
                </button>
                <button
                  onClick={() => setActiveTab("assets")}
                  className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
                    activeTab === "assets"
                      ? "bg-white dark:bg-slate-700 text-indigo-600 shadow-sm"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Asset Events ({filteredAssetEvents.length})
                </button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {activeTab === "users" && (
              <div>
                {/* Filters */}
                <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex flex-wrap gap-3 items-center">
                  <Input
                    type="text"
                    placeholder="Search by user or notes..."
                    value={userEventSearch}
                    onChange={(e) => setUserEventSearch(e.target.value)}
                    className="w-64"
                  />
                  <select
                    value={userEventTypeFilter}
                    onChange={(e) => setUserEventTypeFilter(e.target.value)}
                    className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  >
                    <option value="">All Event Types</option>
                    {USER_EVENT_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type.replace(/_/g, " ")}
                      </option>
                    ))}
                  </select>
                  {(userEventSearch || userEventTypeFilter) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setUserEventSearch("");
                        setUserEventTypeFilter("");
                      }}
                    >
                      Clear Filters
                    </Button>
                  )}
                  <span className="text-sm text-muted-foreground ml-auto">
                    Showing {filteredUserEvents.length} of {userEvents.length}
                  </span>
                </div>
                <div className="max-h-[500px] overflow-y-auto">
                {userEvents.length === 0 ? (
                  <div className="p-6 text-center text-muted-foreground">
                    No user events recorded yet.
                  </div>
                ) : filteredUserEvents.length === 0 ? (
                  <div className="p-6 text-center text-muted-foreground">
                    No events match your filters.
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-44">Timestamp</TableHead>
                        <TableHead className="w-36">Event</TableHead>
                        <TableHead>Target User</TableHead>
                        <TableHead>Details</TableHead>
                        <TableHead className="w-32">Actor</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredUserEvents.map((event) => (
                        <TableRow key={event.id} className="table-row-hover">
                          <TableCell className="text-sm text-slate-600">
                            {formatDateTime(event.timestamp)}
                          </TableCell>
                          <TableCell>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getUserEventBadgeColor(event.event_type)}`}>
                              {event.event_type.replace(/_/g, " ")}
                            </span>
                          </TableCell>
                          <TableCell className="font-medium">
                            {event.target_user_name || "-"}
                          </TableCell>
                          <TableCell className="text-sm">
                            <div>
                              {event.old_value && event.new_value && (
                                <span className="text-slate-500">
                                  {event.old_value} → {event.new_value}
                                </span>
                              )}
                              {event.notes && (
                                <p className="text-slate-500 text-xs mt-0.5 max-w-xs truncate" title={event.notes}>
                                  {event.notes}
                                </p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-slate-600">
                            {event.actor_user_name || "-"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
              </div>
            )}

            {activeTab === "assets" && (
              <div>
                {/* Filters */}
                <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex flex-wrap gap-3 items-center">
                  <Input
                    type="text"
                    placeholder="Search by asset, user, or notes..."
                    value={assetEventSearch}
                    onChange={(e) => setAssetEventSearch(e.target.value)}
                    className="w-64"
                  />
                  <select
                    value={assetEventTypeFilter}
                    onChange={(e) => setAssetEventTypeFilter(e.target.value)}
                    className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  >
                    <option value="">All Event Types</option>
                    {ASSET_EVENT_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type.replace(/_/g, " ")}
                      </option>
                    ))}
                  </select>
                  {(assetEventSearch || assetEventTypeFilter) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setAssetEventSearch("");
                        setAssetEventTypeFilter("");
                      }}
                    >
                      Clear Filters
                    </Button>
                  )}
                  <span className="text-sm text-muted-foreground ml-auto">
                    Showing {filteredAssetEvents.length} of {assetEvents.length}
                  </span>
                </div>
              <div className="max-h-[500px] overflow-y-auto">
                {assetEvents.length === 0 ? (
                  <div className="p-6 text-center text-muted-foreground">
                    No asset events recorded yet.
                  </div>
                ) : filteredAssetEvents.length === 0 ? (
                  <div className="p-6 text-center text-muted-foreground">
                    No events match your filters.
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-44">Timestamp</TableHead>
                        <TableHead className="w-28">Asset</TableHead>
                        <TableHead className="w-32">Event</TableHead>
                        <TableHead>Details</TableHead>
                        <TableHead className="w-32">Actor</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredAssetEvents.map((event) => (
                        <TableRow key={event.id} className="table-row-hover">
                          <TableCell className="text-sm text-slate-600">
                            {formatDateTime(event.timestamp)}
                          </TableCell>
                          <TableCell>
                            <Link
                              href={`/assets/${event.asset_id}`}
                              className="text-indigo-600 hover:text-indigo-800 font-medium"
                            >
                              {event.asset_tag}
                            </Link>
                          </TableCell>
                          <TableCell>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getAssetEventBadgeColor(event.event_type)}`}>
                              {event.event_type.replace(/_/g, " ")}
                            </span>
                          </TableCell>
                          <TableCell className="text-sm">
                            <div className="flex flex-col gap-0.5">
                              {event.from_user_name && (
                                <span className="text-slate-500">
                                  From: <span className="font-medium text-slate-700">{event.from_user_name}</span>
                                </span>
                              )}
                              {event.to_user_name && (
                                <span className="text-slate-500">
                                  To: <span className="font-medium text-slate-700">{event.to_user_name}</span>
                                </span>
                              )}
                              {event.notes && (
                                <p className="text-slate-400 text-xs truncate max-w-xs" title={event.notes}>
                                  {event.notes}
                                </p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-slate-600">
                            {event.actor_user_name || "-"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
