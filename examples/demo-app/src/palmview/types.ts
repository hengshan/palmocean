/**
 * PalmView API TypeScript Types
 * Auto-generated from OpenAPI spec at http://100.81.217.18:8000/openapi.json
 * Generated: 2026-02-20 by IRIS
 */

// ── Inference ────────────────────────────────────────

export interface InferenceJobSubmit {
  project_id: string;       // UUID
  task_type: string;        // 'detection' | 'segmentation' | 'classification' | 'change_detection'
  model_version_id?: string | null;  // UUID, optional (auto-select if null)
  aoi: GeoJSON.Polygon | GeoJSON.MultiPolygon | Record<string, unknown>;
  params?: Record<string, unknown> | null;
}

export interface InferenceJobQueued {
  job_id: string;           // UUID
  status: string;           // 'queued'
}

export interface InferenceJobDetail {
  job_id: string;           // UUID
  project_id: string;       // UUID
  model_version_id: string; // UUID
  status: string;           // 'queued' | 'running' | 'complete' | 'failed' | 'cancelled'
  progress: number;         // 0-1
  error?: string | null;
  created_at?: string | null;   // ISO-8601
  started_at?: string | null;
  finished_at?: string | null;
  outputs?: Record<string, unknown>[] | null;
}

export interface InferenceJobList {
  jobs: InferenceJobDetail[];
  total: number;
}

export interface InferenceOutputItem {
  output_id: string;        // UUID
  output_type: string;      // 'geojson' | 'cog' | 'pmtiles'
  format: string;
  uri: string;
  bbox?: Record<string, unknown> | null;
  stats?: Record<string, unknown> | null;
}

export interface InferenceOutputList {
  outputs: InferenceOutputItem[];
}

// ── Models ───────────────────────────────────────────

export interface ModelVersionItem {
  version_id: string;       // UUID
  version: string;          // semver
  status: string;           // 'active' | 'deprecated'
  metrics?: Record<string, unknown> | null;    // { precision, recall, mAP50, ... }
  input_spec?: Record<string, unknown> | null;
  output_spec?: Record<string, unknown> | null;
  created_at?: string | null;
}

export interface ModelItem {
  model_id: string;         // UUID
  name: string;
  task_type: string;
  description?: string | null;
  versions: ModelVersionItem[];
}

export interface ModelList {
  models: ModelItem[];
  total: number;
}

// ── Projects ─────────────────────────────────────────

export interface ProjectCreateV1 {
  org_id: string;           // UUID
  name: string;
  description?: string | null;
  region?: string | null;
}

export interface ProjectCreated {
  project_id: string;
  name: string;
}

export interface ProjectDetailV1 {
  project_id: string;
  org_id: string;
  name: string;
  description?: string | null;
  region?: string | null;
  created_at?: string | null;
}

export interface ProjectListV1 {
  projects: ProjectDetailV1[];
  total: number;
}

// ── Map Configs ──────────────────────────────────────

export interface MapConfigCreateV1 {
  project_id: string;       // UUID
  title: string;
  kepler_config: Record<string, unknown>;
  dataset_refs?: Record<string, unknown>[];
  parent_id?: string | null;
}

export interface MapConfigCreated {
  map_config_id: string;
  version: number;
}

export interface MapConfigDetail {
  map_config_id: string;
  project_id: string;
  version: number;
  title: string;
  kepler_config: Record<string, unknown>;
  dataset_refs: Record<string, unknown>[];
  created_at?: string | null;
}

// ── WebSocket Messages ───────────────────────────────

export type WSInferenceMessage =
  | { type: 'progress'; tile: number; total: number; pct: number }
  | { type: 'partial_result'; features: GeoJSON.Feature[] }
  | { type: 'result'; geojson: GeoJSON.FeatureCollection; stats: Record<string, unknown> }
  | { type: 'complete'; task_id: string; duration: number }
  | { type: 'error'; message: string; code: string };

// ── Auth ─────────────────────────────────────────────

export interface LoginRequest {
  username: string;
  password: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
}

export interface UserResponse {
  user_id: string;
  username: string;
  org_id: string;
}
