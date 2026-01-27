"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch, getErrorMessage } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

type Asset = {
  id: number;
  asset_tag: string;
  asset_type: string;
  category?: string | null;
  subscription?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  serial_number?: string | null;  
  purchase_date?: string | null;
  warranty_end?: string | null;
  renewal_date?: string | null;
  seats_total?: number | null;
  seats_used?: number | null;
  status: string;
  condition?: string | null;
  notes?: string | null;
  assigned_to_user_id?: number | null;
};

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString();
}

const STATUS_OPTIONS = ["IN_STOCK", "ASSIGNED", "IN_REPAIR", "RETIRED"];
const CONDITION_OPTIONS = ["NEW", "GOOD", "FAIR", "DAMAGED", "UNDER_REPAIR"];

// Accessory types for display purposes
const ACCESSORY_TYPES = new Set([
  "MOUSE", "KEYBOARD", "HEADSET", "WEBCAM", 
  "DOCKING_STATION", "CHARGER", "CABLE", "OTHER_ACCESSORY"
]);

const ACCESSORY_LABELS: Record<string, string> = {
  MOUSE: "Mouse",
  KEYBOARD: "Keyboard",
  HEADSET: "Headset",
  WEBCAM: "Webcam",
  DOCKING_STATION: "Docking Station",
  CHARGER: "Charger",
  CABLE: "Cable",
  OTHER_ACCESSORY: "Other",
};

function isAccessory(category: string | null | undefined): boolean {
  return !!category && ACCESSORY_TYPES.has(category);
}

const RENEWAL_PERIOD_OPTIONS = [
  { value: "1_MONTH", label: "1 Month", months: 1 },
  { value: "3_MONTHS", label: "3 Months", months: 3 },
  { value: "6_MONTHS", label: "6 Months", months: 6 },
  { value: "1_YEAR", label: "1 Year", months: 12 },
] as const;

function calculateRenewalDate(startDate: Date, months: number): string {
  const date = new Date(startDate);
  date.setMonth(date.getMonth() + months);
  return date.toISOString().split("T")[0];
}

type CurrentUser = {
  id: number;
  role: string;
};


type User = {
  id: number;
  name: string;
  email: string;
  role: string;
  is_active: boolean;
};

type AssetEvent = {
  id: number;
  event_type: string;
  timestamp: string;
  notes?: string | null;

  actor_user_id?: number | null;
  from_user_id?: number | null;
  to_user_id?: number | null;

  // ✅ if backend returns names (recommended)
  actor_user_name?: string | null;
  from_user_name?: string | null;
  to_user_name?: string | null;
};

export default function AssetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [asset, setAsset] = useState<Asset | null>(null);
  const [events, setEvents] = useState<AssetEvent[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [assignUserId, setAssignUserId] = useState<number | "">("");
  const [assignNotes, setAssignNotes] = useState("");
  const [returnNotes, setReturnNotes] = useState("");
  const [returnUserId, setReturnUserId] = useState<number | "">(""); // For software returns

  // Update form state
  const [editMode, setEditMode] = useState(false);
  const [editManufacturer, setEditManufacturer] = useState("");
  const [editModel, setEditModel] = useState("");
  const [editSerialNumber, setEditSerialNumber] = useState("");
  const [editStatus, setEditStatus] = useState("");
  const [editCondition, setEditCondition] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editRenewalPeriod, setEditRenewalPeriod] = useState("");
  const [editSeatsTotal, setEditSeatsTotal] = useState("");

  // Current user for role-based access
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const isAdmin = currentUser?.role === "ADMIN";
  const isAuditor = currentUser?.role === "AUDITOR";
  const canEdit = isAdmin; // Only admin can edit
  const canAssignReturn = currentUser?.role === "ADMIN" || currentUser?.role === "MANAGER";

  const isAssigned = useMemo(
    () => Boolean(asset?.assigned_to_user_id),
    [asset]
  );

  // For software: calculate which users currently have seats assigned
  const usersWithSeats = useMemo(() => {
    if (asset?.asset_type !== "SOFTWARE") return [];
    
    // Count assignments and returns per user
    const seatCount: Record<number, number> = {};
    
    for (const event of events) {
      if (event.event_type === "ASSIGN" && event.to_user_id) {
        seatCount[event.to_user_id] = (seatCount[event.to_user_id] ?? 0) + 1;
      }
      if (event.event_type === "RETURN" && event.from_user_id) {
        seatCount[event.from_user_id] = (seatCount[event.from_user_id] ?? 0) - 1;
      }
    }
    
    // Return user IDs with positive seat count
    return Object.entries(seatCount)
      .filter(([, count]) => count > 0)
      .map(([userId]) => parseInt(userId, 10));
  }, [asset?.asset_type, events]);

  async function load() {
    setErr(null);
    try {
      const token = getToken();
      if (!token) throw new Error("Not logged in");

      const [assetData, eventsData, usersData, meData] = await Promise.all([
        apiFetch<Asset>(`/assets/${id}`, {}, token),
        apiFetch<AssetEvent[]>(`/assets/${id}/events`, {}, token),
        apiFetch<User[]>(`/users`, {}, token),
        apiFetch<CurrentUser>(`/auth/me`, {}, token),
      ]);

      setAsset(assetData);
      setEvents(eventsData);
      setUsers(usersData);
      setCurrentUser(meData);

      // default selected user = current assigned (if any)
      if (assetData.assigned_to_user_id) {
        setAssignUserId(assetData.assigned_to_user_id);
      }
    } catch (e: unknown) {
      setErr(getErrorMessage(e));
    }
  }

  async function assignAsset() {
    if (!assignUserId) {
      alert("Pick a user to assign to.");
      return;
    }

    setBusy(true);
    try {
      const token = getToken();
      if (!token) throw new Error("Not logged in");

      await apiFetch(
        `/assets/${id}/assign`,
        {
          method: "POST",
          body: JSON.stringify({
            user_id: assignUserId,
            notes: assignNotes || null,
          }),
        },
        token
      );

      setAssignNotes("");
      await load();
    } catch (e: unknown) {
      alert(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function returnAsset() {
    // For software, require selecting a user
    if (asset?.asset_type === "SOFTWARE" && !returnUserId) {
      alert("Please select which user is returning the seat.");
      return;
    }

    setBusy(true);
    try {
      const token = getToken();
      if (!token) throw new Error("Not logged in");

      await apiFetch(
        `/assets/${id}/return`,
        {
          method: "POST",
          body: JSON.stringify({
            notes: returnNotes || null,
            user_id: asset?.asset_type === "SOFTWARE" ? returnUserId : null,
          }),
        },
        token
      );

      setReturnNotes("");
      setReturnUserId("");
      await load();
    } catch (e: unknown) {
      alert(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  function startEdit() {
    if (!asset) return;
    setEditManufacturer(asset.manufacturer ?? "");
    setEditModel(asset.model ?? "");
    setEditSerialNumber(asset.serial_number ?? "");
    setEditStatus(asset.status);
    setEditCondition(asset.condition ?? "GOOD");
    setEditNotes(asset.notes ?? "");
    setEditRenewalPeriod(RENEWAL_PERIOD_OPTIONS[3].value); // Default to 1 year
    setEditSeatsTotal(asset.seats_total?.toString() ?? "");
    setEditMode(true);
  }

  function cancelEdit() {
    setEditMode(false);
  }

  async function saveAsset() {
    // Check if serial number is being changed
    const originalSerial = asset?.serial_number ?? "";
    const newSerial = editSerialNumber || "";
    if (originalSerial !== newSerial) {
      const confirmed = window.confirm(
        `Are you sure you want to change the serial number from "${originalSerial || "(empty)"}" to "${newSerial || "(empty)"}"?`
      );
      if (!confirmed) return;
    }

    setBusy(true);
    try {
      const token = getToken();
      if (!token) throw new Error("Not logged in");

      // Calculate new renewal date if admin is editing a software asset
      let renewal_date: string | null | undefined = undefined;
      if (isAdmin && asset?.asset_type === "SOFTWARE" && editRenewalPeriod) {
        const startDate = asset.purchase_date ? new Date(asset.purchase_date) : new Date();
        const selectedPeriod = RENEWAL_PERIOD_OPTIONS.find(p => p.value === editRenewalPeriod);
        renewal_date = calculateRenewalDate(startDate, selectedPeriod?.months ?? 12);
      }

      await apiFetch(
        `/assets/${id}`,
        {
          method: "PUT",
          body: JSON.stringify({
            manufacturer: editManufacturer || null,
            model: editModel || null,
            serial_number: editSerialNumber || null,
            status: editStatus,
            condition: editCondition,
            notes: editNotes || null,
            ...(renewal_date !== undefined && { renewal_date }),
            ...(asset?.asset_type === "SOFTWARE" && { 
              seats_total: editSeatsTotal ? parseInt(editSeatsTotal, 10) : null 
            }),
          }),
        },
        token
      );

      setEditMode(false);
      await load();
    } catch (e: unknown) {
      alert(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!asset) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Loading asset details...</p>
        </div>
      </div>
    );
  }

  // helper: show name if available, else show id
  function who(name?: string | null, id?: number | null) {
    if (name) return name;
    if (id != null) return `User #${id}`;
    return "-";
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      {/* Header */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 shadow-sm">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" onClick={() => router.back()} className="text-slate-600 hover:text-slate-800">
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                Back
              </Button>
              <div className="h-6 w-px bg-slate-200" />
              <div>
                <h1 className="text-xl font-bold text-slate-800 dark:text-white">{asset.asset_tag}</h1>
                <p className="text-xs text-slate-500">
                  {asset.asset_type === "SOFTWARE" ? "Subscription" : asset.category}
                </p>
              </div>
            </div>
            {!editMode && canEdit && (
              <Button 
                onClick={startEdit}
                className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-md shadow-blue-500/20 transition-all hover:shadow-lg hover:-translate-y-0.5"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Edit Asset
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-6 space-y-4">
      {err && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg animate-in fade-in duration-200">
          <p className="text-sm text-red-600 dark:text-red-400">{err}</p>
        </div>
      )}

      <Card className="shadow-xl border-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm">
        <CardHeader className="border-b border-slate-100 dark:border-slate-800">
          <CardTitle className="flex items-center gap-2">
            <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Asset Details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {!editMode ? (
            <>
              <p>
                <b>ID:</b> {asset.id}
              </p>
              <p>
                <b>Tag:</b> {asset.asset_tag}
              </p>
              <p>
                <b>Type:</b> {asset.asset_type}
              </p>
              {asset.asset_type === "HARDWARE" ? (
                <>
                  <p>
                    <b>Category:</b> {isAccessory(asset.category) ? "Accessory" : (asset.category || "-")}
                  </p>
                  {isAccessory(asset.category) && (
                    <p>
                      <b>Accessory Type:</b> {ACCESSORY_LABELS[asset.category!] || asset.category}
                    </p>
                  )}
                </>
              ) : (
                <p>
                  <b>Name:</b> {asset.subscription || "-"}
                </p>
              )}
              {asset.asset_type === "HARDWARE" && (
                <p>
                  <b>Manufacturer:</b> {asset.manufacturer ?? "-"}
                </p>
              )}
              <p>
                <b>{asset.asset_type === "SOFTWARE" ? "Version:" : "Model:"}</b> {asset.model ?? "-"}
              </p>
              {asset.asset_type === "HARDWARE" && (
                <p>
                  <b>Serial #:</b> {asset.serial_number ?? "-"}
                </p>
              )}
              {asset.asset_type === "HARDWARE" ? (
                <>
                  <p>
                    <b>Warranty Start:</b> {formatDate(asset.purchase_date)}
                  </p>
                  <p>
                    <b>Warranty End:</b> {formatDate(asset.warranty_end)}
                  </p>
                </>
              ) : (
                <>
                  <p>
                    <b>Start Date:</b> {formatDate(asset.purchase_date)}
                  </p>
                  <p>
                    <b>Renewal Date:</b> {formatDate(asset.renewal_date)}
                  </p>
                  <p>
                    <b>Seats:</b> {asset.seats_used ?? 0} / {asset.seats_total ?? "∞"} used
                  </p>
                </>
              )}
              <p>
                <b>Status:</b>{" "}
                {asset.asset_type === "SOFTWARE"
                  ? (() => {
                      if (asset.status === "RETIRED") return "EXPIRED";
                      const used = asset.seats_used ?? 0;
                      const total = asset.seats_total;
                      const isFull = total !== null && total !== undefined && used >= total;
                      return isFull ? "ASSIGNED" : "IN_STOCK";
                    })()
                  : asset.status}
              </p>
              {asset.asset_type === "HARDWARE" && (
                <p>
                  <b>Condition:</b> {asset.condition ?? "-"}
                </p>
              )}
              <p>
                <b>Notes:</b> {asset.notes ?? "-"}
              </p>
            </>
          ) : (
            <div className="space-y-3">
              <p>
                <b>ID:</b> {asset.id}
              </p>
              <p>
                <b>Tag:</b> {asset.asset_tag}
              </p>
              <p>
                <b>Type:</b> {asset.asset_type}
              </p>
              {asset.asset_type === "HARDWARE" ? (
                <>
                  <p>
                    <b>Category:</b> {isAccessory(asset.category) ? "Accessory" : (asset.category || "-")}
                  </p>
                  {isAccessory(asset.category) && (
                    <p>
                      <b>Accessory Type:</b> {ACCESSORY_LABELS[asset.category!] || asset.category}
                    </p>
                  )}
                </>
              ) : (
                <p>
                  <b>Name:</b> {asset.subscription || "-"}
                </p>
              )}

              {asset.asset_type === "HARDWARE" && (
                <div className="space-y-1">
                  <label className="text-sm font-medium">Manufacturer</label>
                  <Input
                    value={editManufacturer}
                    onChange={(e) => setEditManufacturer(e.target.value)}
                    placeholder="Manufacturer"
                  />
                </div>
              )}

              <div className="space-y-1">
                <label className="text-sm font-medium">
                  {asset.asset_type === "SOFTWARE" ? "Version" : "Model"}
                </label>
                <Input
                  value={editModel}
                  onChange={(e) => setEditModel(e.target.value)}
                  placeholder={asset.asset_type === "SOFTWARE" ? "Version (e.g., Pro, Enterprise)" : "Model"}
                />
              </div>

              {asset.asset_type === "HARDWARE" && (
                <div className="space-y-1">
                  <label className="text-sm font-medium">Serial #</label>
                  <Input
                    value={editSerialNumber}
                    onChange={(e) => setEditSerialNumber(e.target.value)}
                    placeholder="Serial Number"
                  />
                </div>
              )}

              <div className="space-y-1">
                <label className="text-sm font-medium">Status</label>
                <select
                  className="w-full border rounded-md px-3 py-2 bg-transparent"
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value)}
                >
                  {STATUS_OPTIONS
                    .filter((s) => 
                      asset.asset_type === "HARDWARE" || s !== "IN_REPAIR"
                    )
                    .map((s) => (
                      <option key={s} value={s}>
                        {asset.asset_type === "SOFTWARE" && s === "RETIRED" ? "EXPIRED" : s}
                      </option>
                    ))}
                </select>
              </div>

              {/* Condition - only for HARDWARE assets */}
              {asset.asset_type === "HARDWARE" && (
                <div className="space-y-1">
                  <label className="text-sm font-medium">Condition</label>
                  <select
                    className="w-full border rounded-md px-3 py-2 bg-transparent"
                    value={editCondition}
                    onChange={(e) => setEditCondition(e.target.value)}
                  >
                    {CONDITION_OPTIONS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Renewal Period - only for SOFTWARE assets and ADMIN users */}
              {asset.asset_type === "SOFTWARE" && isAdmin && (
                <>
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Renewal Period</label>
                    <select
                      className="w-full border rounded-md px-3 py-2 bg-transparent"
                      value={editRenewalPeriod}
                      onChange={(e) => setEditRenewalPeriod(e.target.value)}
                    >
                      {RENEWAL_PERIOD_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-muted-foreground">
                      Renewal date will be calculated from the start date
                    </p>
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Total Seats</label>
                    <Input
                      type="number"
                      min="1"
                      placeholder="Leave empty for unlimited"
                      value={editSeatsTotal}
                      onChange={(e) => setEditSeatsTotal(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Currently using {asset.seats_used ?? 0} seats
                    </p>
                  </div>
                </>
              )}

              <div className="space-y-1">
                <label className="text-sm font-medium">Notes</label>
                <Input
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Notes"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <Button onClick={saveAsset} disabled={busy}>
                  {busy ? "Saving…" : "Save"}
                </Button>
                <Button variant="outline" onClick={cancelEdit} disabled={busy}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Assign - only for Admin and Manager, not for retired assets */}
      {canAssignReturn && asset.status !== "RETIRED" && (
        <Card>
          <CardHeader>
            <CardTitle>Assign {asset.asset_type === "SOFTWARE" ? "Seat" : "Asset"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {asset.asset_type === "SOFTWARE" && (
              <p className="text-sm text-muted-foreground">
                Seats available: {(asset.seats_total ?? 0) - (asset.seats_used ?? 0)} / {asset.seats_total ?? "∞"}
              </p>
            )}

            <div className="space-y-1">
              <div className="text-sm">Assign to</div>
              <select
                className="w-full border rounded-md px-3 py-2 bg-transparent"
                value={assignUserId}
                onChange={(e) =>
                  setAssignUserId(e.target.value === "" ? "" : Number(e.target.value))
                }
              >
                <option value="">Select user…</option>
                {users
                  .filter((u) => u.is_active)
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.email})
                    </option>
                  ))}
              </select>
            </div>

            <Input
              placeholder="Notes (optional)"
              value={assignNotes}
              onChange={(e) => setAssignNotes(e.target.value)}
            />

            <Button onClick={assignAsset} disabled={busy || !assignUserId}>
              {busy ? "Working…" : asset.asset_type === "SOFTWARE" ? "Assign Seat" : "Assign"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Return - only for Admin and Manager */}
      {canAssignReturn && (
        <Card>
          <CardHeader>
            <CardTitle>Return {asset.asset_type === "SOFTWARE" ? "Seat" : "Asset"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {asset.asset_type === "SOFTWARE" ? (
              // Software - show user dropdown and seats info
              <>
                <p className="text-sm text-muted-foreground">
                  Seats used: {asset.seats_used ?? 0} / {asset.seats_total ?? "∞"}
                </p>
                
                {(asset.seats_used ?? 0) > 0 ? (
                  <>
                    <div className="space-y-1">
                      <div className="text-sm">Return seat from</div>
                      <select
                        className="w-full border rounded-md px-3 py-2 bg-transparent"
                        value={returnUserId}
                        onChange={(e) => setReturnUserId(e.target.value === "" ? "" : Number(e.target.value))}
                      >
                        <option value="">Select user...</option>
                        {users
                          .filter(u => usersWithSeats.includes(u.id))
                          .map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.name}
                            </option>
                          ))}
                      </select>
                    </div>

                    <Input
                      placeholder="Return notes (optional)"
                      value={returnNotes}
                      onChange={(e) => setReturnNotes(e.target.value)}
                    />

                    <Button
                      variant="secondary"
                      disabled={busy || !returnUserId}
                      onClick={returnAsset}
                    >
                      {busy ? "Working…" : "Return Seat"}
                    </Button>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No seats are currently in use.
                  </p>
                )}
              </>
            ) : (
              // Hardware - original behavior
              <>
                {isAssigned && (
                  <p className="text-sm">
                    <b>Returning from:</b>{" "}
                    {users.find((u) => u.id === asset.assigned_to_user_id)?.name ?? `User #${asset.assigned_to_user_id}`}
                  </p>
                )}

                <Input
                  placeholder="Return notes (optional)"
                  value={returnNotes}
                  onChange={(e) => setReturnNotes(e.target.value)}
                />

                <Button
                  variant="secondary"
                  disabled={busy || !isAssigned}
                  onClick={returnAsset}
                >
                  {busy ? "Working…" : "Return Asset"}
                </Button>

                {!isAssigned && (
                  <p className="text-sm text-muted-foreground">
                    This asset is not assigned.
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Events */}
      <Card>
        <CardHeader>
          <CardTitle>Event History</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>From</TableHead>
                <TableHead>To</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map((e, index) => (
                <TableRow key={e.id}>
                  <TableCell>{index + 1}</TableCell>
                  <TableCell>{e.event_type}</TableCell>
                  <TableCell>{new Date(e.timestamp).toLocaleString()}</TableCell>
                  <TableCell>{who(e.from_user_name, e.from_user_id)}</TableCell>
                  <TableCell>{who(e.to_user_name, e.to_user_id)}</TableCell>
                  <TableCell>{who(e.actor_user_name, e.actor_user_id)}</TableCell>
                  <TableCell>{e.notes ?? "-"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      </main>
    </div>
  );
}
