// GeoAI Panel — CustomPanelsFactory replacement for PalmView
// V5: Inline progress, auto-add results to map, clean UX
import React, {useState, useEffect, useCallback, useRef} from 'react';
import styled from 'styled-components';
import {useSelector, useDispatch} from 'react-redux';
import {FloatingResultsPanel} from '../palmview';
import {
  submitInferenceJob,
  listInferenceJobs,
  connectInferenceStream,
  listProjects,
  createProject,
  getMapState,
  subscribe,
  addResultsToKeplerMap,
  addGeoJSONToKeplerMap,
  getJobOutputs,
  type InferenceJobDetail,
  type InferenceJobSubmit,
  type WSInferenceMessage,
  type AoiState,
} from '../palmview';

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
    props.active ? props.theme?.activeColor || '#6CBFB7' : props.theme?.panelBackground || 'rgba(255,255,255,0.06)'};
  color: ${(props: any) => props.active ? '#fff' : props.theme?.textColor || '#A0A7B4'};
  border: 2px solid ${(props: any) => props.active ? props.theme?.activeColor || '#6CBFB7' : props.theme?.borderColor || 'rgba(255,255,255,0.1)'};
  border-radius: 6px;
  padding: 8px 12px;
  font-size: 11px;
  font-weight: ${(props: any) => props.active ? 600 : 400};
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: ${(props: any) => props.active ? '0 0 8px rgba(108, 191, 183, 0.4)' : 'none'};
  transform: ${(props: any) => props.active ? 'scale(1.02)' : 'scale(1)'};
  &:hover { background: ${(props: any) => props.theme?.activeColor || '#6CBFB7'}; color: #fff; }
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
  &::placeholder { color: ${(props: any) => props.theme?.subtextColor || '#6A7485'}; }
  &:focus { border-color: ${(props: any) => props.theme?.activeColor || '#6CBFB7'}; }
`;

const ChipRow = styled.div`
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  margin-top: 6px;
`;

const Chip = styled.button<{selected?: boolean}>`
  background: ${(props: any) => props.selected ? props.theme?.activeColor || '#6CBFB7' : 'transparent'};
  color: ${(props: any) => props.selected ? '#fff' : props.theme?.textColor || '#A0A7B4'};
  border: 1px solid ${(props: any) => props.theme?.borderColor || 'rgba(255,255,255,0.15)'};
  border-radius: 12px;
  padding: 3px 10px;
  font-size: 10px;
  cursor: pointer;
  transition: all 0.15s;
  &:hover { border-color: ${(props: any) => props.theme?.activeColor || '#6CBFB7'}; }
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
  &:hover { opacity: 0.85; }
  &:disabled { opacity: 0.4; cursor: not-allowed; }
`;

const RunButtonProgress = styled.div`
  position: absolute;
  left: 0;
  top: 0;
  height: 100%;
  background: ${(props: any) => props.theme?.activeColor || '#6CBFB7'};
  transition: width 0.3s ease-out;
`;

const EmptyState = styled.p`
  color: ${(props: any) => props.theme?.subtextColor || '#6A7485'};
  font-size: 11px;
  margin: 0;
  font-style: italic;
`;

// ─── Step Guidance ───────────────────────────────────────────

const StepGuideContainer = styled.div`
  display: flex;
  gap: 2px;
  padding: 10px 12px;
  background: linear-gradient(135deg, rgba(108,191,183,0.08) 0%, rgba(75,139,245,0.08) 100%);
  border-radius: 6px;
  border: 1px solid rgba(108,191,183,0.15);
`;

const StepItem = styled.div<{$active?: boolean; $done?: boolean}>`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
`;

const StepNumber = styled.div<{$active?: boolean; $done?: boolean}>`
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 600;
  background: ${p => p.$done ? '#4ecdc4' : p.$active ? '#4B8BF5' : 'rgba(255,255,255,0.08)'};
  color: ${p => (p.$done || p.$active) ? '#fff' : '#6A7485'};
  transition: all 0.2s;
`;

const StepLabel = styled.div<{$active?: boolean; $done?: boolean}>`
  font-size: 9px;
  color: ${p => p.$done ? '#4ecdc4' : p.$active ? '#D3D8E0' : '#6A7485'};
  text-align: center;
  line-height: 1.2;
`;

const StepConnector = styled.div<{$done?: boolean}>`
  width: 12px;
  height: 1px;
  background: ${p => p.$done ? '#4ecdc4' : 'rgba(255,255,255,0.1)'};
  align-self: center;
  margin-top: -8px;
`;

interface StepGuideProps {
  hasTask: boolean;
  hasAoi: boolean;
  hasTarget: boolean;
  isComplete: boolean;
}

const StepGuide: React.FC<StepGuideProps> = ({hasTask, hasAoi, hasTarget, isComplete}) => {
  const steps = [
    {num: 1, label: 'Select\nTask', done: hasTask, active: !hasTask},
    {num: 2, label: 'Draw\nAOI', done: hasAoi, active: hasTask && !hasAoi},
    {num: 3, label: 'Choose\nTarget', done: hasTarget, active: hasTask && hasAoi && !hasTarget},
    {num: 4, label: 'Run\nAnalysis', done: isComplete, active: hasTask && hasAoi && hasTarget && !isComplete},
  ];

  return (
    <StepGuideContainer>
      {steps.map((s, i) => (
        <React.Fragment key={s.num}>
          {i > 0 && <StepConnector $done={s.done || steps[i-1].done} />}
          <StepItem $active={s.active} $done={s.done}>
            <StepNumber $active={s.active} $done={s.done}>
              {s.done ? '✓' : s.num}
            </StepNumber>
            <StepLabel $active={s.active} $done={s.done}>{s.label}</StepLabel>
          </StepItem>
        </React.Fragment>
      ))}
    </StepGuideContainer>
  );
};

const ErrorMessage = styled.div`
  margin-top: 8px;
  padding: 8px 12px;
  background: rgba(249, 4, 44, 0.1);
  border: 1px solid rgba(249, 4, 44, 0.3);
  border-radius: 4px;
  color: #F9042C;
  font-size: 11px;
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
    {id: 'palm', label: '🌴 Palm'}, {id: 'tree', label: '🌳 Tree'},
    {id: 'building', label: '🏠 Building'}, {id: 'vehicle', label: '🚗 Vehicle'}
  ],
  segmentation: [
    {id: 'vegetation', label: '🌿 Vegetation'}, {id: 'water', label: '💧 Water'},
    {id: 'urban', label: '🏙️ Urban'}, {id: 'agriculture', label: '🌾 Agriculture'}
  ],
  classification: [
    {id: 'lulc5', label: 'LULC 5-class'}, {id: 'lulc10', label: 'LULC 10-class'},
    {id: 'custom', label: '✏️ Custom'}
  ],
  change: [
    {id: 'deforestation', label: '🌲→🏜️ Deforestation'}, {id: 'urbanization', label: '🌿→🏙️ Urbanization'},
    {id: 'custom', label: '✏️ Custom'}
  ]
};

// ─── Panel Content Component ─────────────────────────────────

const GeoAiPanelContent = () => {
  const dispatch = useDispatch();
  const [taskCategory, setTaskCategory] = useState<string | null>(null);
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
  const [customTarget, setCustomTarget] = useState('');
  const [modelConfigOpen, setModelConfigOpen] = useState(false);

  // Job state — inline
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [activeJob, setActiveJob] = useState<{
    job_id: string;
    status: string;
    progress: number;
  } | null>(null);

  // History
  const [jobHistory, setJobHistory] = useState<InferenceJobDetail[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Project
  const [projectId, setProjectId] = useState<string | null>(null);
  const [aoiState, setAoiState] = useState<AoiState>(getMapState().aoiState);
  const wsRef = useRef<WebSocket | null>(null);

  // Floating Results Panel state — declared BEFORE confidenceRef to avoid temporal dead zone
  const [showResults, setShowResults] = useState(false);
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.5);
  const [jobOutputs, setJobOutputs] = useState<any[]>([]);

  // Stable refs for WS callback closures (avoids stale captures)
  const dispatchRef = useRef(dispatch);
  useEffect(() => { dispatchRef.current = dispatch; }, [dispatch]);
  const confidenceRef = useRef(confidenceThreshold);
  useEffect(() => { confidenceRef.current = confidenceThreshold; }, [confidenceThreshold]);
  /** Context of the currently-running job (set on submit, used by WS result handler) */
  const submittedJobRef = useRef<{job_id: string; task_type: string; created_at: string} | null>(null);

  // Subscribe to AOI state from raster-state
  useEffect(() => {
    return subscribe((s) => setAoiState(s.aoiState));
  }, []);

  // Bridge: read Kepler datasets for GeoAI↔Data Tab awareness
  const keplerDatasets = useSelector(
    (state: any) => state?.demo?.keplerGl?.map?.visState?.datasets
  );
  const dataLayerCount = keplerDatasets ? Object.keys(keplerDatasets).length : 0;

  // Init project
  useEffect(() => {
    (async () => {
      try {
        const ORG = '1b77d523-9e70-4486-b64a-2b78fc600e9e';
        const list = await listProjects(ORG);
        setProjectId(list.projects?.length ? list.projects[0].project_id : (
          await createProject({org_id: ORG, name: 'Default', description: 'PalmView'})
        ).project_id);
      } catch {
        setProjectId('dd341b39-da8f-4142-98e8-da582b6f8d6a');
      }
    })();
    loadHistory();
  }, []);

  const loadHistory = useCallback(async () => {
    if (!projectId) return;
    setHistoryLoading(true);
    try {
      const res = await listInferenceJobs(projectId);
      setJobHistory(Array.isArray(res) ? res : (res as any)?.jobs || []);
    } catch { /* ignore */ }
    finally { setHistoryLoading(false); }
  }, [projectId]);

  const handleRunAnalysis = useCallback(async () => {
    if (!taskCategory || (!selectedTarget && !customTarget) || !projectId) return;

    // Close previous WS
    wsRef.current?.close();
    wsRef.current = null;

    setIsSubmitting(true);
    setSubmitError(null);
    setActiveJob(null);

    const target = selectedTarget || customTarget;
    if (!aoiState.geometry) {
      setSubmitError('Please draw an AOI on the map first (click the crosshair button)');
      setIsSubmitting(false);
      return;
    }

    const job: InferenceJobSubmit = {
      project_id: projectId,
      task_type: taskCategory,
      aoi: aoiState.geometry,
      params: {target},
    };

    try {
      const result = await submitInferenceJob(job);
      const jobCreatedAt = new Date().toISOString();
      submittedJobRef.current = {
        job_id: result.job_id,
        task_type: taskCategory,
        created_at: jobCreatedAt,
      };
      setActiveJob({job_id: result.job_id, status: 'queued', progress: 0});

      // Connect WebSocket
      const ws = connectInferenceStream(
        result.job_id,
        (msg: WSInferenceMessage) => {
          if (msg.type === 'progress') {
            setActiveJob(prev => prev ? {
              ...prev,
              status: 'running',
              progress: msg.pct ?? (msg as any).progress ?? prev.progress,
            } : prev);
          }
          if (msg.type === 'result') {
            // Auto-add results to Kepler map as soon as GeoJSON arrives
            if (submittedJobRef.current && msg.geojson) {
              addGeoJSONToKeplerMap(
                dispatchRef.current,
                submittedJobRef.current,
                msg.geojson,
                {confidenceThreshold: confidenceRef.current}
              );
            }
            // Pre-populate stats for the panel (before API fetch completes)
            if (msg.stats) {
              setJobOutputs([{
                output_id: 'ws-result',
                output_type: 'geojson',
                format: 'geojson',
                uri: '',
                stats: msg.stats,
              } as any]);
            }
          }
          if (msg.type === 'complete') {
            setActiveJob(prev => prev ? {...prev, status: 'complete', progress: 1} : prev);
            setShowResults(true);
            // Fetch proper outputs from API (for export URI and authoritative stats)
            getJobOutputs(result.job_id).then(res => {
              if (res.outputs?.length) setJobOutputs(res.outputs);
            }).catch(() => {});
            loadHistory();
          }
          if (msg.type === 'error') {
            setActiveJob(prev => prev ? {...prev, status: 'failed'} : prev);
            loadHistory();
          }
        },
        (err) => console.error('[GeoAI WS]', err)
      );
      wsRef.current = ws;
      loadHistory();
    } catch (err: any) {
      setSubmitError(err.message || 'Failed to submit');
    } finally {
      setIsSubmitting(false);
    }
  }, [taskCategory, selectedTarget, customTarget, projectId, loadHistory]);

  // Cleanup
  useEffect(() => () => { wsRef.current?.close(); }, []);

  const isRunning = activeJob && (activeJob.status === 'queued' || activeJob.status === 'running');
  const isComplete = activeJob?.status === 'complete';
  const isFailed = activeJob?.status === 'failed';

  const hasTask = !!taskCategory;
  const hasAoi = !!aoiState.geometry;
  const hasTarget = !!(selectedTarget || customTarget);

  return (
    <StyledGeoAIPanel>
      {/* Step Guidance */}
      <StepGuide hasTask={hasTask} hasAoi={hasAoi} hasTarget={hasTarget} isComplete={!!isComplete} />

      {/* 1. Task Selection */}
      <StyledSection>
        <StyledSectionTitle>Analysis Task</StyledSectionTitle>
        <ButtonRow>
          {TASK_CATEGORIES.map(cat => (
            <StyledButton
              key={cat.id}
              active={taskCategory === cat.id}
              onClick={() => {
                const newTask = taskCategory === cat.id ? null : cat.id;
                setTaskCategory(newTask);
                setSelectedTarget(null);
                setCustomTarget('');
                setActiveJob(null);
                setSubmitError(null);
                // Auto-expand model config when task selected
                if (newTask) setModelConfigOpen(true);
              }}
            >
              {cat.icon} {cat.label}
            </StyledButton>
          ))}
        </ButtonRow>

        {taskCategory && QUICK_TARGETS[taskCategory] && (
          <>
            <StyledInput
              placeholder={
                taskCategory === 'detection' ? 'What to detect?' :
                taskCategory === 'segmentation' ? 'What to segment?' :
                taskCategory === 'classification' ? 'Classification scheme?' :
                'Describe change to detect...'
              }
              value={customTarget}
              onChange={e => { setCustomTarget(e.target.value); setSelectedTarget(null); }}
            />
            <ChipRow>
              {QUICK_TARGETS[taskCategory].map(t => (
                <Chip
                  key={t.id}
                  selected={selectedTarget === t.id}
                  onClick={() => { setSelectedTarget(selectedTarget === t.id ? null : t.id); setCustomTarget(''); }}
                >
                  {t.label}
                </Chip>
              ))}
            </ChipRow>
          </>
        )}
      </StyledSection>

      {/* 2. Model Config — collapsible */}
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

      {/* AOI Status */}
      <StyledSection>
        <StyledSectionTitle>📍 AOI (Area of Interest)</StyledSectionTitle>
        {aoiState.geometry ? (
          <div style={{display: 'flex', alignItems: 'center', gap: 8}}>
            <span style={{color: '#4ecdc4', fontSize: 12}}>
              ✅ {aoiState.geometry.type === 'MultiPolygon'
                ? `${aoiState.geometry.coordinates.length} polygons selected`
                : 'AOI defined'}
            </span>
            <StyledButton
              style={{padding: '2px 8px', fontSize: 10}}
              onClick={() => {
                (window as any).__PALMVIEW_AOI?.clear?.();
              }}
            >✕ Clear</StyledButton>
          </div>
        ) : (
          <EmptyState>
            Use the Draw on Map tools (top-right) to define your analysis area — rectangle or polygon.
          </EmptyState>
        )}
      </StyledSection>

      {/* Run Button — becomes progress indicator while running */}
      <RunButton
        disabled={!taskCategory || (!selectedTarget && !customTarget) || !aoiState.geometry || isSubmitting || !!isRunning}
        onClick={handleRunAnalysis}
        style={isRunning ? {background: 'rgba(108, 191, 183, 0.3)', position: 'relative', overflow: 'hidden'} : undefined}
      >
        {isRunning && activeJob && (
          <RunButtonProgress style={{width: `${activeJob.progress * 100}%`}} />
        )}
        <span style={{position: 'relative', zIndex: 1}}>
          {isSubmitting ? '⏳ Submitting...' : isRunning ? '⏳ Analyzing...' : isComplete ? '✅ Complete — ▶ Run Again' : '▶ Run Analysis'}
        </span>
      </RunButton>

      {submitError && <ErrorMessage>⚠️ {submitError}</ErrorMessage>}
      {isFailed && <ErrorMessage>❌ Analysis failed — try again</ErrorMessage>}

      {/* Data Layers Bridge */}
      {dataLayerCount > 0 && (
        <StyledSection>
          <StyledSectionTitle>🗂 Data Layers ({dataLayerCount})</StyledSectionTitle>
          <div style={{fontSize: 11, color: '#A0A7B4'}}>
            {Object.values(keplerDatasets || {}).map((ds: any) => (
              <div key={ds.id} style={{padding: '2px 0', display: 'flex', alignItems: 'center', gap: 6}}>
                <span style={{color: '#4ecdc4'}}>●</span>
                <span>{ds.label || ds.id}</span>
                <span style={{opacity: 0.5, fontSize: 10}}>
                  {ds.dataContainer?.numRows ? `${ds.dataContainer.numRows} rows` : ''}
                </span>
              </div>
            ))}
          </div>
        </StyledSection>
      )}

      {/* Floating Results Panel */}
      <FloatingResultsPanel
        isVisible={showResults && !!activeJob}
        job={activeJob as any}
        outputs={jobOutputs}
        confidenceThreshold={confidenceThreshold}
        onClose={() => setShowResults(false)}
        onConfidenceChange={setConfidenceThreshold}
        onAddToMap={() => {
          if (activeJob) {
            addResultsToKeplerMap(dispatch, activeJob as InferenceJobDetail, confidenceThreshold)
              .then(() => console.log('[GeoAI] Results added to map'))
              .catch(err => console.error('[GeoAI] Failed to add results:', err));
          }
        }}
        onExport={(format) => {
          if (!activeJob || jobOutputs.length === 0) return;
          // Find first GeoJSON output and trigger download
          const geojsonOutput = jobOutputs.find((o: any) => o.format === 'geojson');
          if (geojsonOutput) {
            const url = geojsonOutput.uri.startsWith('http')
              ? geojsonOutput.uri
              : `${(typeof process !== 'undefined' && process.env?.PALMVIEW_API_URL) || 'http://100.81.217.18:8000'}${geojsonOutput.uri}`;
            fetch(url)
              .then(r => r.json())
              .then(data => {
                const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/geo+json'});
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = `palmview-${activeJob.job_id.slice(0, 8)}.geojson`;
                a.click();
                URL.revokeObjectURL(a.href);
              })
              .catch(err => console.error('[GeoAI] Export failed:', err));
          }
        }}
      />

      {/* 3. Task History */}
      <StyledSection>
        <CollapsibleHeader onClick={loadHistory}>
          <StyledSectionTitle style={{margin: 0}}>
            📋 Task History {jobHistory.length > 0 ? `(${jobHistory.length})` : ''}
          </StyledSectionTitle>
          <EmptyState style={{margin: 0, cursor: 'pointer'}}>↻</EmptyState>
        </CollapsibleHeader>

        {historyLoading ? (
          <EmptyState>Loading...</EmptyState>
        ) : jobHistory.length === 0 ? (
          <EmptyState>No tasks yet</EmptyState>
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
                    {(job as any).task_type || job.status}
                  </div>
                  <div style={{fontSize: 10, opacity: 0.6}}>
                    {job.created_at ? new Date(job.created_at).toLocaleString() : ''}
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

// ─── Error Boundary ──────────────────────────────────────────

interface GeoAiErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class GeoAiErrorBoundary extends React.Component<
  {children: React.ReactNode},
  GeoAiErrorBoundaryState
> {
  constructor(props: {children: React.ReactNode}) {
    super(props);
    this.state = {hasError: false, error: null};
  }

  static getDerivedStateFromError(error: Error): GeoAiErrorBoundaryState {
    return {hasError: true, error};
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[GeoAI] Panel error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{padding: 16, color: '#F9042C', fontSize: 12}}>
          <div style={{fontWeight: 600, marginBottom: 8}}>⚠️ GeoAI Panel Error</div>
          <div style={{
            background: 'rgba(249,4,44,0.08)',
            border: '1px solid rgba(249,4,44,0.25)',
            borderRadius: 4,
            padding: '8px 12px',
            wordBreak: 'break-all',
            color: '#F9042C',
          }}>
            {this.state.error?.message || 'Unknown error'}
          </div>
          <button
            style={{
              marginTop: 12, padding: '6px 12px', background: 'rgba(249,4,44,0.15)',
              border: '1px solid rgba(249,4,44,0.3)', borderRadius: 4,
              color: '#F9042C', cursor: 'pointer', fontSize: 11,
            }}
            onClick={() => this.setState({hasError: false, error: null})}
          >
            ↺ Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const GeoAiPanelWithBoundary: React.FC = () => (
  <GeoAiErrorBoundary>
    <GeoAiPanelContent />
  </GeoAiErrorBoundary>
);

// ─── Brain Icon ──────────────────────────────────────────────

const BrainIcon = (props: any) => (
  <svg viewBox="0 0 24 24" width={props.height || '18px'} height={props.height || '18px'} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
    {/* Left hemisphere */}
    <path d="M12 2C9.5 2 7 3.5 7 6c-2 0-3.5 1.5-3.5 3.5 0 1.2.6 2.2 1.5 2.8C4.4 13 4 14 4 15c0 2 1.5 3.5 3.5 3.5.5 1.5 2 2.5 4.5 2.5" strokeWidth="1.5" />
    {/* Right hemisphere */}
    <path d="M12 2c2.5 0 5 1.5 5 4 2 0 3.5 1.5 3.5 3.5 0 1.2-.6 2.2-1.5 2.8.6.7 1 1.7 1 2.7 0 2-1.5 3.5-3.5 3.5-.5 1.5-2 2.5-4.5 2.5" strokeWidth="1.5" />
    {/* Central fissure */}
    <path d="M12 2v19" strokeWidth="1" opacity="0.5" />
    {/* Neural connections */}
    <path d="M8 8h8M7 12h10M8 16h8" strokeWidth="0.75" opacity="0.4" strokeDasharray="1.5 1.5" />
  </svg>
);

// ─── Factory ─────────────────────────────────────────────────

function GeoAiCustomPanelsFactory() {
  const CustomPanels: any = () => null;
  CustomPanels.panels = [{
    id: 'geoai',
    label: 'GeoAI',
    iconComponent: BrainIcon,
    component: GeoAiPanelWithBoundary
  }];
  CustomPanels.getProps = () => ({});
  return CustomPanels;
}

GeoAiCustomPanelsFactory.deps = [];
export default GeoAiCustomPanelsFactory;
