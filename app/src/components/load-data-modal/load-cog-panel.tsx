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

const StyledInput = styled.input`
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

const ExampleUrl = styled.div`
  font-size: 11px;
  color: ${props => props.theme.subtextColorLT};
  margin-top: 4px;
  word-break: break-all;
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
}

// ─── Component ───────────────────────────────────────────────────────────────

const LoadCogPanel: React.FC<LoadCogPanelProps> = ({onTilesetAdded}) => {
  const [cogUrl, setCogUrl] = useState('');
  const [titilerBaseUrl, setTitilerBaseUrl] = useState(DEFAULT_TITILER_BASE_URL);
  const [rescale, setRescale] = useState(DEFAULT_RESCALE);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [cogInfo, setCogInfo] = useState<CogInfo | null>(null);

  // Validate COG URL
  const cogUrlValid = cogUrl && validateUrl(cogUrl);
  const titilerUrlValid = titilerBaseUrl && validateUrl(titilerBaseUrl);

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
  }, []);

  const onTitilerUrlChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setTitilerBaseUrl(e.target.value);
    setError(null);
  }, []);

  const onRescaleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setRescale(e.target.value);
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

    // Build tile URL template
    const tileUrlTemplate = `${titilerBaseUrl}/cog/tiles/WebMercatorQuad/{z}/{x}/{y}.png?url=${encodeURIComponent(cogUrl)}&rescale=${rescale}`;

    // Extract filename from COG URL for the layer name
    const urlParts = cogUrl.split('/');
    const filename = urlParts[urlParts.length - 1] || 'COG Layer';
    const layerName = filename.replace(/\.[^.]+$/, '');

    // Create minimal STAC-like metadata for the raster tile layer
    const metadata = {
      // STAC-like fields for compatibility with raster-tile-layer
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
      // COG info
      ...(cogInfo || {}),
      // Mark as COG for potential special handling
      isCog: true,
      metadataUrl: `${titilerBaseUrl}/cog/info?url=${encodeURIComponent(cogUrl)}`
    };

    // Call onTilesetAdded to add the dataset
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
  }, [cogUrl, titilerBaseUrl, rescale, cogUrlValid, titilerUrlValid, cogInfo, onTilesetAdded]);

  const canSubmit = cogUrlValid && titilerUrlValid && !loading;

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
          error={cogUrl && !cogUrlValid}
        />
        <ExampleUrl>
          Example: https://sentinel-cogs.s3.us-west-2.amazonaws.com/sentinel-s2-l2a-cogs/...
        </ExampleUrl>

        <StyledInputLabel style={{marginTop: 16}}>TiTiler Base URL (optional)</StyledInputLabel>
        <StyledInput
          onChange={onTitilerUrlChange}
          type="text"
          placeholder={DEFAULT_TITILER_BASE_URL}
          value={titilerBaseUrl}
          error={titilerBaseUrl && !titilerUrlValid}
        />

        <StyledInputLabel style={{marginTop: 16}}>Rescale (optional)</StyledInputLabel>
        <StyledInput
          onChange={onRescaleChange}
          type="text"
          placeholder={DEFAULT_RESCALE}
          value={rescale}
        />
        <ExampleUrl>Format: min,max — adjusts pixel value range for visualization</ExampleUrl>

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
            COG validated: {cogInfo.width}x{cogInfo.height}px, zoom {cogInfo.minzoom}-
            {cogInfo.maxzoom}
          </StyledSuccess>
        )}
      </InputForm>
    </div>
  );
};

export default LoadCogPanel;
