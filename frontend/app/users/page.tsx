"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch, getErrorMessage } from "@/lib/api";
import { getToken, clearToken } from "@/lib/auth";
import { validateEmail, validatePassword, validateName } from "@/lib/validation";

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
  role: string;
  is_active: boolean;
  status: string;
};

type CurrentUser = {
  id: number;
  role: string;
};

type UserRequest = {
  id: number;
  requested_name: string;
  requested_email: string;
  requested_role: string;
  requester_id: number;
  target_admin_id: number;
  status: string;
  created_at: string;
  requester_name: string | null;
  requester_email: string | null;
};

const ROLE_OPTIONS = ["EMPLOYEE", "MANAGER", "ADMIN", "AUDITOR"];

// Role priority for sorting (lower = higher priority)
const ROLE_PRIORITY: Record<string, number> = {
  ADMIN: 1,
  MANAGER: 2,
  EMPLOYEE: 3,
  AUDITOR: 4,
};

export default function UsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Create user form state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState("EMPLOYEE");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Request user form state (for managers)
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [requestName, setRequestName] = useState("");
  const [requestEmail, setRequestEmail] = useState("");
  const [requestRole, setRequestRole] = useState("EMPLOYEE");
  const [requestAdminId, setRequestAdminId] = useState<number | "">("");
  const [requestSent, setRequestSent] = useState(false);
  const [requestedAdminName, setRequestedAdminName] = useState("");
  const [submittingRequest, setSubmittingRequest] = useState(false);

  // Pending requests (for admins)
  const [pendingRequests, setPendingRequests] = useState<UserRequest[]>([]);

  const isAdmin = currentUser?.role === "ADMIN";
  const isManager = currentUser?.role === "MANAGER";
  const isEmployee = currentUser?.role === "EMPLOYEE";

  // Get list of active admins for the request dropdown
  const activeAdmins = users.filter((u) => u.role === "ADMIN" && u.is_active);
  
  // Count pending requests for notification
  const pendingCount = pendingRequests.filter((r) => r.status === "PENDING").length;

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

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
        if (!matchesName && !matchesEmail) {
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

  // Reset to page 1 when users or filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [users.length, searchQuery, filterRole, filterStatus]);

  async function loadUsers() {
    try {
      setError(null);
      const token = getToken();
      if (!token) throw new Error("Not logged in");

      const [usersData, meData] = await Promise.all([
        apiFetch<User[]>("/users", {}, token),
        apiFetch<CurrentUser>("/auth/me", {}, token),
      ]);

      setUsers(usersData);
      setCurrentUser(meData);

      // Load user requests (for admins and managers)
      if (meData.role === "ADMIN" || meData.role === "MANAGER") {
        try {
          const requestsData = await apiFetch<UserRequest[]>("/user-requests", {}, token);
          setPendingRequests(requestsData);
        } catch {
          // Ignore errors fetching requests
        }
      }
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function deactivateUser(userId: number, userName: string, userRole: string) {
    const isTargetAdmin = userRole === "ADMIN";
    
    const message = isTargetAdmin
      ? `Are you sure you want to deactivate ADMIN user "${userName}"? This action requires confirmation.\n\nAll assets assigned to this user will be automatically returned.`
      : `Are you sure you want to deactivate user "${userName}"?\n\nAll assets assigned to this user will be automatically returned.`;

    if (!window.confirm(message)) return;

    try {
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
        alert(`User deactivated.\n\nReturned assets:\n${result.returned_assets.join("\n")}`);
      }
      
      await loadUsers();
    } catch (err: unknown) {
      alert(getErrorMessage(err));
    }
  }

  async function activateUser(userId: number, userName: string) {
    const message = `Are you sure you want to reactivate user "${userName}"?`;
    if (!window.confirm(message)) return;

    try {
      const token = getToken();
      if (!token) throw new Error("Not logged in");

      await apiFetch(`/users/${userId}/activate`, { method: "POST" }, token);
      await loadUsers();
    } catch (err: unknown) {
      alert(getErrorMessage(err));
    }
  }

  async function changeUserRole(userId: number, userName: string, currentRole: string, newRole: string) {
    if (currentRole === newRole) return;

    const message = `Are you sure you want to change ${userName}'s role from ${currentRole} to ${newRole}?`;
    if (!window.confirm(message)) return;

    try {
      const token = getToken();
      if (!token) throw new Error("Not logged in");

      await apiFetch(
        `/users/${userId}/role?new_role=${encodeURIComponent(newRole)}`,
        { method: "PATCH" },
        token
      );
      await loadUsers();
    } catch (err: unknown) {
      alert(getErrorMessage(err));
    }
  }

  async function createUser() {
    setCreateError(null);
    
    // Validate all fields
    const nameResult = validateName(newName);
    if (!nameResult.isValid) {
      setCreateError(nameResult.error ?? "Invalid name");
      return;
    }
    
    const emailResult = validateEmail(newEmail);
    if (!emailResult.isValid) {
      setCreateError(emailResult.error ?? "Invalid email");
      return;
    }
    
    const passwordResult = validatePassword(newPassword);
    if (!passwordResult.isValid) {
      setCreateError(passwordResult.error ?? "Invalid password");
      return;
    }

    setCreating(true);
    try {
      const token = getToken();
      if (!token) throw new Error("Not logged in");

      await apiFetch(
        "/users",
        {
          method: "POST",
          body: JSON.stringify({
            name: newName.trim(),
            email: newEmail.trim(),
            password: newPassword,
            role: newRole,
          }),
        },
        token
      );

      // Reset form and close
      setNewName("");
      setNewEmail("");
      setNewPassword("");
      setNewRole("EMPLOYEE");
      setShowCreateForm(false);
      await loadUsers();
    } catch (err: unknown) {
      setCreateError(getErrorMessage(err));
    } finally {
      setCreating(false);
    }
  }

  function cancelCreate() {
    setShowCreateForm(false);
    setNewName("");
    setNewEmail("");
    setNewPassword("");
    setNewRole("EMPLOYEE");
    setCreateError(null);
  }

  async function submitRequest() {
    if (!requestName.trim() || !requestEmail.trim()) {
      alert("Please fill in name and email");
      return;
    }
    if (!requestAdminId) {
      alert("Please select an admin to send the request to");
      return;
    }
    
    setSubmittingRequest(true);
    try {
      const token = getToken();
      if (!token) throw new Error("Not logged in");

      await apiFetch(
        "/user-requests",
        {
          method: "POST",
          body: JSON.stringify({
            requested_name: requestName.trim(),
            requested_email: requestEmail.trim(),
            requested_role: requestRole,
            target_admin_id: requestAdminId,
          }),
        },
        token
      );

      // Get the admin name for the success message
      const selectedAdmin = activeAdmins.find((a) => a.id === requestAdminId);
      setRequestedAdminName(selectedAdmin?.name ?? "Admin");
      
      setRequestSent(true);
      setShowRequestForm(false);
      setRequestName("");
      setRequestEmail("");
      setRequestRole("EMPLOYEE");
      setRequestAdminId("");
      
      // Clear the success message after 5 seconds
      setTimeout(() => setRequestSent(false), 5000);
      
      await loadUsers();
    } catch (err: unknown) {
      alert(getErrorMessage(err));
    } finally {
      setSubmittingRequest(false);
    }
  }

  function cancelRequest() {
    setShowRequestForm(false);
    setRequestName("");
    setRequestEmail("");
    setRequestRole("EMPLOYEE");
    setRequestAdminId("");
  }

  async function approveRequest(requestId: number, requestedName: string) {
    if (!window.confirm(`Approve request for "${requestedName}"? This will create the user.`)) return;
    
    try {
      const token = getToken();
      if (!token) throw new Error("Not logged in");

      const result = await apiFetch<{
        message: string;
        temporary_password: string;
      }>(`/user-requests/${requestId}/approve`, { method: "POST" }, token);
      
      // Show the temporary password to the admin
      alert(
        `User "${requestedName}" created successfully!\n\n` +
        `Temporary Password: ${result.temporary_password}\n\n` +
        `Please share this password with the user. They should change it after first login.`
      );
      
      await loadUsers();
    } catch (err: unknown) {
      alert(getErrorMessage(err));
    }
  }

  async function denyRequest(requestId: number, requestedName: string) {
    if (!window.confirm(`Deny request for "${requestedName}"?`)) return;
    
    try {
      const token = getToken();
      if (!token) throw new Error("Not logged in");

      await apiFetch(`/user-requests/${requestId}/deny`, { method: "POST" }, token);
      await loadUsers();
    } catch (err: unknown) {
      alert(getErrorMessage(err));
    }
  }

  useEffect(() => {
    loadUsers();
  }, []);

  // Redirect employees away from this page
  useEffect(() => {
    if (currentUser && isEmployee) {
      router.push("/assets");
    }
  }, [currentUser, isEmployee, router]);

  // Show nothing while checking if user is employee
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Loading users...</p>
        </div>
      </div>
    );
  }

  if (isEmployee) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center p-6">
        <Card className="max-w-md shadow-xl border-0">
          <CardContent className="pt-6 text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <p className="text-red-600 font-medium mb-2">Access Denied</p>
            <p className="text-sm text-muted-foreground mb-4">You do not have permission to view this page.</p>
            <Button onClick={() => router.push("/assets")} className="bg-gradient-to-r from-blue-600 to-indigo-600">
              Go to Assets
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

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
                <h1 className="text-xl font-bold text-slate-800 dark:text-white">User Management</h1>
                <p className="text-xs text-slate-500 dark:text-slate-400">Manage system users</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isAdmin && (
                <Button 
                  onClick={() => setShowCreateForm(true)}
                  className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-md shadow-blue-500/20 transition-all hover:shadow-lg hover:-translate-y-0.5"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                  </svg>
                  Add User
                </Button>
              )}
              {isManager && (
                <Button 
                  onClick={() => setShowRequestForm(true)}
                  className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 shadow-md shadow-emerald-500/20 transition-all hover:shadow-lg hover:-translate-y-0.5"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Request User
                </Button>
              )}
              <Button variant="outline" onClick={() => router.push("/assets")} className="transition-all hover:-translate-y-0.5">
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
                Assets
              </Button>
              <Button variant="outline" onClick={loadUsers} className="transition-all hover:-translate-y-0.5">
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Refresh
              </Button>
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
      <main className="max-w-7xl mx-auto px-6 py-6 space-y-4">
      <Card className="shadow-xl border-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm">
        <CardHeader className="border-b border-slate-100 dark:border-slate-800">
          <CardTitle className="text-lg font-semibold text-slate-800 dark:text-white flex items-center gap-2">
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
          {/* Create User Form */}
          {showCreateForm && isAdmin && (
            <Card className="border-2 border-primary/20">
              <CardHeader>
                <CardTitle className="text-lg">Add New User</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {createError && (
                  <p className="text-sm text-red-600">{createError}</p>
                )}
                <div className="space-y-1">
                  <label className="text-sm font-medium">Name</label>
                  <Input
                    placeholder="Full Name"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Email</label>
                  <Input
                    type="email"
                    placeholder="email@example.com"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Password</label>
                  <Input
                    type="password"
                    placeholder="Minimum 8 characters"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Role</label>
                  <select
                    className="w-full border rounded-md px-3 py-2 bg-transparent"
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value)}
                  >
                    {ROLE_OPTIONS.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2 pt-2">
                  <Button onClick={createUser} disabled={creating}>
                    {creating ? "Creating..." : "Create User"}
                  </Button>
                  <Button variant="outline" onClick={cancelCreate} disabled={creating}>
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Request User Form (for Managers) */}
          {showRequestForm && isManager && (
            <Card className="border-2 border-blue-200">
              <CardHeader>
                <CardTitle className="text-lg">Request New User</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Submit a request to admin to add a new user.
                </p>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Name</label>
                  <Input
                    placeholder="Full Name"
                    value={requestName}
                    onChange={(e) => setRequestName(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Email</label>
                  <Input
                    type="email"
                    placeholder="email@example.com"
                    value={requestEmail}
                    onChange={(e) => setRequestEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Suggested Role</label>
                  <select
                    className="w-full border rounded-md px-3 py-2 bg-transparent"
                    value={requestRole}
                    onChange={(e) => setRequestRole(e.target.value)}
                  >
                    {ROLE_OPTIONS.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Send Request To</label>
                  <select
                    className="w-full border rounded-md px-3 py-2 bg-transparent"
                    value={requestAdminId}
                    onChange={(e) =>
                      setRequestAdminId(e.target.value === "" ? "" : Number(e.target.value))
                    }
                  >
                    <option value="">Select an admin…</option>
                    {activeAdmins.map((admin) => (
                      <option key={admin.id} value={admin.id}>
                        {admin.name} ({admin.email})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2 pt-2">
                  <Button onClick={submitRequest} disabled={submittingRequest}>
                    {submittingRequest ? "Submitting..." : "Submit Request"}
                  </Button>
                  <Button variant="outline" onClick={cancelRequest} disabled={submittingRequest}>
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Request Sent Success Message */}
          {requestSent && (
            <div className="p-4 bg-green-50 border border-green-200 rounded-md">
              <p className="text-green-700 font-medium">
                Request submitted successfully to {requestedAdminName}! They will review your request.
              </p>
            </div>
          )}

          {/* Pending Requests Section (for Admins) */}
          {isAdmin && pendingCount > 0 && (
            <Card className="border-2 border-orange-200">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  Pending User Requests
                  <span className="bg-red-500 text-white text-xs px-2 py-1 rounded-full">
                    {pendingCount}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>Requested Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Requested By</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingRequests
                      .filter((r) => r.status === "PENDING")
                      .map((req, index) => (
                        <TableRow key={req.id}>
                          <TableCell>{index + 1}</TableCell>
                          <TableCell>{req.requested_name}</TableCell>
                          <TableCell>{req.requested_email}</TableCell>
                          <TableCell>{req.requested_role}</TableCell>
                          <TableCell>
                            {req.requester_name ?? `User #${req.requester_id}`}
                          </TableCell>
                          <TableCell>
                            {new Date(req.created_at).toLocaleDateString()}
                          </TableCell>
                          <TableCell className="space-x-2">
                            <Button
                              size="sm"
                              onClick={() => approveRequest(req.id, req.requested_name)}
                            >
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => denyRequest(req.id, req.requested_name)}
                            >
                              Deny
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Search and Filter */}
          <div className="flex flex-wrap gap-3 mb-4">
            <Input
              placeholder="Search by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-64"
            />
            <select
              className="border rounded-md px-3 py-2 text-sm"
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value)}
            >
              <option value="">All Roles</option>
              <option value="ADMIN">Admin</option>
              <option value="MANAGER">Manager</option>
              <option value="EMPLOYEE">Employee</option>
              <option value="AUDITOR">Auditor</option>
            </select>
            <select
              className="border rounded-md px-3 py-2 text-sm"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as "" | "active" | "inactive")}
            >
              <option value="">All Statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
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

          {error && <p className="text-sm text-red-600">{error}</p>}

          {!loading && !error && (
            <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  {isAdmin && <TableHead>Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedUsers.map((user, index) => (
                  <TableRow key={user.id}>
                    <TableCell>{(currentPage - 1) * itemsPerPage + index + 1}</TableCell>
                    <TableCell>
                      <Link href={`/users/${user.id}`} className="text-blue-600 hover:underline">
                        {user.name}
                      </Link>
                    </TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>
                      {isAdmin && user.id !== currentUser?.id ? (
                        <select
                          className="border rounded px-2 py-1 bg-transparent text-sm"
                          value={user.role}
                          onChange={(e) =>
                            changeUserRole(user.id, user.name, user.role, e.target.value)
                          }
                        >
                          {ROLE_OPTIONS.map((role) => (
                            <option key={role} value={role}>
                              {role}
                            </option>
                          ))}
                        </select>
                      ) : (
                        user.role
                      )}
                    </TableCell>
                    <TableCell>
                      <span
                        className={
                          user.is_active
                            ? "text-green-600 font-medium"
                            : "text-red-600 font-medium"
                        }
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

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">
                    Showing {(currentPage - 1) * itemsPerPage + 1} to{" "}
                    {Math.min(currentPage * itemsPerPage, sortedUsers.length)} of{" "}
                    {sortedUsers.length} users
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
