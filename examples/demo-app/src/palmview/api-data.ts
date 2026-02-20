// PalmView Data API Client — Upload, STAC, GEE, Datasets
const API_BASE =
  (typeof process !== 'undefined' && process.env?.PALMVIEW_API_URL) ||
  'http://100.81.217.18:8000';

// ─── Types ───────────────────────────────────────────

export interface STACProvider {
  name: string;
  url: string;
  requires_auth: boolean;
  popular_collections: string[];
}

export interface STACSearchParams {
  provider: string;
  collections: string[];
  bbox: [number, number, number, number];  // [west, south, east, north]
  datetime?: string;  // ISO range e.g. "2025-01-01/2025-12-31"
  limit?: number;
}

export interface STACItem {
  id: string;
  collection: string;
  datetime: string;
  bbox: number[];
  thumbnail?: string;
  assets: Record<string, { href: string; type?: string }>;
  properties: Record<string, any>;
}

export interface STACSearchResult {
  items: STACItem[];
  total: number;
}

export interface DatasetInfo {
  id: string;
  name: string;
  source_type: string;  // 'upload' | 'stac' | 'gee'
  format: string;
  bbox?: number[];
  crs?: string;
  bands?: string[];
  resolution?: number;
  file_size?: number;
  created_at: string;
  thumbnail_url?: string;
}

// ─── Fetch helper ────────────────────────────────────

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {'Content-Type': 'application/json', ...options?.headers},
    ...options,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`API ${res.status}: ${body || res.statusText}`);
  }
  return res.json();
}

// ─── STAC ────────────────────────────────────────────

export async function getSTACProviders(): Promise<Record<string, STACProvider>> {
  return apiFetch('/api/v1/data/stac/providers');
}

export async function getSTACCollections(provider: string): Promise<string[]> {
  return apiFetch(`/api/v1/data/stac/collections/${provider}`);
}

export async function searchSTAC(params: STACSearchParams): Promise<STACSearchResult> {
  return apiFetch('/api/v1/data/stac/search', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function importSTACItem(itemId: string, provider: string, asset_key: string): Promise<{dataset_id: string}> {
  return apiFetch('/api/v1/data/stac/import', {
    method: 'POST',
    body: JSON.stringify({item_id: itemId, provider, asset_key}),
  });
}

// ─── Datasets ────────────────────────────────────────

export async function listDatasets(): Promise<DatasetInfo[]> {
  return apiFetch('/api/v1/data/datasets');
}

export async function getDataset(id: string): Promise<DatasetInfo> {
  return apiFetch(`/api/v1/data/datasets/${id}`);
}

export async function deleteDataset(id: string): Promise<void> {
  await apiFetch(`/api/v1/data/datasets/${id}`, {method: 'DELETE'});
}

// ─── Upload ──────────────────────────────────────────

export async function uploadGeoTIFF(
  file: File,
  onProgress?: (pct: number) => void
): Promise<DatasetInfo> {
  const formData = new FormData();
  formData.append('file', file);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE}/api/v1/data/upload`);

    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        reject(new Error(`Upload failed: ${xhr.status}`));
      }
    };

    xhr.onerror = () => reject(new Error('Upload network error'));
    xhr.send(formData);
  });
}
