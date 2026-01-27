export type AssetType = "HARDWARE" | "SOFTWARE";

export type Asset = {
  id: number;
  asset_tag: string;
  asset_type: AssetType;
  category: string;
  manufacturer?: string | null;
  model?: string | null;
  serial_number?: string | null;
  status: string;
  condition?: string | null;
  location_id?: number | null;
  assigned_to_user_id?: number | null;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type AssetEvent = {
  id: number;
  asset_id: number;
  event_type: string; // ASSIGN/RETURN/MOVE etc
  from_user_id?: number | null;
  to_user_id?: number | null;
  from_location_id?: number | null;
  to_location_id?: number | null;
  actor_user_id?: number | null;
  timestamp: string;
  notes?: string | null;
};

export type User = {
  id: number;
  name: string;
  email: string;
  role?: string;
};

export type Location = {
  id: number;
  name: string;
};
