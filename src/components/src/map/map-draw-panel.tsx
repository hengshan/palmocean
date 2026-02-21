// SPDX-License-Identifier: MIT
// Copyright contributors to the kepler.gl project

import React, {useCallback} from 'react';
import classnames from 'classnames';

import {EDITOR_MODES} from '@kepler.gl/constants';
import {CursorClick, DrawPolygon, EyeSeen, EyeUnseen, Polygon, Rectangle} from '../common/icons';
import {MapControlButton} from '../common/styled-components';
import ToolbarItem from '../common/toolbar-item';
import MapControlTooltipFactory from './map-control-tooltip';
import MapControlToolbarFactory from './map-control-toolbar';
import {Editor, MapControls} from '@kepler.gl/types';
import {BaseProps} from '../common/icons';

// ── Inline SVG Icons for nebula.gl modes ──

const CircleIcon: React.FC<Partial<BaseProps>> = ({height = '16px'}) => (
  <svg width={height} height={height} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <circle cx="8" cy="8" r="6" />
  </svg>
);
CircleIcon.displayName = 'CircleIcon';

const FreehandIcon: React.FC<Partial<BaseProps>> = ({height = '16px'}) => (
  <svg width={height} height={height} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M2 12C4 8 6 4 8 6C10 8 12 2 14 4" />
  </svg>
);
FreehandIcon.displayName = 'FreehandIcon';

const PointIcon: React.FC<Partial<BaseProps>> = ({height = '16px'}) => (
  <svg width={height} height={height} viewBox="0 0 16 16" fill="currentColor" stroke="none">
    <circle cx="8" cy="8" r="4" />
  </svg>
);
PointIcon.displayName = 'PointIcon';

const LineIcon: React.FC<Partial<BaseProps>> = ({height = '16px'}) => (
  <svg width={height} height={height} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <line x1="2" y1="14" x2="14" y2="2" />
    <circle cx="2" cy="14" r="1.5" fill="currentColor" />
    <circle cx="14" cy="2" r="1.5" fill="currentColor" />
  </svg>
);
LineIcon.displayName = 'LineIcon';

const ScaleIcon: React.FC<Partial<BaseProps>> = ({height = '16px'}) => (
  <svg width={height} height={height} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="3" y="3" width="10" height="10" strokeDasharray="2 2" />
    <path d="M1 1l3 3M15 15l-3-3" />
    <path d="M15 1l-3 3M1 15l3-3" />
  </svg>
);
ScaleIcon.displayName = 'ScaleIcon';

const RotateIcon: React.FC<Partial<BaseProps>> = ({height = '16px'}) => (
  <svg width={height} height={height} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M13 8A5 5 0 1 1 8 3" />
    <path d="M8 1l2 2-2 2" />
  </svg>
);
RotateIcon.displayName = 'RotateIcon';

MapDrawPanelFactory.deps = [MapControlTooltipFactory, MapControlToolbarFactory];

export type MapDrawPanelProps = {
  editor: Editor;
  mapControls: MapControls;
  onToggleMapControl: (control: string) => void;
  onSetEditorMode: (mode: string) => void;
  onToggleEditorVisibility: () => void;
  actionIcons: {[id: string]: React.ComponentType<Partial<BaseProps>>};
};

function MapDrawPanelFactory(
  MapControlTooltip: ReturnType<typeof MapControlTooltipFactory>,
  MapControlToolbar: ReturnType<typeof MapControlToolbarFactory>
) {
  const defaultActionIcons = {
    visible: EyeSeen,
    hidden: EyeUnseen,
    polygon: DrawPolygon,
    cursor: CursorClick,
    innerPolygon: Polygon,
    rectangle: Rectangle,
    circle: CircleIcon,
    point: PointIcon,
    line: LineIcon,
    freehand: FreehandIcon,
    rotate: RotateIcon,
    scale: ScaleIcon
  };

  const MapDrawPanel: React.FC<MapDrawPanelProps> = React.memo(
    ({
      editor,
      mapControls,
      onToggleMapControl,
      onSetEditorMode,
      actionIcons = defaultActionIcons
    }) => {
      const isActive = mapControls?.mapDraw?.active;
      const onToggleMenuPanel = useCallback(
        () => onToggleMapControl('mapDraw'),
        [onToggleMapControl]
      );
      if (!mapControls?.mapDraw?.show) {
        return null;
      }
      return (
        <div className="map-draw-controls" style={{position: 'relative'}}>
          {isActive ? (
            <MapControlToolbar show={isActive}>
              <ToolbarItem
                className="edit-feature"
                onClick={() => onSetEditorMode(EDITOR_MODES.EDIT)}
                label="toolbar.select"
                icon={actionIcons.cursor}
                active={editor.mode === EDITOR_MODES.EDIT}
              />
              <ToolbarItem
                className="draw-rectangle"
                onClick={() => onSetEditorMode(EDITOR_MODES.DRAW_RECTANGLE)}
                label="toolbar.rectangle"
                icon={actionIcons.rectangle}
                active={editor.mode === EDITOR_MODES.DRAW_RECTANGLE}
              />
              <ToolbarItem
                className="draw-feature"
                onClick={() => onSetEditorMode(EDITOR_MODES.DRAW_POLYGON)}
                label="toolbar.polygon"
                icon={actionIcons.innerPolygon}
                active={editor.mode === EDITOR_MODES.DRAW_POLYGON}
              />
              <ToolbarItem
                className="draw-circle"
                onClick={() => onSetEditorMode(EDITOR_MODES.DRAW_CIRCLE)}
                label="toolbar.circle"
                icon={actionIcons.circle}
                active={editor.mode === EDITOR_MODES.DRAW_CIRCLE}
              />
              <ToolbarItem
                className="draw-point"
                onClick={() => onSetEditorMode(EDITOR_MODES.DRAW_POINT)}
                label="toolbar.point"
                icon={actionIcons.point}
                active={editor.mode === EDITOR_MODES.DRAW_POINT}
              />
              <ToolbarItem
                className="draw-line"
                onClick={() => onSetEditorMode(EDITOR_MODES.DRAW_LINE)}
                label="toolbar.line"
                icon={actionIcons.line}
                active={editor.mode === EDITOR_MODES.DRAW_LINE}
              />
              <ToolbarItem
                className="draw-freehand"
                onClick={() => onSetEditorMode(EDITOR_MODES.DRAW_FREEHAND)}
                label="toolbar.freehand"
                icon={actionIcons.freehand}
                active={editor.mode === EDITOR_MODES.DRAW_FREEHAND}
              />
              <ToolbarItem
                className="rotate-feature"
                onClick={() => onSetEditorMode(EDITOR_MODES.ROTATE)}
                label="toolbar.rotate"
                icon={actionIcons.rotate}
                active={editor.mode === EDITOR_MODES.ROTATE}
              />
              <ToolbarItem
                className="scale-feature"
                onClick={() => onSetEditorMode(EDITOR_MODES.SCALE)}
                label="toolbar.scale"
                icon={actionIcons.scale}
                active={editor.mode === EDITOR_MODES.SCALE}
              />
            </MapControlToolbar>
          ) : null}
          <MapControlTooltip id="map-draw" message="tooltip.DrawOnMap">
            <MapControlButton
              className={classnames('map-control-button', 'map-draw', {isActive})}
              onClick={e => {
                e.preventDefault();
                onToggleMenuPanel();
              }}
              active={isActive}
            >
              <actionIcons.polygon height="18px" />
            </MapControlButton>
          </MapControlTooltip>
        </div>
      );
    }
  );

  MapDrawPanel.displayName = 'MapDrawPanel';
  return MapDrawPanel;
}

export default MapDrawPanelFactory;
