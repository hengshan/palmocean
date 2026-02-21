// SPDX-License-Identifier: MIT
// Copyright contributors to the kepler.gl project

import {EditableGeoJsonLayer} from '@nebula.gl/layers';
import {Layer as DeckLayer, LayerProps as DeckLayerProps} from '@deck.gl/core/typed';
import {
  DrawPolygonMode,
  TranslateMode,
  CompositeMode,
  DrawRectangleMode,
  DrawCircleFromCenterMode,
  DrawPolygonByDraggingMode,
  DrawPointMode,
  DrawLineStringMode,
  TransformMode
} from '@nebula.gl/edit-modes';
import {PathStyleExtension} from '@deck.gl/extensions';

import {EDITOR_LAYER_ID, EDITOR_MODES, EDITOR_LAYER_PICKING_RADIUS} from '@kepler.gl/constants';
import {Viewport, Editor, Feature, FeatureSelectionContext} from '@kepler.gl/types';
import {generateHashId} from '@kepler.gl/common-utils';

import {EDIT_TYPES} from './constants';
import {LINE_STYLE, FEATURE_STYLE, EDIT_HANDLE_STYLE} from './feature-styles';
import {ModifyModeExtended} from './modify-mode-extended';
import {isDrawingActive} from './editor-layer-utils';
import turfBearing from '@turf/bearing';
import turfCentroid from '@turf/centroid';
import turfArea from '@turf/area';

const DEFAULT_COMPOSITE_MODE = new CompositeMode([new TranslateMode(), new ModifyModeExtended()]);

// State for tracking transform feedback (rotation angle / scale factor)
const transformState: {
  originalFeatures: Feature[] | null;
  originalArea: number;
  originalBearing: number;
} = {
  originalFeatures: null,
  originalArea: 0,
  originalBearing: 0
};

function getRefBearing(features: Feature[], indexes: number[]): number {
  if (!indexes.length || !features.length) return 0;
  const selected = indexes.map(i => features[i]).filter(Boolean);
  if (!selected.length) return 0;
  const fc = {type: 'FeatureCollection' as const, features: selected};
  const c = turfCentroid(fc as any);
  // Use first coordinate of first selected feature as reference point
  const firstCoord = getFirstCoord(selected[0]);
  if (!firstCoord) return 0;
  return turfBearing(c.geometry.coordinates as [number, number], firstCoord as [number, number]);
}

function getFirstCoord(feature: Feature): number[] | null {
  const g = feature?.geometry;
  if (!g) return null;
  let coords = (g as any).coordinates;
  while (Array.isArray(coords) && Array.isArray(coords[0]) && Array.isArray(coords[0][0])) {
    coords = coords[0];
  }
  if (Array.isArray(coords) && Array.isArray(coords[0])) return coords[0];
  if (Array.isArray(coords) && typeof coords[0] === 'number') return coords;
  return null;
}

function getTotalArea(features: Feature[], indexes: number[]): number {
  if (!indexes.length) return 0;
  const selected = indexes.map(i => features[i]).filter(Boolean);
  let total = 0;
  for (const f of selected) {
    try {
      total += turfArea(f as any);
    } catch (_e) {
      /* skip non-polygon */
    }
  }
  return total || 1;
}

export type GetEditorLayerProps = {
  editorMenuActive: boolean;
  editor: Editor;
  onSetFeatures: (features: Feature[]) => any;
  setSelectedFeature: (feature: Feature | null, selectionContext?: FeatureSelectionContext) => any;
  viewport: Viewport;
  featureCollection: {
    type: string;
    features: Feature[];
  };
  selectedFeatureIndexes: number[];
};

/**
 * Returns editable layer to edit polygon filters.
 * @param params
 * @param params.editorMenuActive Indicates whether the editor side menu is active.
 * @param params.editor
 * @param params.onSetFeatures A callback to set features.
 * @param params.setSelectedFeature A callback to set selected feature and selection context.
 * @param params.viewport Current viewport.
 * @param params.featureCollection Feature collection with an array of features
 * @param params.selectedFeatureIndexes An array with index of currently selected feature.
 */
export function getEditorLayer({
  editorMenuActive,
  editor,
  onSetFeatures,
  setSelectedFeature,
  featureCollection,
  selectedFeatureIndexes,
  viewport
}: GetEditorLayerProps): DeckLayer<DeckLayerProps> {
  const {mode: editorMode} = editor;

  let mode = DEFAULT_COMPOSITE_MODE;
  if (editorMenuActive) {
    // @ts-ignore
    if (editorMode === EDITOR_MODES.DRAW_POLYGON) mode = DrawPolygonMode;
    // @ts-ignore
    else if (editorMode === EDITOR_MODES.DRAW_RECTANGLE) mode = DrawRectangleMode;
    // @ts-ignore
    else if (editorMode === EDITOR_MODES.DRAW_CIRCLE) mode = DrawCircleFromCenterMode;
    // @ts-ignore
    else if (editorMode === EDITOR_MODES.DRAW_FREEHAND) mode = DrawPolygonByDraggingMode;
    // @ts-ignore
    else if (editorMode === EDITOR_MODES.DRAW_POINT) mode = DrawPointMode;
    // @ts-ignore
    else if (editorMode === EDITOR_MODES.DRAW_LINE) mode = DrawLineStringMode;
    // @ts-ignore
    else if (editorMode === EDITOR_MODES.TRANSFORM) mode = selectedFeatureIndexes.length > 0 ? TransformMode : DEFAULT_COMPOSITE_MODE;
  }

  // @ts-ignore
  return new EditableGeoJsonLayer({
    id: EDITOR_LAYER_ID,
    mode,
    // @ts-ignore
    data: featureCollection,
    selectedFeatureIndexes,
    visible: editor.visible,
    pickable: true,
    pickingRadius: EDITOR_LAYER_PICKING_RADIUS,
    modeConfig: {
      viewport,
      screenSpace: true,
      lockRectangles: true
    },

    pickingLineWidthExtraPixels: 5,

    // Only show fill when polygons are selected,
    // there is no way atm to enable fill for only one feature
    filled: selectedFeatureIndexes.length > 0,

    onEdit: ({updatedData, editType}) => {
      switch (editType) {
        case EDIT_TYPES.ADD_FEATURE: {
          const {features: _features} = updatedData;
          if (_features.length) {
            const lastFeature = _features[_features.length - 1];
            lastFeature.properties.isClosed = true;
            lastFeature.id = generateHashId(6);
            onSetFeatures(updatedData.features);
            setSelectedFeature(lastFeature);
          }
          break;
        }
        case EDIT_TYPES.ADD_POSITION:
        case EDIT_TYPES.MOVE_POSITION:
        case EDIT_TYPES.TRANSLATING:
          onSetFeatures(updatedData.features);
          break;
        case EDIT_TYPES.ROTATING: {
          if (!transformState.originalFeatures) {
            transformState.originalFeatures = JSON.parse(
              JSON.stringify(featureCollection.features)
            );
            transformState.originalBearing = getRefBearing(
              featureCollection.features,
              selectedFeatureIndexes
            );
          }
          const newBearing = getRefBearing(updatedData.features, selectedFeatureIndexes);
          let angle = newBearing - transformState.originalBearing;
          // Normalize to -180..180
          if (angle > 180) angle -= 360;
          if (angle < -180) angle += 360;
          (window as any).__PALMVIEW_TRANSFORM_INFO = {type: 'rotate', angle};
          onSetFeatures(updatedData.features);
          break;
        }
        case EDIT_TYPES.SCALING: {
          if (!transformState.originalFeatures) {
            transformState.originalFeatures = JSON.parse(
              JSON.stringify(featureCollection.features)
            );
            transformState.originalArea = getTotalArea(
              featureCollection.features,
              selectedFeatureIndexes
            );
          }
          const newArea = getTotalArea(updatedData.features, selectedFeatureIndexes);
          const factor = Math.sqrt(newArea / transformState.originalArea);
          (window as any).__PALMVIEW_TRANSFORM_INFO = {type: 'scale', factor};
          onSetFeatures(updatedData.features);
          break;
        }
        case EDIT_TYPES.ROTATED:
        case EDIT_TYPES.SCALED:
          (window as any).__PALMVIEW_TRANSFORM_INFO = null;
          transformState.originalFeatures = null;
          onSetFeatures(updatedData.features);
          break;
        default:
          break;
      }
    },

    // prevent self-highlights with tentative features
    autoHighlight: !isDrawingActive(editorMenuActive, editorMode),
    // @ts-ignore
    highlightColor: info => {
      // Note: lines are reported as parent polygon
      const {object} = info;
      if (object) {
        if (object.id === editor.selectedFeature?.id) {
          return FEATURE_STYLE.highlightMultiplierNone;
        }

        const type = object.properties.editHandleType;
        if (type === 'intermediate') return EDIT_HANDLE_STYLE.highlightMultiplierNone;
        else if (type === 'existing') return EDIT_HANDLE_STYLE.highlightMultiplier;
      }

      // Note: highlight color affects even transparent filled polygons
      return selectedFeatureIndexes.length
        ? FEATURE_STYLE.highlightMultiplier
        : LINE_STYLE.highlightMultiplier;
    },

    extensions: [new PathStyleExtension({dash: true})],
    dashGapPickable: true,
    getDashArray: feature => {
      if (feature?.properties?.guideType === 'tentative') {
        return LINE_STYLE.dashArray;
      }

      if (feature?.id === editor.selectedFeature?.id) return LINE_STYLE.solidArray;

      return LINE_STYLE.dashArray;
    },

    getLineColor: LINE_STYLE.getColor,
    getFillColor: FEATURE_STYLE.getColor,

    getRadius: EDIT_HANDLE_STYLE.getRadius,
    // @ts-ignore
    getLineWidth: LINE_STYLE.getWidth,

    getEditHandlePointRadius: EDIT_HANDLE_STYLE.getRadius,
    getEditHandlePointColor: EDIT_HANDLE_STYLE.getFillColor,
    getEditHandlePointOutlineColor: EDIT_HANDLE_STYLE.getOutlineColor,

    getTentativeLineColor: LINE_STYLE.getTentativeLineColor,
    // @ts-ignore
    getTentativeLineWidth: LINE_STYLE.getTentativeLineWidth,
    getTentativeFillColor: LINE_STYLE.getTentativeFillColor,

    parameters: {}
  });
}
