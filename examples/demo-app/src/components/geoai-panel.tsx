// GeoAI Panel — CustomPanelsFactory replacement for PalmView
// Injects a GeoAI tab into Kepler's side panel
import React from 'react';
import styled from 'styled-components';

// Styled components for GeoAI panel sections
const StyledGeoAIPanel = styled.div`
  padding: 16px;
  color: ${(props: any) => props.theme?.textColor || '#A0A7B4'};
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const StyledSection = styled.div`
  background: ${(props: any) => props.theme?.panelBackground || 'rgba(0,0,0,0.2)'};
  border-radius: 4px;
  padding: 12px;
`;

const StyledTitle = styled.h3`
  color: ${(props: any) => props.theme?.subtextColorActive || '#D3D8E0'};
  font-size: 14px;
  margin: 0 0 8px 0;
`;

const StyledPlaceholder = styled.p`
  color: ${(props: any) => props.theme?.subtextColor || '#6A7485'};
  font-size: 12px;
  margin: 0;
`;

// GeoAI panel content component (rendered via panels[].component)
const GeoAiPanelContent = () => {
  return (
    <StyledGeoAIPanel>
      <StyledSection>
        <StyledTitle>📍 AOI Selection</StyledTitle>
        <StyledPlaceholder>Draw area of interest on map...</StyledPlaceholder>
      </StyledSection>

      <StyledSection>
        <StyledTitle>🧠 Task Cards</StyledTitle>
        <StyledPlaceholder>Palm Detection · Change Detection · Land Use · Custom</StyledPlaceholder>
      </StyledSection>

      <StyledSection>
        <StyledTitle>⚙️ Model Config</StyledTitle>
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

// Brain icon matching Kepler's icon style (stroke-based, 24x24)
const BrainIcon = (props: any) => (
  <svg
    viewBox="0 0 24 24"
    width={props.height || '18px'}
    height={props.height || '18px'}
    fill="none"
    stroke="currentColor"
  >
    <circle cx="12" cy="10" r="7" strokeWidth="1.5" />
    <path d="M12 3v14M8 7q4 3 8 0M8 13q4-3 8 0" strokeWidth="1" />
    <path d="M12 17v4" strokeWidth="1.5" />
  </svg>
);

// Factory replacement for CustomPanelsFactory
function GeoAiCustomPanelsFactory() {
  const CustomPanels: any = () => null;

  CustomPanels.panels = [
    {
      id: 'geoai',
      label: 'GeoAI',
      iconComponent: BrainIcon,
      component: GeoAiPanelContent
    }
  ];

  CustomPanels.getProps = () => ({});

  return CustomPanels;
}

GeoAiCustomPanelsFactory.deps = [];

export default GeoAiCustomPanelsFactory;
