// SPDX-License-Identifier: MIT
// Copyright contributors to the kepler.gl project

import React, {useCallback} from 'react';
import styled, {DefaultTheme} from 'styled-components';

// ─── Styled Components ───────────────────────────────────────────────────────

const PanelRoot = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 8px 0;
`;

const CardGrid = styled.div`
  display: flex;
  flex-direction: row;
  gap: 12px;
  flex-wrap: wrap;
`;

const DemoCard = styled.div`
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 16px;
  flex: 1;
  min-width: 200px;
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const CardTitle = styled.div`
  font-size: 13px;
  font-weight: 600;
  color: ${props => props.theme.textColorHl || '#fff'};
`;

const CardDesc = styled.div`
  font-size: 12px;
  color: ${props => props.theme.subtextColor || 'rgba(255,255,255,0.5)'};
  line-height: 1.4;
  flex: 1;
`;

const LoadDemoButton = styled.button<{theme: DefaultTheme}>`
  background: ${props =>
    (props.theme as DefaultTheme & {primaryBtnBgd?: string}).primaryBtnBgd || '#00a0a0'};
  color: #fff;
  border: none;
  border-radius: 4px;
  padding: 7px 14px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  align-self: flex-start;
  transition: opacity 0.15s;

  &:hover {
    opacity: 0.85;
  }

  &:active {
    opacity: 0.7;
  }
`;

// ─── Demo Data ────────────────────────────────────────────────────────────────

const MALAYSIA_DEMO = {
  type: 'FeatureCollection' as const,
  features: [
    {
      type: 'Feature' as const,
      geometry: {type: 'Point' as const, coordinates: [101.5, 3.1]},
      properties: {name: 'Selangor Palm Estate A', type: 'oil_palm'}
    },
    {
      type: 'Feature' as const,
      geometry: {type: 'Point' as const, coordinates: [101.7, 3.2]},
      properties: {name: 'Kuala Langat Plantation', type: 'oil_palm'}
    },
    {
      type: 'Feature' as const,
      geometry: {type: 'Point' as const, coordinates: [101.9, 3.3]},
      properties: {name: 'Semenyih Oil Palm', type: 'oil_palm'}
    },
    {
      type: 'Feature' as const,
      geometry: {type: 'Point' as const, coordinates: [101.6, 3.15]},
      properties: {name: 'Broga Estate', type: 'oil_palm'}
    }
  ]
};

const INDONESIA_DEMO = {
  type: 'FeatureCollection' as const,
  features: [
    {
      type: 'Feature' as const,
      geometry: {
        type: 'Polygon' as const,
        coordinates: [
          [
            [112.8, -0.8],
            [113.2, -0.8],
            [113.2, -1.1],
            [112.8, -1.1],
            [112.8, -0.8]
          ]
        ]
      },
      properties: {name: 'Central Kalimantan Concession A', type: 'concession'}
    },
    {
      type: 'Feature' as const,
      geometry: {
        type: 'Polygon' as const,
        coordinates: [
          [
            [113.2, -0.9],
            [113.6, -0.9],
            [113.6, -1.2],
            [113.2, -1.2],
            [113.2, -0.9]
          ]
        ]
      },
      properties: {name: 'East Kalimantan Concession B', type: 'concession'}
    }
  ]
};

// ─── Component ───────────────────────────────────────────────────────────────

interface SampleDataPanelProps {
  onFileUpload: (files: File[]) => void;
  theme?: DefaultTheme & {primaryBtnBgd?: string};
}

function loadGeoJson(
  data: typeof MALAYSIA_DEMO | typeof INDONESIA_DEMO,
  filename: string,
  onFileUpload: (files: File[]) => void
): void {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], {type: 'application/geo+json'});
  const file = new File([blob], filename, {type: 'application/geo+json'});
  onFileUpload([file]);
}

export function SampleDataPanelFactory() {
  const SampleDataPanel: React.FC<SampleDataPanelProps> = ({onFileUpload}) => {
    const loadMalaysia = useCallback(() => {
      loadGeoJson(MALAYSIA_DEMO, 'malaysia-oil-palm-demo.geojson', onFileUpload);
    }, [onFileUpload]);

    const loadIndonesia = useCallback(() => {
      loadGeoJson(INDONESIA_DEMO, 'indonesia-concessions-demo.geojson', onFileUpload);
    }, [onFileUpload]);

    return (
      <PanelRoot>
        <CardGrid>
          <DemoCard>
            <CardTitle>🌴 Malaysia Oil Palm Demo</CardTitle>
            <CardDesc>
              4 GeoJSON Point features near Kuala Lumpur representing oil palm estate locations in
              Selangor.
            </CardDesc>
            <LoadDemoButton onClick={loadMalaysia}>Load Demo</LoadDemoButton>
          </DemoCard>
          <DemoCard>
            <CardTitle>🗺️ Indonesia Concessions Demo</CardTitle>
            <CardDesc>
              2 GeoJSON Polygon features in Central/East Kalimantan representing palm oil
              concession boundaries.
            </CardDesc>
            <LoadDemoButton onClick={loadIndonesia}>Load Demo</LoadDemoButton>
          </DemoCard>
        </CardGrid>
      </PanelRoot>
    );
  };

  return SampleDataPanel;
}

SampleDataPanelFactory.deps = [];

export default SampleDataPanelFactory;
