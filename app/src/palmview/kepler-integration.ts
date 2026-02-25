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

/** Red → amber → yellow → lime → green, 5-step confidence gradient */
const CONFIDENCE_COLOR_RANGE = {
  name: 'Confidence',
  type: 'sequential' as const,
  category: 'PalmView',
  colors: ['#FF4444', '#FF8800', '#FFDD00', '#88CC00', '#00BB44'],
};

/**
 * Build a Kepler GeoJSON layer config with confidence-based color mapping.
 * The layer id is deterministic so re-adding the same job replaces the layer.
 */
function buildKeplerLayerConfig(
  datasetId: string,
  label: string,
  taskType: string
): Record<string, unknown> {
  const color = TASK_COLORS[taskType] || TASK_COLORS.detection;
  return {
    id: `palmview-layer-${datasetId}`,
    type: 'geojson',
    config: {
      dataId: datasetId,
      label,
      color,
      columns: {geojson: '_geojson'},
      isVisible: true,
      visConfig: {
        opacity: 0.8,
        strokeOpacity: 0.8,
        strokeWidth: 1,
        radius: 5,
        sizeRange: [0, 10],
        radiusRange: [0, 50],
        stroked: true,
        filled: true,
        enable3d: false,
        colorRange: CONFIDENCE_COLOR_RANGE,
      },
    },
    visualChannels: {
      colorField: {name: 'confidence', type: 'real'},
      colorScale: 'quantize',
      sizeField: null,
      sizeScale: 'linear',
      strokeColorField: null,
      strokeColorScale: 'quantile',
    },
  };
}

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
  config: Record<string, unknown>;
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

  const taskType = (job as any).task_type || 'detection';
  const layerConfigs = datasets.map(ds =>
    buildKeplerLayerConfig(ds.info.id, ds.info.label, taskType)
  );

  return {
    datasets,
    options: {
      centerMap: options?.centerMap ?? true,
      readOnly: false,
    },
    config: {
      version: 'v1',
      config: {
        visState: {
          layers: layerConfigs,
          layerOrder: layerConfigs.map(l => (l as any).id),
        },
      },
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

  // Dispatch Kepler's addDataToMap action with layer config for confidence color mapping
  dispatch({
    type: '@@kepler.gl/ADD_DATA_TO_MAP',
    payload,
  });
}

// ── Direct GeoJSON → Map (no API round-trip) ─────────

/**
 * Add a GeoJSON FeatureCollection directly to Kepler map.
 * Used when results arrive via WebSocket (bypasses extra API fetch).
 *
 * Automatically configures a layer with confidence-based color mapping.
 */
export function addGeoJSONToKeplerMap(
  dispatch: (action: any) => void,
  context: {job_id: string; task_type: string; created_at?: string},
  geojson: GeoJSON.FeatureCollection,
  options?: {confidenceThreshold?: number}
): void {
  let features = geojson.features || [];

  // Filter by confidence threshold if requested
  if (options?.confidenceThreshold != null && options.confidenceThreshold > 0) {
    features = features.filter(
      f => (f.properties?.confidence ?? 1) >= (options.confidenceThreshold ?? 0)
    );
  }

  if (features.length === 0) {
    console.warn('[PalmView] No features to display (confidence threshold too high?)');
    return;
  }

  const filteredGeoJSON: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features,
  };

  const datasetId = `palmview-${context.job_id.slice(0, 8)}`;
  const timestamp = new Date(context.created_at || Date.now()).toLocaleDateString();
  const label = `${context.task_type} · ${features.length} features · ${timestamp}`;
  const color = TASK_COLORS[context.task_type] || TASK_COLORS.detection;

  const dataset = geojsonToProtoDataset(filteredGeoJSON, datasetId, label, color);
  const layerConfig = buildKeplerLayerConfig(datasetId, label, context.task_type);

  dispatch({
    type: '@@kepler.gl/ADD_DATA_TO_MAP',
    payload: {
      datasets: [dataset],
      options: {centerMap: true, readOnly: false},
      config: {
        version: 'v1',
        config: {
          visState: {
            layers: [layerConfig],
            layerOrder: [(layerConfig as any).id],
          },
        },
      },
    },
  });
}

export default {buildKeplerPayload, addResultsToKeplerMap, addGeoJSONToKeplerMap};
