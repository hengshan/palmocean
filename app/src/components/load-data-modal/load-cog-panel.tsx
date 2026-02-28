// SPDX-License-Identifier: MIT
// Copyright contributors to the kepler.gl project

import React, {useCallback, useEffect, useState} from 'react';
import styled from 'styled-components';

import {validateUrl} from '@kepler.gl/common-utils';
import {DatasetType} from '@kepler.gl/constants';
import {Button} from '@kepler.gl/components';

// ─── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_TITILER_BASE_URL = 'http://szls.taila366a3.ts.net:8003';
const DEFAULT_RESCALE = '0,3000';

// Band presets for common satellite imagery types
// Params are appended to the TiTiler tile URL
interface BandPreset {
  id: string;
  label: string;
  description: string;
  /** Extra query params appended to tile URL (e.g. bidx, expression, colormap_name) */
  params: Record<string, string>;
  /** Suggested rescale override (empty = use current rescale) */
  rescaleOverride?: string;
}

const BAND_PRESETS: BandPreset[] = [
  {
    id: 'none',
    label: 'Default (no preset)',
    description: 'Use file as-is with current rescale range',
    params: {}
  },
  {
    id: 'rgb',
    label: '🌈 RGB True Color',
    description: 'Bands 4-3-2 (Red/Green/Blue) — natural colour',
    params: {bidx: '4,3,2'},
    rescaleOverride: '0,3000'
  },
  {
    id: 'cir',
    label: '🌿 CIR False Color',
    description: 'Bands 8-4-3 (NIR/Red/Green) — vegetation highlights',
    params: {bidx: '8,4,3'},
    rescaleOverride: '0,5000'
  },
  {
    id: 'agriculture',
    label: '🌾 Agriculture',
    description: 'Bands 11-8-2 (SWIR/NIR/Blue) — crop stress detection',
    params: {bidx: '11,8,2'},
    rescaleOverride: '0,5000'
  },
  {
    id: 'ndvi',
    label: '📊 NDVI (vegetation index)',
    description: 'Expression (B8−B4)/(B8+B4) — green = healthy vegetation',
    params: {
      expression: '(b8-b4)/(b8+b4)',
      colormap_name: 'rdylgn',
      rescale: '-1,1'
    },
    rescaleOverride: '-1,1'
  },
  {
    id: 'single',
    label: '⬜ Single Band',
    description: 'Band 1 only — grayscale elevation / thermal / etc.',
    params: {bidx: '1', colormap_name: 'greys'},
    rescaleOverride: '0,10000'
  }
];

// ─── Styled Components ───────────────────────────────────────────────────────

const StyledDescription = styled.div`
  font-size: 14px;
  color: ${props => props.theme.labelColorLT};
  line-height: 18px;
  margin-bottom: 12px;
`;

const InputForm = styled.div`
  flex-grow: 1;
  padding: 32px;
  background-color: ${props => props.theme.panelBackgroundLT};
`;

const StyledInput = styled.input<{error?: boolean | string}>`
  width: 100%;
  padding: ${props => props.theme.inputPadding};
  color: ${props => (props.error ? 'red' : props.theme.titleColorLT)};
  height: ${props => props.theme.inputBoxHeight};
  border: 0;
  outline: 0;
  font-size: ${props => props.theme.inputFontSize};
  margin-bottom: 16px;

  &:active,
  &:focus,
  &.focus,
  &.active {
    outline: 0;
  }
`;

const StyledSelect = styled.select`
  width: 100%;
  padding: ${props => props.theme.inputPadding};
  color: ${props => props.theme.titleColorLT};
  height: ${props => props.theme.inputBoxHeight};
  border: 0;
  outline: 0;
  font-size: ${props => props.theme.inputFontSize};
  background-color: ${props => props.theme.inputBgdColor || props.theme.panelBackgroundLT};
  margin-bottom: 8px;
  cursor: pointer;
`;

const StyledFromGroup = styled.div`
  margin-top: 20px;
  display: flex;
  flex-direction: row;
`;

const StyledInputLabel = styled.div`
  font-size: 11px;
  color: ${props => props.theme.textColorLT};
  letter-spacing: 0.2px;
  margin-bottom: 4px;
`;

const StyledError = styled.div`
  color: red;
  font-size: 12px;
  margin-top: 8px;
`;

const StyledSuccess = styled.div`
  color: ${props => props.theme.activeColor || 'green'};
  font-size: 12px;
  margin-top: 8px;
`;

const PresetDescription = styled.div`
  font-size: 11px;
  color: ${props => props.theme.subtextColorLT};
  margin-bottom: 12px;
  font-style: italic;
`;

const ExampleUrl = styled.div`
  font-size: 11px;
  color: ${props => props.theme.subtextColorLT};
  margin-top: 4px;
  word-break: break-all;
`;

const Divider = styled.hr`
  border: none;
  border-top: 1px solid ${props => props.theme.borderColorLT || '#e0e0e0'};
  margin: 16px 0;
`;

// ─── Types ───────────────────────────────────────────────────────────────────

interface LoadCogPanelProps {
  onTilesetAdded?: (
    tileset: {name: string; type: string; metadata: Record<string, unknown>},
    processedMetadata?: Record<string, unknown>
  ) => void;
}

interface CogInfo {
  bounds?: [number, number, number, number];
  minzoom?: number;
  maxzoom?: number;
  band_metadata?: Array<[string, Record<string, unknown>]>;
  band_descriptions?: Array<[string, string]>;
  dtype?: string;
  colorinterp?: string[];
  width?: number;
  height?: number;
  count?: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildTileUrl(
  titilerBaseUrl: string,
  cogUrl: string,
  rescale: string,
  preset: BandPreset
): string {
  const base = `${titilerBaseUrl}/cog/tiles/WebMercatorQuad/{z}/{x}/{y}.png`;
  const params = new URLSearchParams({url: cogUrl});

  // Apply preset params (bidx, expression, colormap_name, rescale override)
  for (const [k, v] of Object.entries(preset.params)) {
    if (k === 'rescale') {
      // rescale in params takes priority over UI rescale for this preset
      params.set('rescale', v);
    } else if (k === 'bidx') {
      // bidx values must be repeated params: ?bidx=4&bidx=3&bidx=2
      params.delete('bidx');
      for (const b of v.split(',')) {
        params.append('bidx', b.trim());
      }
    } else {
      params.set(k, v);
    }
  }

  // Fallback rescale (if not set by preset)
  if (!preset.params['rescale']) {
    params.set('rescale', preset.rescaleOverride || rescale);
  }

  return `${base}?${params.toString()}`;
}

// ─── Component ───────────────────────────────────────────────────────────────

const LoadCogPanel: React.FC<LoadCogPanelProps> = ({onTilesetAdded}) => {
  const [cogUrl, setCogUrl] = useState('');
  const [titilerBaseUrl, setTitilerBaseUrl] = useState(DEFAULT_TITILER_BASE_URL);
  const [rescale, setRescale] = useState(DEFAULT_RESCALE);
  const [selectedPresetId, setSelectedPresetId] = useState('none');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [cogInfo, setCogInfo] = useState<CogInfo | null>(null);

  const selectedPreset = BAND_PRESETS.find(p => p.id === selectedPresetId) ?? BAND_PRESETS[0];

  // Validate COG URL
  const cogUrlValid = cogUrl && validateUrl(cogUrl);
  const titilerUrlValid = titilerBaseUrl && validateUrl(titilerBaseUrl);

  // Auto-select preset based on band count when COG info loads
  useEffect(() => {
    if (!cogInfo) return;
    const count = cogInfo.count ?? (cogInfo.band_metadata?.length || 0);
    if (count === 1 && selectedPresetId === 'none') {
      setSelectedPresetId('single');
    } else if (count >= 8 && selectedPresetId === 'none') {
      // Multi-band satellite: default to RGB
      setSelectedPresetId('rgb');
    } else if (count === 3 && selectedPresetId === 'none') {
      // 3-band: already RGB, keep default
    }
  }, [cogInfo, selectedPresetId]);

  // Sync rescale field with preset override
  useEffect(() => {
    if (selectedPreset.rescaleOverride && selectedPreset.id !== 'none') {
      setRescale(selectedPreset.rescaleOverride);
    }
  }, [selectedPreset]);

  // Fetch COG info when URL changes
  useEffect(() => {
    if (!cogUrlValid || !titilerUrlValid) {
      setCogInfo(null);
      return;
    }

    const fetchCogInfo = async () => {
      setLoading(true);
      setError(null);
      try {
        const infoUrl = `${titilerBaseUrl}/cog/info?url=${encodeURIComponent(cogUrl)}`;
        const response = await fetch(infoUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch COG info: ${response.statusText}`);
        }
        const info = await response.json();
        setCogInfo(info);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch COG info');
        setCogInfo(null);
      } finally {
        setLoading(false);
      }
    };

    const timeoutId = setTimeout(fetchCogInfo, 500);
    return () => clearTimeout(timeoutId);
  }, [cogUrl, titilerBaseUrl, cogUrlValid, titilerUrlValid]);

  const onCogUrlChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setCogUrl(e.target.value);
    setError(null);
    setSelectedPresetId('none'); // reset preset on new URL
  }, []);

  const onTitilerUrlChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setTitilerBaseUrl(e.target.value);
    setError(null);
  }, []);

  const onRescaleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setRescale(e.target.value);
  }, []);

  const onPresetChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedPresetId(e.target.value);
  }, []);

  const onLoadCog = useCallback(() => {
    if (!cogUrlValid) {
      setError('Please enter a valid COG URL');
      return;
    }
    if (!titilerUrlValid) {
      setError('Please enter a valid TiTiler base URL');
      return;
    }

    // Build tile URL with preset params
    const tileUrlTemplate = buildTileUrl(titilerBaseUrl, cogUrl, rescale, selectedPreset);

    // Extract filename from COG URL for the layer name
    const urlParts = cogUrl.split('/');
    const rawFilename = urlParts[urlParts.length - 1] || 'COG Layer';
    const filename = rawFilename.split('?')[0]; // strip query string
    const layerName = `${filename.replace(/\.[^.]+$/, '')}${selectedPreset.id !== 'none' ? ` (${selectedPreset.label.replace(/^[^\s]+ /, '')})` : ''}`;

    // Create minimal STAC-like metadata for the raster tile layer
    const metadata = {
      stac_version: '1.0.0',
      type: 'Feature',
      id: `cog-${Date.now()}`,
      geometry: cogInfo?.bounds
        ? {
            type: 'Polygon',
            coordinates: [
              [
                [cogInfo.bounds[0], cogInfo.bounds[1]],
                [cogInfo.bounds[2], cogInfo.bounds[1]],
                [cogInfo.bounds[2], cogInfo.bounds[3]],
                [cogInfo.bounds[0], cogInfo.bounds[3]],
                [cogInfo.bounds[0], cogInfo.bounds[1]]
              ]
            ]
          }
        : null,
      bbox: cogInfo?.bounds || [-180, -90, 180, 90],
      properties: {
        datetime: new Date().toISOString(),
        title: layerName
      },
      assets: {
        visual: {
          href: cogUrl,
          type: 'image/tiff; application=geotiff; profile=cloud-optimized',
          roles: ['data', 'visual']
        }
      },
      // TiTiler-specific fields
      rasterTileServerUrls: [titilerBaseUrl],
      tileUrlTemplate,
      cogUrl,
      rescale,
      bandPreset: selectedPreset.id,
      bandPresetLabel: selectedPreset.label,
      // COG info
      ...(cogInfo || {}),
      isCog: true,
      metadataUrl: `${titilerBaseUrl}/cog/info?url=${encodeURIComponent(cogUrl)}`
    };

    if (onTilesetAdded) {
      onTilesetAdded(
        {
          name: layerName,
          type: DatasetType.RASTER_TILE,
          metadata
        },
        cogInfo || undefined
      );
    }
  }, [cogUrl, titilerBaseUrl, rescale, selectedPreset, cogUrlValid, titilerUrlValid, cogInfo, onTilesetAdded]);

  const canSubmit = cogUrlValid && titilerUrlValid && !loading;
  const bandCount = cogInfo?.count ?? cogInfo?.band_metadata?.length ?? null;

  return (
    <div>
      <InputForm>
        <StyledDescription>
          Load Cloud Optimized GeoTIFF (COG) imagery via TiTiler tile server.
        </StyledDescription>

        <StyledInputLabel>COG URL (required)</StyledInputLabel>
        <StyledInput
          onChange={onCogUrlChange}
          type="text"
          placeholder="https://example.com/my-image.tif"
          value={cogUrl}
          error={cogUrl && !cogUrlValid ? 'true' : undefined}
        />
        <ExampleUrl>
          Example: https://sentinel-cogs.s3.us-west-2.amazonaws.com/sentinel-s2-l2a-cogs/...
        </ExampleUrl>

        {/* Band Preset Selector */}
        <Divider />
        <StyledInputLabel style={{marginTop: 0}}>
          Band Preset
          {bandCount !== null && (
            <span style={{marginLeft: 8, fontWeight: 'normal', opacity: 0.7}}>
              ({bandCount} band{bandCount !== 1 ? 's' : ''} detected)
            </span>
          )}
        </StyledInputLabel>
        <StyledSelect value={selectedPresetId} onChange={onPresetChange}>
          {BAND_PRESETS.map(preset => (
            <option key={preset.id} value={preset.id}>
              {preset.label}
            </option>
          ))}
        </StyledSelect>
        <PresetDescription>{selectedPreset.description}</PresetDescription>

        <Divider />

        <StyledInputLabel>TiTiler Base URL</StyledInputLabel>
        <StyledInput
          onChange={onTitilerUrlChange}
          type="text"
          placeholder={DEFAULT_TITILER_BASE_URL}
          value={titilerBaseUrl}
          error={titilerBaseUrl && !titilerUrlValid ? 'true' : undefined}
        />

        <StyledInputLabel>Rescale</StyledInputLabel>
        <StyledInput
          onChange={onRescaleChange}
          type="text"
          placeholder={DEFAULT_RESCALE}
          value={rescale}
        />
        <ExampleUrl>
          Format: min,max — adjusts pixel value range for visualization
          {selectedPreset.id === 'ndvi' && ' (NDVI range is always −1 to 1)'}
        </ExampleUrl>

        <StyledFromGroup>
          <Button
            type="submit"
            cta
            size="small"
            onClick={onLoadCog}
            disabled={!canSubmit}
          >
            {loading ? 'Loading...' : 'Load COG'}
          </Button>
        </StyledFromGroup>

        {error && <StyledError>{error}</StyledError>}
        {cogInfo && !error && (
          <StyledSuccess>
            ✅ COG validated: {cogInfo.width}×{cogInfo.height}px, {bandCount} band
            {bandCount !== 1 ? 's' : ''}, zoom {cogInfo.minzoom}–{cogInfo.maxzoom}
          </StyledSuccess>
        )}
      </InputForm>
    </div>
  );
};

export default LoadCogPanel;
