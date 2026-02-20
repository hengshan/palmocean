/**
 * PalmView API Client
 * Wraps all backend API calls with typed request/response
 * Author: IRIS · 2026-02-20
 */

import type {
  InferenceJobSubmit,
  InferenceJobQueued,
  InferenceJobDetail,
  InferenceJobList,
  InferenceOutputList,
  ModelList,
  ProjectCreateV1,
  ProjectCreated,
  ProjectListV1,
  ProjectDetailV1,
  MapConfigCreateV1,
  MapConfigCreated,
  MapConfigDetail,
  WSInferenceMessage,
} from './types';

// ── Configuration ────────────────────────────────────

const API_BASE =
  (typeof process !== 'undefined' && process.env?.PALMVIEW_API_URL) ||
  'http://100.81.217.18:8000';

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });

  if (!res.ok) {
    const errorBody = await res.text().catch(() => '');
    throw new Error(`API ${res.status}: ${res.statusText} — ${errorBody}`);
  }

  return res.json();
}

// ── Inference Jobs ───────────────────────────────────

export async function submitInferenceJob(
  body: InferenceJobSubmit
): Promise<InferenceJobQueued> {
  return request<InferenceJobQueued>('/api/v1/inference/jobs', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function listInferenceJobs(
  projectId: string,
  params?: { status?: string; limit?: number; offset?: number }
): Promise<InferenceJobList> {
  const qs = new URLSearchParams({ project_id: projectId });
  if (params?.status) qs.set('status', params.status);
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.offset) qs.set('offset', String(params.offset));
  return request<InferenceJobList>(`/api/v1/inference/jobs?${qs}`);
}

export async function getInferenceJob(
  jobId: string
): Promise<InferenceJobDetail> {
  return request<InferenceJobDetail>(`/api/v1/inference/jobs/${jobId}`);
}

export async function getJobOutputs(
  jobId: string
): Promise<InferenceOutputList> {
  return request<InferenceOutputList>(
    `/api/v1/inference/jobs/${jobId}/outputs`
  );
}

// ── WebSocket for Inference Streaming ────────────────

export function connectInferenceStream(
  jobId: string,
  onMessage: (msg: WSInferenceMessage) => void,
  onError?: (err: Event) => void,
  onClose?: () => void
): WebSocket {
  const wsBase = API_BASE.replace(/^http/, 'ws');
  const ws = new WebSocket(`${wsBase}/api/v1/inference/jobs/${jobId}/stream`);

  ws.onmessage = (event) => {
    try {
      const msg: WSInferenceMessage = JSON.parse(event.data);
      onMessage(msg);
    } catch (e) {
      console.error('[PalmView WS] Failed to parse message:', event.data);
    }
  };

  ws.onerror = (err) => {
    console.error('[PalmView WS] Error:', err);
    onError?.(err);
  };

  ws.onclose = () => {
    console.log('[PalmView WS] Connection closed');
    onClose?.();
  };

  return ws;
}

// ── Models ───────────────────────────────────────────

export async function listModels(): Promise<ModelList> {
  return request<ModelList>('/api/v1/models');
}

// ── Projects ─────────────────────────────────────────

export async function createProject(
  body: ProjectCreateV1
): Promise<ProjectCreated> {
  return request<ProjectCreated>('/api/v1/projects', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function listProjects(
  orgId?: string
): Promise<ProjectListV1> {
  const qs = orgId ? `?org_id=${orgId}` : '';
  return request<ProjectListV1>(`/api/v1/projects${qs}`);
}

export async function getProject(
  projectId: string
): Promise<ProjectDetailV1> {
  return request<ProjectDetailV1>(`/api/v1/projects/${projectId}`);
}

// ── Map Configs ──────────────────────────────────────

export async function saveMapConfig(
  body: MapConfigCreateV1
): Promise<MapConfigCreated> {
  return request<MapConfigCreated>('/api/v1/map-configs', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function loadMapConfig(
  configId: string
): Promise<MapConfigDetail> {
  return request<MapConfigDetail>(`/api/v1/map-configs/${configId}`);
}

// ── Health ───────────────────────────────────────────

export async function healthCheck(): Promise<{ status: string; version: string }> {
  return request('/api/health');
}
