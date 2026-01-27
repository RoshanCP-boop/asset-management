import { apiFetch } from "@/lib/api";
import type { Asset, AssetEvent, User, Location } from "@/lib/types";

export function listAssets(token: string, status?: string) {
  const q = status ? `?status=${encodeURIComponent(status)}` : "";
  return apiFetch<Asset[]>(`/assets${q}`, {}, token);
}

export function getAsset(token: string, id: number) {
  return apiFetch<Asset>(`/assets/${id}`, {}, token);
}

export function getAssetEvents(token: string, id: number) {
  return apiFetch<AssetEvent[]>(`/assets/${id}/events`, {}, token);
}

export function assignAsset(
  token: string,
  id: number,
  body: { user_id: number; notes?: string | null }
) {
  return apiFetch<Asset>(
    `/assets/${id}/assign`,
    { method: "POST", body: JSON.stringify(body) },
    token
  );
}

export function returnAsset(
  token: string,
  id: number,
  body: { notes?: string | null }
) {
  return apiFetch<Asset>(
    `/assets/${id}/return`,
    { method: "POST", body: JSON.stringify(body) },
    token
  );
}

export function listUsers(token: string) {
  return apiFetch<User[]>(`/users`, {}, token);
}

export function listLocations(token: string) {
  return apiFetch<Location[]>(`/locations`, {}, token);
}

// Adjust the create payload keys to match your backend schema exactly.
export type CreateAssetPayload = {
  asset_tag: string;
  asset_type: "HARDWARE" | "SOFTWARE";
  category: string;

  manufacturer?: string | null;
  model?: string | null;
  serial_number?: string | null;

  status: string;
  condition: string;

  location_id?: number | null;
  notes?: string | null;
};

export function createAsset(token: string, payload: CreateAssetPayload) {
  return apiFetch<Asset>(
    `/assets`,
    { method: "POST", body: JSON.stringify(payload) },
    token
  );
}
