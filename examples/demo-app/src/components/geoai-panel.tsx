// GeoAI Panel — CustomPanelsFactory replacement for PalmView
// V2: Task Cards by function category, merged history, AOI shortcuts
import React, {useState} from 'react';
import styled from 'styled-components';

// ─── Styled Components ───────────────────────────────────────

const StyledGeoAIPanel = styled.div`
  padding: 12px;
  color: ${(props: any) => props.theme?.textColor || '#A0A7B4'};
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow-y: auto;
  ${(props: any) => props.theme?.sidePanelScrollBar || ''}
`;

const StyledSection = styled.div`
  background: ${(props: any) => props.theme?.panelBackgroundHover || 'rgba(255,255,255,0.06)'};
  border-radius: 4px;
  padding: 12px;
`;

const StyledSectionTitle = styled.div`
  color: ${(props: any) => props.theme?.subtextColorActive || '#D3D8E0'};
  font-size: 11px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 8px;
`;

const StyledButton = styled.button<{active?: boolean}>`
  background: ${(props: any) =>
    props.active
      ? props.theme?.activeColor || '#6CBFB7'
      : props.theme?.panelBackground || 'rgba(255,255,255,0.06)'};
  color: ${(props: any) =>
    props.active
      ? '#fff'
      : props.theme?.textColor || '#A0A7B4'};
  border: 1px solid ${(props: any) =>
    props.active
      ? 'transparent'
      : props.theme?.borderColor || 'rgba(255,255,255,0.1)'};
  border-radius: 4px;
  padding: 6px 10px;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    background: ${(props: any) => props.theme?.activeColor || '#6CBFB7'};
    color: #fff;
  }
`;

const ButtonRow = styled.div`
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
`;

const StyledInput = styled.input`
  width: 100%;
  background: ${(props: any) => props.theme?.panelBackground || 'rgba(0,0,0,0.2)'};
  color: ${(props: any) => props.theme?.textColor || '#A0A7B4'};
  border: 1px solid ${(props: any) => props.theme?.borderColor || 'rgba(255,255,255,0.1)'};
  border-radius: 4px;
  padding: 8px 10px;
  font-size: 12px;
  outline: none;
  margin-top: 6px;

  &::placeholder {
    color: ${(props: any) => props.theme?.subtextColor || '#6A7485'};
  }

  &:focus {
    border-color: ${(props: any) => props.theme?.activeColor || '#6CBFB7'};
  }
`;

const ChipRow = styled.div`
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  margin-top: 6px;
`;

const Chip = styled.button<{selected?: boolean}>`
  background: ${(props: any) =>
    props.selected
      ? props.theme?.activeColor || '#6CBFB7'
      : 'transparent'};
  color: ${(props: any) =>
    props.selected ? '#fff' : props.theme?.textColor || '#A0A7B4'};
  border: 1px solid ${(props: any) => props.theme?.borderColor || 'rgba(255,255,255,0.15)'};
  border-radius: 12px;
  padding: 3px 10px;
  font-size: 10px;
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    border-color: ${(props: any) => props.theme?.activeColor || '#6CBFB7'};
  }
`;

const CollapsibleHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
`;

const Arrow = styled.span<{open?: boolean}>`
  font-size: 10px;
  transform: rotate(${(props: any) => (props.open ? 90 : 0)}deg);
  transition: transform 0.15s;
`;

const HistoryItem = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 6px 0;
  border-left: 2px solid ${(props: any) => props.theme?.borderColor || 'rgba(255,255,255,0.1)'};
  padding-left: 10px;
  font-size: 11px;
`;

const HistoryDot = styled.div`
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: ${(props: any) => props.theme?.activeColor || '#6CBFB7'};
  margin-top: 4px;
  flex-shrink: 0;
`;

const RunButton = styled.button`
  width: 100%;
  background: ${(props: any) => props.theme?.activeColor || '#6CBFB7'};
  color: #fff;
  border: none;
  border-radius: 4px;
  padding: 10px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s;

  &:hover {
    opacity: 0.85;
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
`;

const EmptyState = styled.p`
  color: ${(props: any) => props.theme?.subtextColor || '#6A7485'};
  font-size: 11px;
  margin: 0;
  font-style: italic;
`;

// ─── Constants ───────────────────────────────────────────────

const TASK_CATEGORIES = [
  {id: 'detection', label: 'Detection', icon: '🔍'},
  {id: 'segmentation', label: 'Segmentation', icon: '✂️'},
  {id: 'classification', label: 'Classification', icon: '🏷️'},
  {id: 'change', label: 'Change Detection', icon: '🔄'}
] as const;

const QUICK_TARGETS: Record<string, Array<{id: string; label: string}>> = {
  detection: [
    {id: 'palm', label: '🌴 Palm'},
    {id: 'tree', label: '🌳 Tree'},
    {id: 'building', label: '🏠 Building'},
    {id: 'vehicle', label: '🚗 Vehicle'}
  ],
  segmentation: [
    {id: 'vegetation', label: '🌿 Vegetation'},
    {id: 'water', label: '💧 Water'},
    {id: 'urban', label: '🏙️ Urban'},
    {id: 'agriculture', label: '🌾 Agriculture'}
  ],
  classification: [
    {id: 'lulc5', label: 'LULC 5-class'},
    {id: 'lulc10', label: 'LULC 10-class'},
    {id: 'custom', label: '✏️ Custom'}
  ],
  change: [
    {id: 'deforestation', label: '🌲→🏜️ Deforestation'},
    {id: 'urbanization', label: '🌿→🏙️ Urbanization'},
    {id: 'custom', label: '✏️ Custom'}
  ]
};

// ─── Panel Content Component ─────────────────────────────────

const GeoAiPanelContent = () => {
  const [aoiMode, setAoiMode] = useState<string | null>(null);
  const [taskCategory, setTaskCategory] = useState<string | null>(null);
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
  const [customTarget, setCustomTarget] = useState('');
  const [modelConfigOpen, setModelConfigOpen] = useState(false);

  return (
    <StyledGeoAIPanel>
      {/* 1. AOI Selection */}
      <StyledSection>
        <StyledSectionTitle>📍 Area of Interest</StyledSectionTitle>
        <ButtonRow>
          <StyledButton
            active={aoiMode === 'rectangle'}
            onClick={() => setAoiMode(aoiMode === 'rectangle' ? null : 'rectangle')}
          >
            ▭ Rectangle
          </StyledButton>
          <StyledButton
            active={aoiMode === 'polygon'}
            onClick={() => setAoiMode(aoiMode === 'polygon' ? null : 'polygon')}
          >
            ⬠ Polygon
          </StyledButton>
        </ButtonRow>
        {aoiMode && (
          <EmptyState style={{marginTop: 6}}>
            Draw {aoiMode} on map to select area...
          </EmptyState>
        )}
      </StyledSection>

      {/* 2. Task Selection — by function category */}
      <StyledSection>
        <StyledSectionTitle>🧠 Analysis Task</StyledSectionTitle>
        <ButtonRow>
          {TASK_CATEGORIES.map(cat => (
            <StyledButton
              key={cat.id}
              active={taskCategory === cat.id}
              onClick={() => {
                setTaskCategory(taskCategory === cat.id ? null : cat.id);
                setSelectedTarget(null);
                setCustomTarget('');
              }}
            >
              {cat.icon} {cat.label}
            </StyledButton>
          ))}
        </ButtonRow>

        {/* Target selection */}
        {taskCategory && QUICK_TARGETS[taskCategory] && (
          <>
            <StyledInput
              placeholder={
                taskCategory === 'detection'
                  ? 'What to detect?'
                  : taskCategory === 'segmentation'
                  ? 'What to segment?'
                  : taskCategory === 'classification'
                  ? 'Classification scheme?'
                  : 'Describe change to detect...'
              }
              value={customTarget}
              onChange={e => {
                setCustomTarget(e.target.value);
                setSelectedTarget(null);
              }}
            />
            <ChipRow>
              {QUICK_TARGETS[taskCategory].map(t => (
                <Chip
                  key={t.id}
                  selected={selectedTarget === t.id}
                  onClick={() => {
                    setSelectedTarget(selectedTarget === t.id ? null : t.id);
                    setCustomTarget('');
                  }}
                >
                  {t.label}
                </Chip>
              ))}
            </ChipRow>
          </>
        )}
      </StyledSection>

      {/* 3. Model Config — collapsible */}
      <StyledSection>
        <CollapsibleHeader onClick={() => setModelConfigOpen(!modelConfigOpen)}>
          <StyledSectionTitle style={{margin: 0}}>⚙️ Model Config</StyledSectionTitle>
          <Arrow open={modelConfigOpen}>▶</Arrow>
        </CollapsibleHeader>
        {modelConfigOpen && (
          <div style={{marginTop: 8}}>
            <EmptyState>Auto-select best model based on task</EmptyState>
          </div>
        )}
      </StyledSection>

      {/* Run Button */}
      <RunButton disabled={!taskCategory || (!selectedTarget && !customTarget)}>
        ▶ Run Analysis
      </RunButton>

      {/* 5. Task History — commit-log style */}
      <StyledSection>
        <StyledSectionTitle>📋 Task History</StyledSectionTitle>
        <EmptyState>No analysis tasks yet. Run your first analysis above.</EmptyState>
      </StyledSection>
    </StyledGeoAIPanel>
  );
};

// ─── Brain Icon ──────────────────────────────────────────────

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

// ─── Factory ─────────────────────────────────────────────────

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
