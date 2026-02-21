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
    freehand: FreehandIcon,
    rotate: RotateIcon
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
