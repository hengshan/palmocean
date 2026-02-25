// SPDX-License-Identifier: MIT
// Copyright ©Synga — PalmView Sprint 3 T2: Shapefile Browser Upload
// Accepts .zip (shp+dbf+prj) and .geojson/.json files, parses to GeoJSON,
// and calls onGeoJSON callback with the result.

import React, {useCallback, useRef, useState} from 'react';
import shpjs from 'shpjs';
import styled, {keyframes} from 'styled-components';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ShapefileUploaderProps {
  onGeoJSON: (geojson: GeoJSON.FeatureCollection, filename: string) => void;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const ACCEPT = '.zip,.geojson,.json';

// ─── Parse helper ────────────────────────────────────────────────────────────

async function parseFile(file: File): Promise<GeoJSON.FeatureCollection> {
  if (file.name.endsWith('.zip')) {
    const buffer = await file.arrayBuffer();
    const result = await shpjs(buffer);
    if (Array.isArray(result)) {
      return {
        type: 'FeatureCollection',
        features: result.flatMap(fc => fc.features)
      } as GeoJSON.FeatureCollection;
    }
    return result as GeoJSON.FeatureCollection;
  } else {
    // GeoJSON / JSON
    const text = await file.text();
    return JSON.parse(text) as GeoJSON.FeatureCollection;
  }
}

// ─── Styled Components ───────────────────────────────────────────────────────

const spin = keyframes`
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
`;

const DropZone = styled.div<{$dragging: boolean; $disabled: boolean}>`
  border: 2px dashed
    ${(p: any) =>
      p.$dragging
        ? p.theme?.activeColor || '#1FBF6E'
        : p.theme?.borderColor || 'rgba(255,255,255,0.15)'};
  border-radius: 6px;
  padding: 20px 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  cursor: ${p => (p.$disabled ? 'not-allowed' : 'pointer')};
  background: ${(p: any) =>
    p.$dragging
      ? p.theme?.panelBackground || 'rgba(31,191,110,0.07)'
      : 'transparent'};
  transition: all 0.15s;
  opacity: ${p => (p.$disabled ? 0.55 : 1)};

  &:hover {
    border-color: ${(p: any) => (!p.$disabled ? p.theme?.activeColor || '#1FBF6E' : undefined)};
    background: ${(p: any) =>
      !p.$disabled ? p.theme?.panelBackground || 'rgba(255,255,255,0.04)' : undefined};
  }
`;

const DropIcon = styled.div`
  font-size: 24px;
  line-height: 1;
`;

const DropText = styled.div`
  color: ${(p: any) => p.theme?.subtextColorActive || '#D3D8E0'};
  font-size: 11px;
  font-weight: 600;
  text-align: center;
`;

const DropSubText = styled.div`
  color: ${(p: any) => p.theme?.subtextColor || '#6A7485'};
  font-size: 10px;
  text-align: center;
`;

const HiddenInput = styled.input`
  display: none;
`;

const StatusRow = styled.div<{$type: 'loading' | 'error' | 'success'}>`
  display: flex;
  align-items: center;
  gap: 6px;
  background: ${p =>
    p.$type === 'error'
      ? 'rgba(255,80,80,0.08)'
      : p.$type === 'success'
      ? 'rgba(31,191,110,0.08)'
      : 'rgba(255,255,255,0.04)'};
  border: 1px solid
    ${p =>
      p.$type === 'error'
        ? 'rgba(255,80,80,0.25)'
        : p.$type === 'success'
        ? 'rgba(31,191,110,0.25)'
        : 'rgba(255,255,255,0.1)'};
  border-radius: 4px;
  padding: 6px 10px;
  font-size: 10.5px;
  color: ${(p: any) =>
    p.$type === 'error'
      ? '#ff6b6b'
      : p.$type === 'success'
      ? '#1FBF6E'
      : p.theme?.subtextColorActive || '#D3D8E0'};
  margin-top: 8px;
`;

const Spinner = styled.span`
  display: inline-block;
  width: 12px;
  height: 12px;
  border: 2px solid rgba(255, 255, 255, 0.15);
  border-top-color: ${(p: any) => p.theme?.activeColor || '#1FBF6E'};
  border-radius: 50%;
  animation: ${spin} 0.7s linear infinite;
  flex-shrink: 0;
`;

// ─── Component ───────────────────────────────────────────────────────────────

const ShapefileUploader: React.FC<ShapefileUploaderProps> = ({onGeoJSON}) => {
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      const file = files[0];
      setLoading(true);
      setError(null);
      setSuccessMsg(null);
      try {
        const geojson = await parseFile(file);
        const baseName = file.name.replace(/\.(zip|geojson|json)$/i, '');
        onGeoJSON(geojson, baseName);
        const count = geojson.features?.length ?? 0;
        setSuccessMsg(`✓ Loaded "${baseName}" — ${count} feature${count !== 1 ? 's' : ''}`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(`Failed to parse file: ${msg}`);
      } finally {
        setLoading(false);
      }
    },
    [onGeoJSON]
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  }, []);

  const onDragLeave = useCallback(() => {
    setDragging(false);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      void handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  const onClick = useCallback(() => {
    if (!loading) inputRef.current?.click();
  }, [loading]);

  const onChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      void handleFiles(e.target.files);
      // reset so same file can be re-selected
      e.target.value = '';
    },
    [handleFiles]
  );

  return (
    <>
      <DropZone
        $dragging={dragging}
        $disabled={loading}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={onClick}
      >
        <DropIcon>{loading ? '⏳' : '📂'}</DropIcon>
        <DropText>{loading ? 'Parsing file…' : 'Drop file here or click to browse'}</DropText>
        <DropSubText>Supports .zip (Shapefile) · .geojson · .json</DropSubText>
        <HiddenInput ref={inputRef} type="file" accept={ACCEPT} onChange={onChange} />
      </DropZone>

      {loading && (
        <StatusRow $type="loading">
          <Spinner />
          Parsing shapefile…
        </StatusRow>
      )}
      {error && <StatusRow $type="error">⚠ {error}</StatusRow>}
      {successMsg && !loading && <StatusRow $type="success">{successMsg}</StatusRow>}
    </>
  );
};

export default ShapefileUploader;
