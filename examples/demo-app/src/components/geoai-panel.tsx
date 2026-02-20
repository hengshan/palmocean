// GeoAI Panel — CustomPanelsFactory replacement for PalmView
// V3: API integration with backend inference jobs
// Theme: Synga brand colors (#1FBF6E accent, #0A3D2E primary, #0D1117 dark)
import React, {useState, useEffect, useCallback} from 'react';
import styled from 'styled-components';
import {
  submitInferenceJob,
  listInferenceJobs,
  type InferenceJobDetail,
  type InferenceJobSubmit,
} from '../utils/api';

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

// Default project ID (will be replaced with real project selection)
const DEFAULT_PROJECT_ID = '00000000-0000-0000-0000-000000000000';

const GeoAiPanelContent = () => {
  const [taskCategory, setTaskCategory] = useState<string | null>(null);
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
  const [customTarget, setCustomTarget] = useState('');
  const [modelConfigOpen, setModelConfigOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [jobHistory, setJobHistory] = useState<InferenceJobDetail[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Load job history on mount
  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const jobs = await listInferenceJobs();
      setJobHistory(jobs);
    } catch (err) {
      console.error('[GeoAI] Failed to load history:', err);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const handleRunAnalysis = useCallback(async () => {
    if (!taskCategory || (!selectedTarget && !customTarget)) return;

    setIsSubmitting(true);
    setSubmitError(null);

    const target = selectedTarget || customTarget;
    const job: InferenceJobSubmit = {
      project_id: DEFAULT_PROJECT_ID,
      task_type: `${taskCategory}:${target}`,
      aoi: {
        type: 'Polygon',
        coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]  // placeholder AOI
      },
      params: {target},
    };

    try {
      const result = await submitInferenceJob(job);
      console.log('[GeoAI] Job submitted:', result);
      // Refresh history
      await loadHistory();
      // Reset form
      setTaskCategory(null);
      setSelectedTarget(null);
      setCustomTarget('');
    } catch (err: any) {
      console.error('[GeoAI] Submit failed:', err);
      setSubmitError(err.message || 'Failed to submit job');
    } finally {
      setIsSubmitting(false);
    }
  }, [taskCategory, selectedTarget, customTarget, loadHistory]);

  return (
    <StyledGeoAIPanel>
      {/* 1. Task Selection — by function category */}
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
      <RunButton
        disabled={!taskCategory || (!selectedTarget && !customTarget) || isSubmitting}
        onClick={handleRunAnalysis}
      >
        {isSubmitting ? '⏳ Submitting...' : '▶ Run Analysis'}
      </RunButton>

      {submitError && (
        <EmptyState style={{color: '#F9042C', fontStyle: 'normal'}}>
          ⚠️ {submitError}
        </EmptyState>
      )}

      {/* Task History — commit-log style */}
      <StyledSection>
        <CollapsibleHeader onClick={loadHistory}>
          <StyledSectionTitle style={{margin: 0}}>
            📋 Task History {jobHistory.length > 0 ? `(${jobHistory.length})` : ''}
          </StyledSectionTitle>
          <EmptyState style={{margin: 0, cursor: 'pointer'}}>↻ refresh</EmptyState>
        </CollapsibleHeader>

        {historyLoading ? (
          <EmptyState>Loading...</EmptyState>
        ) : jobHistory.length === 0 ? (
          <EmptyState>No analysis tasks yet. Run your first analysis above.</EmptyState>
        ) : (
          <div style={{marginTop: 8}}>
            {jobHistory.slice(0, 10).map(job => (
              <HistoryItem key={job.job_id}>
                <HistoryDot />
                <div style={{flex: 1}}>
                  <div style={{fontWeight: 500, color: '#D3D8E0'}}>
                    {job.status === 'completed' ? '✅' :
                     job.status === 'running' ? '🔄' :
                     job.status === 'failed' ? '❌' : '⏳'}{' '}
                    {job.status}
                  </div>
                  <div style={{fontSize: 10, opacity: 0.6}}>
                    {job.created_at ? new Date(job.created_at).toLocaleString() : 'pending'}
                    {job.progress > 0 && job.progress < 100 && ` · ${Math.round(job.progress)}%`}
                  </div>
                </div>
              </HistoryItem>
            ))}
          </div>
        )}
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
