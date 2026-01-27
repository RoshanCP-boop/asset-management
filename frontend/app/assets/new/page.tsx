"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, getErrorMessage } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { validateAssetTag, validateRequired } from "@/lib/validation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type Location = { id: number; name: string };

// ✅ Edit these to whatever categories you want
const HARDWARE_CATEGORY_OPTIONS = [
  { value: "LAPTOP", label: "Laptop" },
  { value: "PHONE", label: "Phone" },
  { value: "MONITOR", label: "Monitor" },
  { value: "TABLET", label: "Tablet" },
  { value: "ACCESSORY", label: "Accessory" },
  { value: "OTHER", label: "Other" },
] as const;

const ACCESSORY_TYPE_OPTIONS = [
  { value: "MOUSE", label: "Mouse" },
  { value: "KEYBOARD", label: "Keyboard" },
  { value: "HEADSET", label: "Headset" },
  { value: "WEBCAM", label: "Webcam" },
  { value: "DOCKING_STATION", label: "Docking Station" },
  { value: "CHARGER", label: "Charger" },
  { value: "CABLE", label: "Cable" },
  { value: "OTHER_ACCESSORY", label: "Other" },
] as const;

const RENEWAL_PERIOD_OPTIONS = [
  { value: "1_MONTH", label: "1 Month", months: 1 },
  { value: "3_MONTHS", label: "3 Months", months: 3 },
  { value: "6_MONTHS", label: "6 Months", months: 6 },
  { value: "1_YEAR", label: "1 Year", months: 12 },
] as const;

function calculateRenewalDate(startDate: Date, months: number): string {
  const date = new Date(startDate);
  date.setMonth(date.getMonth() + months);
  return date.toISOString().split("T")[0]; // YYYY-MM-DD
}



function randSlug(len = 6) {
  // simple readable slug (no 0/O confusion avoided is optional)
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function buildAssetTag(
  assetType: "HARDWARE" | "SOFTWARE",
  key: string
) {
  const typePrefix = assetType === "HARDWARE" ? "HW" : "SW";
  const slug = (key || "GEN").replace(/[^a-z0-9]/gi, "").slice(0, 3).toUpperCase();
  return `${typePrefix}-${slug}-${randSlug(6)}`;
}


export default function NewAssetPage() {
  const router = useRouter();
  const token = getToken();

  const [asset_type, setAssetType] = useState<"HARDWARE" | "SOFTWARE">("HARDWARE");
  const [category, setCategory] = useState<string>(HARDWARE_CATEGORY_OPTIONS[0].value);
  const [accessoryType, setAccessoryType] = useState<string>(ACCESSORY_TYPE_OPTIONS[0].value);
  const [subscription, setSubscription] = useState("");
  const [renewalPeriod, setRenewalPeriod] = useState<string>(RENEWAL_PERIOD_OPTIONS[0].value);
  const [startDate, setStartDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [seatsTotal, setSeatsTotal] = useState<string>("");
    

  const [asset_tag, setAssetTag] = useState("");
  const [autoTag, setAutoTag] = useState(true);

  const [manufacturer, setManufacturer] = useState("");
  const [model, setModel] = useState("");
  const [serial_number, setSerial] = useState("");
  const [location_id, setLocationId] = useState<number | "">("");

  const [locations, setLocations] = useState<Location[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // generate a tag on first load
  useEffect(() => {
    setAssetTag(buildAssetTag(asset_type, category));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // regenerate tag when type/category changes (only if autoTag enabled)
  useEffect(() => {
    if (!autoTag) return;
    let key: string;
    if (asset_type === "HARDWARE") {
      key = category === "ACCESSORY" ? accessoryType : category;
    } else {
      key = subscription;
    }
    setAssetTag(buildAssetTag(asset_type, key));
  }, [asset_type, category, accessoryType, subscription, autoTag]);
  

  useEffect(() => {
    (async () => {
      try {
        if (!token) return;
        const locs = await apiFetch<Location[]>("/locations", {}, token);
        setLocations(locs);
      } catch {
        // optional
      }
    })();
  }, [token]);

  async function onCreate() {
    setErr(null);
  
    // Validate before setting saving state
    const tagResult = validateAssetTag(asset_tag);
    if (!tagResult.isValid) {
      setErr(tagResult.error ?? "Invalid asset tag");
      return;
    }

    const isSoftware = asset_type === "SOFTWARE";
    
    if (isSoftware) {
      const subResult = validateRequired(subscription, "Subscription");
      if (!subResult.isValid) {
        setErr(subResult.error ?? "Subscription is required");
        return;
      }
    } else {
      const catResult = validateRequired(category, "Category");
      if (!catResult.isValid) {
        setErr(catResult.error ?? "Category is required");
        return;
      }
    }

    setSaving(true);
  
    try {
      if (!token) throw new Error("Not logged in");
  
      // Calculate renewal date for software assets
      let purchase_date: string | null = null;
      let renewal_date: string | null = null;
      if (isSoftware) {
        purchase_date = startDate;
        const start = new Date(startDate);
        const selectedPeriod = RENEWAL_PERIOD_OPTIONS.find(p => p.value === renewalPeriod);
        renewal_date = calculateRenewalDate(start, selectedPeriod?.months ?? 12);
      }

      await apiFetch(
        "/assets",
        {
          method: "POST",
          body: JSON.stringify({
            asset_tag: asset_tag.trim(),
            asset_type,
  
            category: isSoftware ? null : (category === "ACCESSORY" ? accessoryType : category),
            subscription: isSoftware ? subscription.trim() : null,
  
            manufacturer: isSoftware ? null : (manufacturer || null),
            model: model || null,
            serial_number: isSoftware ? null : (serial_number || null),
  
            purchase_date,
            renewal_date,
            
            // Software seat tracking
            seats_total: isSoftware && seatsTotal ? parseInt(seatsTotal, 10) : null,
            seats_used: isSoftware ? 0 : null,
  
            location_id: location_id === "" ? null : location_id,
          }),
        },
        token
      );
  
      router.push("/assets");
    } catch (e: unknown) {
      setErr(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-6">
      <div className="max-w-2xl mx-auto">
        {/* Back button */}
        <Button
          variant="ghost"
          onClick={() => router.push("/assets")}
          className="mb-4 text-slate-600 hover:text-slate-800 transition-colors"
        >
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to Assets
        </Button>

        <Card className="shadow-xl border-0 bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm animate-in fade-in slide-in-from-bottom-4 duration-300">
          <CardHeader className="border-b border-slate-100 dark:border-slate-800">
            <CardTitle className="flex items-center gap-2 text-xl">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </div>
              Create New Asset
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-6">
            {err && (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg animate-in fade-in duration-200">
                <p className="text-sm text-red-600 dark:text-red-400">{err}</p>
              </div>
            )}

          {/* Asset type */}
          <div className="flex gap-2">
            <Button
              variant={asset_type === "HARDWARE" ? "default" : "outline"}
              onClick={() => setAssetType("HARDWARE")}
              type="button"
            >
              Hardware
            </Button>
            <Button
              variant={asset_type === "SOFTWARE" ? "default" : "outline"}
              onClick={() => setAssetType("SOFTWARE")}
              type="button"
            >
              Software
            </Button>
          </div>

          {/* Category dropdown */}
          {asset_type === "HARDWARE" ? (
            <>
              <div className="space-y-1">
                <div className="text-sm">Category</div>
                <select
                  className="w-full border rounded-md px-3 py-2 bg-transparent"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  {HARDWARE_CATEGORY_OPTIONS.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              {/* Accessory type dropdown */}
              {category === "ACCESSORY" && (
                <div className="space-y-1">
                  <div className="text-sm">Accessory Type</div>
                  <select
                    className="w-full border rounded-md px-3 py-2 bg-transparent"
                    value={accessoryType}
                    onChange={(e) => setAccessoryType(e.target.value)}
                  >
                    {ACCESSORY_TYPE_OPTIONS.map((a) => (
                      <option key={a.value} value={a.value}>
                        {a.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </>
) : (
  <>
    <Input
      placeholder="Subscription (e.g., Figma, Notion, Slack)"
      value={subscription}
      onChange={(e) => setSubscription(e.target.value)}
    />
    <div className="space-y-1">
      <div className="text-sm">Start Date</div>
      <Input
        type="date"
        value={startDate}
        onChange={(e) => setStartDate(e.target.value)}
      />
    </div>
    <div className="space-y-1">
      <div className="text-sm">Renewal Period</div>
      <select
        className="w-full border rounded-md px-3 py-2 bg-transparent"
        value={renewalPeriod}
        onChange={(e) => setRenewalPeriod(e.target.value)}
      >
        {RENEWAL_PERIOD_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
    <div className="space-y-1">
      <div className="text-sm">Total Seats (leave empty for unlimited)</div>
      <Input
        type="number"
        min="1"
        placeholder="e.g., 10"
        value={seatsTotal}
        onChange={(e) => setSeatsTotal(e.target.value)}
      />
    </div>
  </>
)}


          {/* Asset tag + auto */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <div className="text-sm">Asset Tag</div>
              <label className="text-sm flex items-center gap-2 select-none">
                <input
                  type="checkbox"
                  checked={autoTag}
                  onChange={(e) => setAutoTag(e.target.checked)}
                />
                Auto-generate
              </label>
            </div>

            <div className="flex gap-2">
              <Input
                placeholder="Asset Tag (unique)"
                value={asset_tag}
                onChange={(e) => {
                  setAssetTag(e.target.value);
                  setAutoTag(false); // user edited => stop auto
                }}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setAssetTag(buildAssetTag(asset_type, category));
                  setAutoTag(true);
                }}
              >
                Regenerate
              </Button>
            </div>
          </div>

          {/* Other fields */}
          {asset_type === "HARDWARE" && (
            <Input placeholder="Manufacturer" value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} />
          )}
          <Input 
            placeholder={asset_type === "SOFTWARE" ? "Version (e.g., Pro, Enterprise, v2024)" : "Model"} 
            value={model} 
            onChange={(e) => setModel(e.target.value)} 
          />
          {asset_type === "HARDWARE" && (
            <Input placeholder="Serial Number" value={serial_number} onChange={(e) => setSerial(e.target.value)} />
          )}

          {/* Location */}
          <div className="space-y-1">
            <div className="text-sm">Location</div>
            <select
              className="w-full border rounded-md px-3 py-2 bg-transparent"
              value={location_id}
              onChange={(e) => setLocationId(e.target.value === "" ? "" : Number(e.target.value))}
            >
              <option value="">(none)</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-2 pt-4">
            <Button 
              onClick={onCreate} 
              disabled={saving}
              className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-md shadow-blue-500/20 transition-all hover:shadow-lg"
            >
              {saving ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Creating...
                </span>
              ) : (
                <>
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Create Asset
                </>
              )}
            </Button>
            <Button variant="outline" onClick={() => router.push("/assets")} type="button">
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
