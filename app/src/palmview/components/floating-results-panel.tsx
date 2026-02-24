/**
 * FloatingResultsPanel — Draggable, resizable results overlay on map canvas
 * Author: IRIS · 2026-02-20
 * Renders via React Portal into .kepler-gl .map-container
 */

import React, {useState, useCallback, useEffect, useRef} from 'react';
import {createPortal} from 'react-dom';
import styled from 'styled-components';
import type {InferenceJobDetail, InferenceOutputItem} from '../types';

// ── Types ────────────────────────────────────────────

interface Position {
  x: number;
  y: number;
}

interface Size {
  width: number;
  height: number;
}

export interface FloatingResultsPanelProps {
  isVisible: boolean;
  job: InferenceJobDetail | null;
  outputs: InferenceOutputItem[];
  confidenceThreshold: number;
  onClose: () => void;
  onConfidenceChange: (value: number) => void;
  onAddToMap: () => void;
  onExport: (format: string) => void;
}

// ── Styled Components ────────────────────────────────

const StyledPanel = styled.div<{
  $x: number;
  $y: number;
  $width: number;
  $height: number;
  $minimized: boolean;
}>`
  position: absolute;
  right: ${props => props.$x}px;
  bottom: ${props => props.$y}px;
  width: ${props => props.$width}px;
  height: ${props => (props.$minimized ? 36 : props.$height)}px;
  background-color: ${props => props.theme.mapPanelBackgroundColor || 'rgba(41, 50, 60, 0.92)'};
  border-radius: 4px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
  z-index: 100;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: height 200ms ease-out;
  font-family: ${props => props.theme.fontFamily || "'Inter', sans-serif"};
`;

const StyledDragHandle = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 36px;
  padding: 0 12px;
  background-color: ${props => props.theme.mapPanelHeaderBackgroundColor || '#3A4552'};
  cursor: grab;
  user-select: none;
  flex-shrink: 0;
  &:active {
    cursor: grabbing;
  }
`;

const StyledTitle = styled.span`
  font-size: 11px;
  font-weight: 500;
  color: ${props => props.theme.titleTextColor || '#D3D8E0'};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
`;

const StyledControls = styled.div`
  display: flex;
  gap: 4px;
  align-items: center;
`;

const StyledControlBtn = styled.button<{$active?: boolean}>`
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 2px;
  background: transparent;
  color: ${props =>
    props.$active
      ? props.theme.activeColor || '#00D2FF'
      : props.theme.textColor || '#A0A7B4'};
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  padding: 0;
  &:hover {
    background-color: ${props => props.theme.panelBackgroundHover || '#4A5568'};
    color: ${props => props.theme.textColorHl || '#FFFFFF'};
  }
`;

const StyledBody = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  &::-webkit-scrollbar {
    width: 6px;
  }
  &::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.2);
    border-radius: 3px;
  }
`;

const StyledStatRow = styled.div`
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
`;

const StyledStatCard = styled.div`
  flex: 1;
  background: ${props => props.theme.sidePanelBg || '#29323C'};
  border-radius: 4px;
  padding: 8px;
  text-align: center;
`;

const StyledStatValue = styled.div`
  font-size: 18px;
  font-weight: 700;
  color: ${props => props.theme.textColorHl || '#FFFFFF'};
`;

const StyledStatLabel = styled.div`
  font-size: 10px;
  color: ${props => props.theme.textColor || '#A0A7B4'};
  margin-top: 2px;
`;

const StyledSliderRow = styled.div`
  margin-bottom: 12px;
`;

const StyledSliderLabel = styled.div`
  font-size: 11px;
  color: ${props => props.theme.textColor || '#A0A7B4'};
  margin-bottom: 4px;
  display: flex;
  justify-content: space-between;
`;

const StyledSlider = styled.input`
  width: 100%;
  accent-color: #00d2ff;
`;

const StyledProgressBar = styled.div<{$pct: number}>`
  height: 4px;
  background: ${props => props.theme.sidePanelBg || '#29323C'};
  border-radius: 2px;
  margin-bottom: 12px;
  overflow: hidden;
  &::after {
    content: '';
    display: block;
    height: 100%;
    width: ${props => props.$pct * 100}%;
    background: ${props =>
      props.$pct >= 1 ? '#2ECC71' : '#00D2FF'};
    border-radius: 2px;
    transition: width 300ms ease-out;
  }
`;

const StyledActionBar = styled.div`
  display: flex;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid ${props => props.theme.sidePanelBorderColor || '#3A4552'};
`;

const StyledButton = styled.button<{$primary?: boolean}>`
  flex: 1;
  height: 28px;
  border: ${props =>
    props.$primary ? 'none' : `1px solid ${props.theme.textColor || '#A0A7B4'}`};
  border-radius: 2px;
  background: ${props => (props.$primary ? '#00D2FF' : 'transparent')};
  color: ${props => (props.$primary ? '#000' : props.theme.textColor || '#A0A7B4')};
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  &:hover {
    opacity: 0.85;
  }
`;

// ── Hook: useDrag ────────────────────────────────────

function useDrag(initialPos: Position) {
  const [pos, setPos] = useState(initialPos);
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({x: 0, y: 0});
  const posStart = useRef(initialPos);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      setIsDragging(true);
      dragStart.current = {x: e.clientX, y: e.clientY};
      posStart.current = pos;
    },
    [pos]
  );

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: MouseEvent) => {
      setPos({
        x: posStart.current.x - (e.clientX - dragStart.current.x),
        y: posStart.current.y - (e.clientY - dragStart.current.y),
      });
    };
    const onUp = () => setIsDragging(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [isDragging]);

  return {pos, onMouseDown};
}

// ── Helper: format duration ──────────────────────────

function formatDuration(start?: string | null, end?: string | null): string {
  if (!start || !end) return '—';
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return `${(ms / 1000).toFixed(1)}s`;
}

// ── Component ────────────────────────────────────────

export const FloatingResultsPanel: React.FC<FloatingResultsPanelProps> = ({
  isVisible,
  job,
  outputs,
  confidenceThreshold,
  onClose,
  onConfidenceChange,
  onAddToMap,
  onExport,
}) => {
  const [minimized, setMinimized] = useState(false);
  const [pinned, setPinned] = useState(true);
  const {pos, onMouseDown} = useDrag({x: 16, y: 16});
  const [size] = useState<Size>({width: 380, height: 320});

  // Find map container for portal — re-check when visibility changes
  const [container, setContainer] = useState<Element | null>(null);
  useEffect(() => {
    if (!isVisible) return;
    // Retry a few times in case map hasn't rendered yet
    let attempts = 0;
    const find = () => {
      const el = document.querySelector('.kepler-gl .map-container') ||
                 document.querySelector('.kepler-gl__overlay') ||
                 document.querySelector('[class*="map-container"]') ||
                 document.body;
      if (el) {
        setContainer(el);
      } else if (attempts < 10) {
        attempts++;
        setTimeout(find, 200);
      }
    };
    find();
  }, [isVisible]);

  if (!isVisible || !job || !container) return null;

  const isRunning = job.status === 'running' || job.status === 'queued';
  const isComplete = job.status === 'complete';
  const stats = outputs[0]?.stats as Record<string, number> | undefined;

  const title = isRunning
    ? `⏳ Processing... ${Math.round(job.progress * 100)}%`
    : isComplete
    ? `✓ Complete · ${formatDuration(job.started_at, job.finished_at)}`
    : `${job.status}`;

  const panel = (
    <StyledPanel
      $x={pos.x}
      $y={pos.y}
      $width={size.width}
      $height={size.height}
      $minimized={minimized}
    >
      {/* Header */}
      <StyledDragHandle onMouseDown={onMouseDown}>
        <StyledTitle>{title}</StyledTitle>
        <StyledControls>
          <StyledControlBtn $active={pinned} onClick={() => setPinned(!pinned)} title="Pin">
            📌
          </StyledControlBtn>
          <StyledControlBtn onClick={() => setMinimized(!minimized)} title="Minimize">
            {minimized ? '□' : '─'}
          </StyledControlBtn>
          <StyledControlBtn onClick={onClose} title="Close">
            ✕
          </StyledControlBtn>
        </StyledControls>
      </StyledDragHandle>

      {/* Body */}
      {!minimized && (
        <StyledBody>
          {/* Progress bar (while running) */}
          {isRunning && <StyledProgressBar $pct={job.progress} />}

          {/* Running status message */}
          {isRunning && (
            <StyledStatRow>
              <StyledStatCard>
                <StyledStatValue>🔄</StyledStatValue>
                <StyledStatLabel>Analyzing tiles...</StyledStatLabel>
              </StyledStatCard>
            </StyledStatRow>
          )}

          {/* Stats (when complete) */}
          {isComplete && (
            <StyledStatRow>
              {stats && Object.entries(stats).map(([key, val]) => (
                <StyledStatCard key={key}>
                  <StyledStatValue>{typeof val === 'number' ? val.toLocaleString() : String(val)}</StyledStatValue>
                  <StyledStatLabel>{key.replace(/_/g, ' ')}</StyledStatLabel>
                </StyledStatCard>
              ))}
              {(!stats || Object.keys(stats).length === 0) && (
                <StyledStatCard>
                  <StyledStatValue>✓</StyledStatValue>
                  <StyledStatLabel>Analysis complete</StyledStatLabel>
                </StyledStatCard>
              )}
            </StyledStatRow>
          )}

          {/* Confidence slider */}
          {isComplete && (
            <StyledSliderRow>
              <StyledSliderLabel>
                <span>Confidence</span>
                <span>{confidenceThreshold.toFixed(2)}</span>
              </StyledSliderLabel>
              <StyledSlider
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={confidenceThreshold}
                onChange={e => onConfidenceChange(parseFloat(e.target.value))}
              />
            </StyledSliderRow>
          )}

          {/* Actions */}
          {isComplete && (
            <StyledActionBar>
              <StyledButton onClick={() => onExport('geojson')}>Export ▾</StyledButton>
              <StyledButton $primary onClick={onAddToMap}>
                Add to Map
              </StyledButton>
            </StyledActionBar>
          )}

          {/* Error state */}
          {job.status === 'failed' && (
            <div style={{color: '#E74C3C', fontSize: 12, padding: 8}}>
              ⚠️ {job.error || 'Analysis failed'}
            </div>
          )}
        </StyledBody>
      )}
    </StyledPanel>
  );

  return createPortal(panel, container);
};

export default FloatingResultsPanel;
