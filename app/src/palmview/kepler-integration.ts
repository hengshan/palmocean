/**
 * PalmView ↔ Kepler.gl Integration
 * Converts inference outputs to Kepler datasets and adds to map
 * Author: IRIS · 2026-02-20
 */

import type {InferenceJobDetail, InferenceOutputItem} from './types';
import {getJobOutputs} from './api';

// ── GeoJSON → Kepler ProtoDataset ────────────────────

interface ProtoDatasetField {
  name: string;
  type: string;
  format?: string;
  analyzerType?: string;
}

interface ProtoDataset {
  info: {
    id: string;
    label: string;
    color?: [number, number, number];
  };
  data: {
    fields: ProtoDatasetField[];
    rows: any[][];
  };
}

/**
 * Convert GeoJSON FeatureCollection to Kepler's ProtoDataset format
 * Kepler expects: { fields: [...], rows: [[...], [...]] }
 */
function geojsonToProtoDataset(
  geojson: GeoJSON.FeatureCollection,
  id: string,
  label: string,
  color?: [number, number, number]
): ProtoDataset {
  if (!geojson.features || geojson.features.length === 0) {
    return {
      info: {id, label, color},
      data: {fields: [{name: '_geojson', type: 'geojson'}], rows: []},
    };
  }

  // Collect all property keys across features
  const propKeys = new Set<string>();
  geojson.features.forEach(f => {
    if (f.properties) {
      Object.keys(f.properties).forEach(k => propKeys.add(k));
    }
  });

  const propertyNames = Array.from(propKeys);

  // Build fields: _geojson (geometry) + all properties
  const fields: ProtoDatasetField[] = [
    {name: '_geojson', type: 'geojson'},
    ...propertyNames.map(name => ({
      name,
      type: inferFieldType(geojson.features, name),
    })),
  ];

  // Build rows
  const rows = geojson.features.map(feature => [
    feature,  // _geojson column gets the whole feature
    ...propertyNames.map(name => feature.properties?.[name] ?? null),
  ]);

  return {
    info: {id, label, color},
    data: {fields, rows},
  };
}

/**
 * Infer Kepler field type from feature property values
 */
function inferFieldType(features: GeoJSON.Feature[], propName: string): string {
  for (const f of features) {
    const val = f.properties?.[propName];
    if (val == null) continue;
    if (typeof val === 'number') return Number.isInteger(val) ? 'integer' : 'real';
    if (typeof val === 'boolean') return 'boolean';
    if (typeof val === 'string') {
      // Check if date-like
      if (/^\d{4}-\d{2}-\d{2}/.test(val)) return 'timestamp';
      return 'string';
    }
  }
  return 'string';
}

// ── Color Mapping ────────────────────────────────────

const TASK_COLORS: Record<string, [number, number, number]> = {
  detection: [46, 204, 113],        // green
  segmentation: [52, 152, 219],     // blue
  classification: [155, 89, 182],   // purple
  change_detection: [243, 156, 18], // amber
};

// ── Main Integration Function ────────────────────────

/**
 * Fetch inference outputs and convert to Kepler addDataToMap payload.
 * 
 * Usage in GeoAI Tab:
 * ```ts
 * import { addDataToMap } from '@kepler.gl/actions';
 * import { buildKeplerPayload } from '../palmview/kepler-integration';
 * 
 * const payload = await buildKeplerPayload(job);
 * dispatch(addDataToMap(payload));
 * ```
 */
export async function buildKeplerPayload(
  job: InferenceJobDetail,
  options?: {
    centerMap?: boolean;
    confidenceThreshold?: number;
  }
): Promise<{
  datasets: ProtoDataset[];
  options: {centerMap: boolean; readOnly: boolean};
}> {
  // Fetch outputs from backend
  const {outputs} = await getJobOutputs(job.job_id);

  const datasets: ProtoDataset[] = [];

  for (const output of outputs) {
    if (output.format === 'geojson') {
      // Fetch the GeoJSON data
      const geojsonData = await fetchOutputGeoJSON(output);

      // Optional: filter by confidence
      if (options?.confidenceThreshold && geojsonData.features) {
        geojsonData.features = geojsonData.features.filter(
          (f: GeoJSON.Feature) =>
            (f.properties?.confidence ?? 1) >= (options.confidenceThreshold ?? 0)
        );
      }

      const taskType = (job as any).task_type || 'detection';
      const color = TASK_COLORS[taskType] || TASK_COLORS.detection;
      const featureCount = geojsonData.features?.length || 0;
      const timestamp = new Date(job.created_at || Date.now()).toLocaleDateString();

      datasets.push(
        geojsonToProtoDataset(
          geojsonData,
          `palmview-${job.job_id.slice(0, 8)}`,
          `${taskType} · ${featureCount} features · ${timestamp}`,
          color
        )
      );
    }
  }

  return {
    datasets,
    options: {
      centerMap: options?.centerMap ?? true,
      readOnly: false,
    },
  };
}

/**
 * Fetch GeoJSON from an inference output URI
 */
async function fetchOutputGeoJSON(
  output: InferenceOutputItem
): Promise<GeoJSON.FeatureCollection> {
  const API_BASE =
    (typeof process !== 'undefined' && process.env?.PALMVIEW_API_URL) ||
    'http://100.81.217.18:8000';

  // URI could be relative (/api/v1/...) or absolute
  const url = output.uri.startsWith('http') ? output.uri : `${API_BASE}${output.uri}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch output GeoJSON: ${res.status}`);
  }
  return res.json();
}

// ── Convenience: Add Results to Map (one-liner) ──────

/**
 * One-liner to add inference results to Kepler map.
 * 
 * Usage:
 * ```ts
 * import { addResultsToKeplerMap } from '../palmview/kepler-integration';
 * addResultsToKeplerMap(dispatch, job, 0.7);
 * ```
 */
export async function addResultsToKeplerMap(
  dispatch: (action: any) => void,
  job: InferenceJobDetail,
  confidenceThreshold?: number
): Promise<void> {
  // Dynamic import to avoid bundling @kepler.gl/actions in this module
  // Altair: if this doesn't work with esbuild, use direct import instead
  const payload = await buildKeplerPayload(job, {
    centerMap: true,
    confidenceThreshold,
  });

  if (payload.datasets.length === 0) {
    console.warn('[PalmView] No GeoJSON outputs to display');
    return;
  }

  // Dispatch Kepler's addDataToMap action
  // The action type is '@@kepler.gl/ADD_DATA_TO_MAP'
  dispatch({
    type: '@@kepler.gl/ADD_DATA_TO_MAP',
    payload,
  });
}

export default {buildKeplerPayload, addResultsToKeplerMap};
