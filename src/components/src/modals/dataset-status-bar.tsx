// SPDX-License-Identifier: MIT
// Copyright contributors to the kepler.gl project

import React from 'react';
import styled from 'styled-components';

// ─── Styled Components ───────────────────────────────────────────────────────

const StatusBarRoot = styled.div`
  height: 36px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 6px;
  margin-bottom: 16px;
  padding: 0 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
`;

const MutedText = styled.span`
  color: rgba(255, 255, 255, 0.35);
  font-style: italic;
`;

const LoadedText = styled.span`
  color: rgba(255, 255, 255, 0.7);
  font-weight: 500;
`;

interface ColorDotProps {
  color: string;
}

const ColorDot = styled.span<ColorDotProps>`
  color: ${props => props.color};
  font-size: 10px;
  line-height: 1;
`;

// ─── Component ───────────────────────────────────────────────────────────────

const DEFAULT_COLORS = [
  '#00c4b0',
  '#e68a00',
  '#c06ddd',
  '#e65c5c',
  '#4bc8f5',
  '#a5df57',
  '#f5c24e',
  '#e07ad9'
];

export interface DatasetStatusBarProps {
  datasetCount: number;
  colors?: string[];
}

export const DatasetStatusBar: React.FC<DatasetStatusBarProps> = ({
  datasetCount,
  colors = DEFAULT_COLORS
}) => {
  if (datasetCount === 0) {
    return (
      <StatusBarRoot>
        <MutedText>No data loaded yet — add data below</MutedText>
      </StatusBarRoot>
    );
  }

  const dots = Array.from({length: Math.min(datasetCount, colors.length)}, (_, i) => (
    <ColorDot key={i} color={colors[i % colors.length]}>
      ●
    </ColorDot>
  ));

  return (
    <StatusBarRoot>
      {dots}
      <LoadedText>
        {datasetCount} dataset{datasetCount !== 1 ? 's' : ''} loaded
      </LoadedText>
    </StatusBarRoot>
  );
};

export default DatasetStatusBar;
