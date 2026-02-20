// GeoAI Panel — POC for CustomPanelsFactory injection
import React from 'react';
import styled from 'styled-components';
import {Icons} from '@kepler.gl/components';

const StyledGeoAIPanel = styled.div`
  padding: 16px;
  color: ${props => props.theme.textColor};
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const StyledSection = styled.div`
  background: ${props => props.theme.panelBackground};
  border-radius: 4px;
  padding: 12px;
`;

const StyledTitle = styled.h3`
  color: ${props => props.theme.subtextColorActive};
  font-size: 14px;
  margin: 0 0 8px 0;
`;

const StyledPlaceholder = styled.p`
  color: ${props => props.theme.subtextColor};
  font-size: 12px;
  margin: 0;
`;

function GeoAIPanelFactory() {
  const GeoAIPanel = (props: any) => {
    if (props.activeSidePanel !== 'geoai') {
      return null;
    }

    return (
      <StyledGeoAIPanel>
        <StyledSection>
          <StyledTitle>📍 AOI Selection</StyledTitle>
          <StyledPlaceholder>Draw area of interest on map...</StyledPlaceholder>
        </StyledSection>

        <StyledSection>
          <StyledTitle>💬 Analysis Input</StyledTitle>
          <StyledPlaceholder>Describe what you want to analyze...</StyledPlaceholder>
        </StyledSection>

        <StyledSection>
          <StyledTitle>🧠 Model Selection</StyledTitle>
          <StyledPlaceholder>SAM2 · YOLO Palm · Prithvi-EO</StyledPlaceholder>
        </StyledSection>

        <StyledSection>
          <StyledTitle>📊 Results</StyledTitle>
          <StyledPlaceholder>No analysis results yet</StyledPlaceholder>
        </StyledSection>

        <StyledSection>
          <StyledTitle>📋 Task History</StyledTitle>
          <StyledPlaceholder>No previous tasks</StyledPlaceholder>
        </StyledSection>
      </StyledGeoAIPanel>
    );
  };

  GeoAIPanel.panels = [
    {
      id: 'geoai',
      label: 'GeoAI',
      iconComponent: Icons.Rocket
    }
  ];

  GeoAIPanel.getProps = (sidePanelProps: any) => ({
    layers: sidePanelProps.layers,
    datasets: sidePanelProps.datasets
  });

  return GeoAIPanel;
}

export default GeoAIPanelFactory;
