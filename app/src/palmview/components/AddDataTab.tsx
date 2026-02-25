// SPDX-License-Identifier: MIT
// Copyright ©Synga — PalmView Unified Data Entry Tab (T4)
// Provides a single "Add Data" entry point in the left side-panel.

import React, {useMemo, useState} from 'react';
import styled from 'styled-components';
import {useDispatch} from 'react-redux';
import {loadFiles} from '@kepler.gl/actions';
import ShapefileUploader from './ShapefileUploader';

// ─── Styled Components ───────────────────────────────────────────────────────

const PanelWrap = styled.div`
  padding: 12px;
  color: ${(p: any) => p.theme?.textColor || '#A0A7B4'};
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow-y: auto;
  ${(p: any) => p.theme?.sidePanelScrollBar || ''}
`;

const PanelTitle = styled.div`
  color: ${(p: any) => p.theme?.subtextColorActive || '#D3D8E0'};
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding-bottom: 8px;
  border-bottom: 1px solid ${(p: any) => p.theme?.borderColor || 'rgba(255,255,255,0.08)'};
  margin-bottom: 4px;
`;

const Card = styled.div<{$expanded?: boolean}>`
  background: ${(p: any) =>
    p.$expanded
      ? p.theme?.panelBackground || 'rgba(255,255,255,0.07)'
      : p.theme?.panelBackgroundHover || 'rgba(255,255,255,0.04)'};
  border: 1px solid
    ${(p: any) =>
      p.$expanded
        ? p.theme?.activeColor || '#1FBF6E'
        : p.theme?.borderColor || 'rgba(255,255,255,0.08)'};
  border-radius: 6px;
  padding: 10px 12px;
  cursor: pointer;
  transition: all 0.15s;
  &:hover {
    background: ${(p: any) => p.theme?.panelBackground || 'rgba(255,255,255,0.07)'};
    border-color: ${(p: any) => p.theme?.activeColor || '#1FBF6E'};
  }
`;

const CardHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
`;

const IconWrap = styled.span`
  font-size: 18px;
  line-height: 1;
  flex-shrink: 0;
`;

const CardMeta = styled.div`
  flex: 1;
  min-width: 0;
`;

const CardTitle = styled.div`
  color: ${(p: any) => p.theme?.subtextColorActive || '#D3D8E0'};
  font-size: 11.5px;
  font-weight: 600;
`;

const CardDesc = styled.div`
  color: ${(p: any) => p.theme?.subtextColor || '#6A7485'};
  font-size: 10px;
  margin-top: 2px;
`;

const Chevron = styled.span<{$open?: boolean}>`
  color: ${(p: any) => p.theme?.subtextColor || '#6A7485'};
  font-size: 10px;
  transform: ${p => (p.$open ? 'rotate(90deg)' : 'rotate(0deg)')};
  transition: transform 0.15s;
  flex-shrink: 0;
`;

const CardBody = styled.div`
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
`;

const TagRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 8px;
`;

const Tag = styled.span`
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 3px;
  padding: 2px 7px;
  font-size: 9px;
  color: ${(p: any) => p.theme?.subtextColor || '#6A7485'};
`;

const Notice = styled.div`
  color: ${(p: any) => p.theme?.subtextColor || '#6A7485'};
  font-size: 10.5px;
  line-height: 1.5;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 4px;
  padding: 8px;
`;

const ComingSoon = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: rgba(255, 200, 0, 0.08);
  border: 1px solid rgba(255, 200, 0, 0.2);
  border-radius: 3px;
  padding: 3px 8px;
  font-size: 10px;
  color: #c8a000;
  margin-top: 6px;
`;

// ─── Data for each source entry ───────────────────────────────────────────────

interface DataSource {
  id: string;
  icon: string;
  title: string;
  desc: string;
  tags: string[];
  body: React.ReactNode;
}

// ─── Component ───────────────────────────────────────────────────────────────

const AddDataTabContent: React.FC = () => {
  const [expanded, setExpanded] = useState<string | null>(null);
  const dispatch = useDispatch();

  const toggle = (id: string) => setExpanded(prev => (prev === id ? null : id));

  const DATA_SOURCES: DataSource[] = useMemo(
    () => [
      {
        id: 'upload',
        icon: '📁',
        title: 'Upload Local File',
        desc: 'Drag & drop or click to upload local geospatial files',
        tags: ['GeoJSON', 'Shapefile', 'GeoTIFF', 'CSV', 'LAZ'],
        body: (
          <ShapefileUploader
            onGeoJSON={(geojson, name) => {
              const geoJsonFile = new File(
                [JSON.stringify(geojson)],
                name + '.geojson',
                {type: 'application/json'}
              );
              dispatch(loadFiles([geoJsonFile]));
            }}
          />
        )
      },
      {
        id: 'cloud',
        icon: '☁️',
        title: 'Cloud Assets',
        desc: 'Connect to internal or external cloud storage and databases',
        tags: ['MinIO', 'PostGIS', 'S3 Bucket'],
        body: (
          <>
            <Notice>
              Connect to Synga internal storage (MinIO), PostGIS database, or external S3 buckets.
            </Notice>
            <ComingSoon>🚧 Coming in Sprint 3</ComingSoon>
          </>
        )
      },
      {
        id: 'satellite',
        icon: '🛰️',
        title: 'Satellite & Remote Sensing',
        desc: 'Search satellite imagery from STAC catalogs or Google Earth Engine',
        tags: ['STAC Catalog', 'GEE', 'Copernicus', 'Planetary Computer', 'Earth Search'],
        body: (
          <Notice>
            ℹ️ Open the <strong>Data</strong> tab (satellite icon) to search and load STAC/GEE
            imagery in the current map view.
          </Notice>
        )
      },
      {
        id: 'tiles',
        icon: '🔗',
        title: 'Tile Services',
        desc: 'Connect to vector or raster tile services via URL',
        tags: ['Vector Tiles (MVT)', 'Raster Tiles (XYZ/WMTS)', '3D Tiles', 'PMTiles'],
        body: (
          <>
            <Notice>
              Enter a tile service URL to stream vector or raster tiles directly onto the map.
              Supports XYZ, WMTS, PMTiles and 3D Tiles formats.
            </Notice>
            <ComingSoon>🚧 Coming in Sprint 3</ComingSoon>
          </>
        )
      }
    ],
    [dispatch]
  );

  return (
    <PanelWrap>
      <PanelTitle>Add Data to Map</PanelTitle>

      {DATA_SOURCES.map(src => {
        const isOpen = expanded === src.id;
        return (
          <Card key={src.id} $expanded={isOpen} onClick={() => toggle(src.id)}>
            <CardHeader>
              <IconWrap>{src.icon}</IconWrap>
              <CardMeta>
                <CardTitle>{src.title}</CardTitle>
                <CardDesc>{src.desc}</CardDesc>
              </CardMeta>
              <Chevron $open={isOpen}>▶</Chevron>
            </CardHeader>

            <TagRow>
              {src.tags.map(t => (
                <Tag key={t}>{t}</Tag>
              ))}
            </TagRow>

            {isOpen && <CardBody>{src.body}</CardBody>}
          </Card>
        );
      })}
    </PanelWrap>
  );
};

// ─── Panel Icon ───────────────────────────────────────────────────────────────

const AddDataIcon = (props: {height?: string | number}) => (
  <svg
    viewBox="0 0 24 24"
    width={props.height || '18px'}
    height={props.height || '18px'}
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="9" />
    <line x1="12" y1="8" x2="12" y2="16" />
    <line x1="8" y1="12" x2="16" y2="12" />
  </svg>
);

// ─── Factory ─────────────────────────────────────────────────────────────────

function AddDataTabFactory() {
  const AddDataTab: any = () => null;

  AddDataTab.panels = [
    {
      id: 'add-data',
      label: 'Add Data',
      iconComponent: AddDataIcon,
      component: AddDataTabContent
    }
  ];

  AddDataTab.getProps = () => ({});

  return AddDataTab;
}

AddDataTabFactory.deps = [];

export default AddDataTabFactory;
