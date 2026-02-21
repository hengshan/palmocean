/**
 * AOI Control — Kepler MapControl action component using Nebula.gl editor modes.
 *
 * Replaces Geoman-based AOI drawing with Kepler's built-in editor layer
 * (powered by @nebula.gl/edit-modes). Uses the same pattern as map-draw-panel.tsx.
 *
 * Author: Lyra · 2026-02-21
 */

import React, {useCallback, useEffect, useState} from 'react';
import styled from 'styled-components';
import classnames from 'classnames';
import {MapControlButton} from '@kepler.gl/components';
import {EDITOR_MODES} from '@kepler.gl/constants';
import {Editor, MapControls} from '@kepler.gl/types';
import {setAoiGeometry, setAoiMode, clearAoi} from '../palmview/raster-state';

// ── Styled Components ────────────────────────────────

const StyledToolbar = styled.div<{$show?: boolean}>`
  display: flex;
  flex-direction: column;
  background-color: ${props => props.theme.dropdownListBgd};
  box-shadow: ${props => props.theme.dropdownListShadow};
  font-size: 12px;
  transition: ${props => props.theme.transitionSlow};
  margin-top: ${props => (props.$show ? '6px' : '20px')};
  opacity: ${props => (props.$show ? 1 : 0)};
  pointer-events: ${props => (props.$show ? 'all' : 'none')};
  z-index: 1000;
  position: absolute;
  right: 32px;
  transform: translateX(calc(-50% + 45px));
`;

const StyledToolbarItem = styled.div<{$active?: boolean}>`
  color: ${props =>
    props.$active ? props.theme.toolbarItemIconHover : props.theme.panelHeaderIcon};
  padding: 13px 16px;
  align-items: center;
  display: flex;
  flex-direction: row;
  width: 140px;
  justify-content: flex-start;
  border: 1px solid ${props => (props.$active ? props.theme.toolbarItemBorderHover : 'transparent')};
  border-radius: ${props => props.theme.toolbarItemBorderRaddius || '2px'};
  background-color: ${props =>
    props.$active ? props.theme.toolbarItemBgdHover : props.theme.dropdownListBgd};
  cursor: pointer;
  gap: 8px;

  .toolbar-item__title {
    white-space: nowrap;
    color: ${props => props.theme.textColorHl};
    font-size: 11px;
  }

  &:hover {
    background-color: ${props => props.theme.toolbarItemBgdHover};
    border-color: ${props => props.theme.toolbarItemBorderHover};
    svg {
      color: ${props => props.theme.toolbarItemIconHover};
    }
  }
`;

// ── Icons ────────────────────────────────────────────

const AoiIcon = ({height = '18px'}: {height?: string}) => (
  <svg width={height} height={height} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="3" y="3" width="10" height="10" rx="1" />
    <line x1="8" y1="0" x2="8" y2="4" />
    <line x1="8" y1="12" x2="8" y2="16" />
    <line x1="0" y1="8" x2="4" y2="8" />
    <line x1="12" y1="8" x2="16" y2="8" />
  </svg>
);

const RectangleIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="2" y="3" width="12" height="10" rx="1" />
  </svg>
);

const PolygonIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <polygon points="8,1 14,5 12,14 4,14 2,5" />
  </svg>
);

const CircleIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <circle cx="8" cy="8" r="6" />
  </svg>
);

const FreehandIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M2 12C4 8 6 4 8 6C10 8 12 2 14 4" />
  </svg>
);

const EditIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M11.5 1.5l3 3L5 14H2v-3L11.5 1.5z" />
  </svg>
);

const RotateIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M13 8A5 5 0 1 1 8 3" />
    <path d="M8 1l2 2-2 2" />
  </svg>
);

const ScaleIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="4" y="4" width="8" height="8" />
    <path d="M12 12l3 3M1 1l3 3" />
  </svg>
);

const DeleteIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 10h8l1-10" />
  </svg>
);

// ── Tool definitions ─────────────────────────────────

type AoiTool = {
  mode: string;
  label: string;
  Icon: React.FC;
};

const AOI_TOOLS: AoiTool[] = [
  {mode: EDITOR_MODES.DRAW_RECTANGLE, label: 'Rectangle', Icon: RectangleIcon},
  {mode: EDITOR_MODES.DRAW_POLYGON, label: 'Polygon', Icon: PolygonIcon},
  {mode: EDITOR_MODES.DRAW_CIRCLE, label: 'Circle', Icon: CircleIcon},
  {mode: EDITOR_MODES.DRAW_FREEHAND, label: 'Freehand', Icon: FreehandIcon},
  {mode: EDITOR_MODES.EDIT, label: 'Select', Icon: EditIcon},
  {mode: EDITOR_MODES.ROTATE, label: 'Rotate', Icon: RotateIcon},
  {mode: EDITOR_MODES.SCALE, label: 'Scale', Icon: ScaleIcon},
];

// ── Status Dot ───────────────────────────────────────

const StatusDot = styled.div<{$hasAoi: boolean}>`
  position: absolute;
  top: -2px;
  right: -2px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${p => (p.$hasAoi ? '#4ecdc4' : 'transparent')};
  border: ${p => (p.$hasAoi ? '1px solid #4ecdc4' : 'none')};
  z-index: 1;
  transition: background 0.2s;
`;

// ── Component ────────────────────────────────────────

interface AoiControlProps {
  editor: Editor;
  mapControls: MapControls;
  onToggleMapControl: (control: string) => void;
  onSetEditorMode: (mode: string) => void;
  [key: string]: any;
}

const AoiControl: React.FC<AoiControlProps> = ({
  editor,
  mapControls,
  onToggleMapControl,
  onSetEditorMode
}) => {
  const [panelActive, setPanelActive] = useState(false);
  const hasFeatures = editor?.features?.length > 0;

  // Sync editor features → palmview AOI state + window.__PALMVIEW_AOI
  useEffect(() => {
    const features = editor?.features;
    if (!features || features.length === 0) {
      // Only clear if we previously had features (avoid clearing on mount)
      return;
    }

    // Merge all polygon features into AOI geometry
    const polygons: GeoJSON.Position[][][] = [];
    for (const f of features) {
      const g = f.geometry;
      if (g?.type === 'Polygon') polygons.push(g.coordinates);
      else if (g?.type === 'MultiPolygon') polygons.push(...g.coordinates);
    }

    if (polygons.length > 0) {
      const geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon =
        polygons.length === 1
          ? {type: 'Polygon', coordinates: polygons[0]}
          : {type: 'MultiPolygon', coordinates: polygons};
      setAoiGeometry(geometry);
      setAoiMode('drawn');
    }
  }, [editor?.features]);

  // Expose window.__PALMVIEW_AOI (reads from Kepler editor state)
  useEffect(() => {
    (window as any).__PALMVIEW_AOI = {
      clear: () => {
        clearAoi();
      },
      getGeometries: () =>
        (editor?.features || [])
          .map((f: any) => f.geometry)
          .filter(Boolean),
      getFeatureCollection: (): GeoJSON.FeatureCollection => ({
        type: 'FeatureCollection',
        features: (editor?.features || []).map((f: any, i: number) => ({
          type: 'Feature' as const,
          properties: {id: i, source: 'aoi-draw'},
          geometry: f.geometry,
        })),
      }),
    };
    return () => {
      delete (window as any).__PALMVIEW_AOI;
    };
  }, [editor?.features]);

  // Toggle panel — also activates Kepler's mapDraw control
  const handleToggle = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const next = !panelActive;
      setPanelActive(next);

      // Activate/deactivate Kepler's editor menu
      const isMapDrawActive = mapControls?.mapDraw?.active;
      if (next && !isMapDrawActive) {
        onToggleMapControl('mapDraw');
      } else if (!next && isMapDrawActive) {
        onToggleMapControl('mapDraw');
      }

      if (!next) {
        // Exiting — switch to EDIT mode (select/translate)
        onSetEditorMode(EDITOR_MODES.EDIT);
      }
    },
    [panelActive, mapControls, onToggleMapControl, onSetEditorMode]
  );

  // Handle tool click
  const handleToolClick = useCallback(
    (mode: string) => {
      // Ensure mapDraw is active
      if (!mapControls?.mapDraw?.active) {
        onToggleMapControl('mapDraw');
      }
      onSetEditorMode(mode);
    },
    [mapControls, onToggleMapControl, onSetEditorMode]
  );

  // Handle delete — clears AOI state
  const handleDelete = useCallback(() => {
    clearAoi();
  }, []);

  return (
    <div className="map-aoi-controls" style={{position: 'relative'}}>
      {panelActive ? (
        <StyledToolbar $show={panelActive}>
          {AOI_TOOLS.map(({mode, label, Icon}) => (
            <StyledToolbarItem
              key={mode}
              $active={editor?.mode === mode}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                handleToolClick(mode);
              }}
            >
              <div style={{width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                <Icon />
              </div>
              <div className="toolbar-item__title">{label}</div>
            </StyledToolbarItem>
          ))}
          {/* Delete button — only active when a feature is selected */}
          <StyledToolbarItem
            $active={false}
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              handleDelete();
            }}
            style={{opacity: hasFeatures ? 1 : 0.4}}
          >
            <div style={{width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
              <DeleteIcon />
            </div>
            <div className="toolbar-item__title">Delete</div>
          </StyledToolbarItem>
        </StyledToolbar>
      ) : null}
      <div style={{position: 'relative'}}>
        <StatusDot $hasAoi={hasFeatures} />
        <MapControlButton
          className={classnames('map-control-button', 'toggle-aoi', {isActive: panelActive})}
          onClick={handleToggle}
          active={panelActive}
        >
          <AoiIcon height="18px" />
        </MapControlButton>
      </div>
    </div>
  );
};

AoiControl.displayName = 'AoiControl';

export default React.memo(AoiControl);
