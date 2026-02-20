// PalmView API Client
// Connects to FastAPI backend for inference, models, projects, etc.

const API_BASE = process.env.PALMVIEW_API_URL || 'http://100.81.217.18:8000';

// ─── Types (from OpenAPI schema) ─────────────────────────────

export interface InferenceJobSubmit {
  project_id: string;
  task_type: string;
  aoi: Record<string, any>;  // GeoJSON geometry
  model_version_id?: string | null;
  params?: Record<string, any> | null;
}

export interface InferenceJobQueued {
  job_id: string;
  status: string;
}

export interface InferenceJobDetail {
  job_id: string;
  project_id: string;
  model_version_id: string;
  status: string;
  progress: number;
  error?: string | null;
  created_at?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  outputs?: Record<string, any>[] | null;
}

export interface ModelInfo {
  model_id: string;
  name: string;
  task_type: string;
  description?: string;
  versions?: ModelVersionInfo[];
}

export interface ModelVersionInfo {
  version_id: string;
  version: string;
  status: string;
  metrics?: Record<string, any>;
}

// ─── API Client ──────────────────────────────────────────────

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });

  if (!res.ok) {
    const errorBody = await res.text().catch(() => '');
    throw new Error(`API ${res.status}: ${errorBody || res.statusText}`);
  }

  return res.json();
}

// ─── Inference Jobs ──────────────────────────────────────────

export async function submitInferenceJob(job: InferenceJobSubmit): Promise<InferenceJobQueued> {
  return apiFetch<InferenceJobQueued>('/api/v1/inference/jobs', {
    method: 'POST',
    body: JSON.stringify(job),
  });
}

export async function listInferenceJobs(): Promise<InferenceJobDetail[]> {
  return apiFetch<InferenceJobDetail[]>('/api/v1/inference/jobs');
}

export async function getInferenceJob(jobId: string): Promise<InferenceJobDetail> {
  return apiFetch<InferenceJobDetail>(`/api/v1/inference/jobs/${jobId}`);
}

// ─── Models ──────────────────────────────────────────────────

export async function listModels(): Promise<ModelInfo[]> {
  return apiFetch<ModelInfo[]>('/api/v1/models');
}

// ─── WebSocket ───────────────────────────────────────────────

export function connectJobStream(
  jobId: string,
  onMessage: (data: any) => void,
  onError?: (err: Event) => void
): WebSocket {
  const wsUrl = API_BASE.replace(/^http/, 'ws') + `/api/v1/inference/jobs/${jobId}/stream`;
  const ws = new WebSocket(wsUrl);

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      onMessage(data);
    } catch {
      onMessage(event.data);
    }
  };

  ws.onerror = (err) => {
    console.error('[PalmView WS] Error:', err);
    onError?.(err);
  };

  return ws;
}

// ─── Health ──────────────────────────────────────────────────

export async function checkHealth(): Promise<{status: string; version: string}> {
  return apiFetch('/api/health');
}
