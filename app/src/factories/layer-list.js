// SPDX-License-Identifier: MIT
// Copyright ©Synga — PalmView Custom Layer List (T4 — layer grouping)
// Wraps Kepler's LayerListFactory to display layers in Vector / Raster / BaseMap groups.

import React, {useMemo} from 'react';
import styled from 'styled-components';
import {LayerListFactory, LayerManagerFactory} from '@kepler.gl/components';

// ─── Layer type classification ─────────────────────────────────────────────

/** Layer types considered as raster in kepler.gl's layer stack */
const RASTER_LAYER_TYPES = new Set(['rasterTile', 'wms', 'raster-tile']);

function classifyLayer(layer) {
  return RASTER_LAYER_TYPES.has(layer.type) ? 'raster' : 'vector';
}

// ─── Styled group header ───────────────────────────────────────────────────

const GroupHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 0 4px 2px;
  color: ${p => p.theme?.subtextColor || '#6A7485'};
  font-size: 9.5px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  border-bottom: 1px solid ${p => p.theme?.borderColor || 'rgba(255,255,255,0.07)'};
  margin-top: 8px;
  margin-bottom: 4px;
  &:first-child {
    margin-top: 0;
  }
`;

const GroupIcon = styled.span`
  font-size: 12px;
`;

const EmptyGroup = styled.div`
  color: ${p => p.theme?.subtextColor || '#6A7485'};
  font-size: 10px;
  font-style: italic;
  padding: 6px 4px;
  opacity: 0.5;
`;

const BaseMapRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  background: ${p => p.theme?.panelBackgroundHover || 'rgba(255,255,255,0.03)'};
  border-radius: 4px;
  font-size: 10.5px;
  color: ${p => p.theme?.subtextColor || '#6A7485'};
`;

// ─── Custom LayerList wrapper ──────────────────────────────────────────────

/**
 * CustomLayerListFactory wraps Kepler's original LayerListFactory.
 * It renders the layer list split into Vector / Raster sections, with
 * a static "Base Map" section at the bottom.
 */
export function CustomLayerListFactory(LayerPanel) {
  // Get the original LayerList from kepler
  const OriginalLayerList = LayerListFactory(LayerPanel);

  const GroupedLayerList = props => {
    const {layers, layerOrder} = props;

    // Compute ordered+visible layers (mirrors logic in original LayerList)
    const orderedLayers = useMemo(() => {
      if (!layerOrder || !layers) return [];
      return layerOrder
        .map(id => layers.find(l => l && l.id === id))
        .filter(l => l && !l.config?.hidden);
    }, [layers, layerOrder]);

    const vectorLayers = useMemo(
      () => orderedLayers.filter(l => classifyLayer(l) === 'vector'),
      [orderedLayers]
    );

    const rasterLayers = useMemo(
      () => orderedLayers.filter(l => classifyLayer(l) === 'raster'),
      [orderedLayers]
    );

    // Helper: render a group's layers using the original LayerList (keeps DnD working)
    // We pass filtered layers but keep original layerOrder for DnD context compatibility
    const renderGroup = (groupLayers) => {
      if (groupLayers.length === 0) return null;
      const filteredOrder = layerOrder.filter(id =>
        groupLayers.some(l => l.id === id)
      );
      return (
        <OriginalLayerList
          {...props}
          layers={layers}
          layerOrder={filteredOrder}
        />
      );
    };

    return (
      <div>
        {/* ── Vector Layers ── */}
        <GroupHeader>
          <GroupIcon>🗺️</GroupIcon>
          Vector Layers
        </GroupHeader>
        {vectorLayers.length === 0 ? (
          <EmptyGroup>No vector layers</EmptyGroup>
        ) : (
          renderGroup(vectorLayers)
        )}

        {/* ── Raster Layers ── (only shown when raster layers exist) */}
        {rasterLayers.length > 0 && (
          <>
            <GroupHeader>
              <GroupIcon>🛰️</GroupIcon>
              Raster Layers
            </GroupHeader>
            {renderGroup(rasterLayers)}
          </>
        )}

        {/* ── Base Map ── static placeholder */}
        <GroupHeader>
          <GroupIcon>🌐</GroupIcon>
          Base Map
        </GroupHeader>
        <BaseMapRow>
          <span>🗺️</span>
          <span>Active basemap (managed via Layer Control)</span>
        </BaseMapRow>
      </div>
    );
  };

  GroupedLayerList.displayName = 'GroupedLayerList';
  return GroupedLayerList;
}

CustomLayerListFactory.deps = LayerListFactory.deps;

export function replaceLayerList() {
  return [LayerListFactory, CustomLayerListFactory];
}
