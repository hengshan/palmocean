// Plantation KB Panel — Sprint 4 T1
// Loads 4700+ palm oil concession records into Kepler.gl as a point layer
// Filters: country (MY/ID), area range, name search
import React, {useState, useCallback} from 'react';
import styled from 'styled-components';
import {useDispatch} from 'react-redux';
import {addDataToMap, removeDataset, fitBounds} from '@kepler.gl/actions';

// ─── Types ───────────────────────────────────────────────────────────────────

interface PlantationRecord {
  id: string;
  name: string;
  description: string | null;
  location: {type: 'Point'; coordinates: [number, number]};
  boundary: {type: 'Polygon'; coordinates: number[][][]};
  area_hectares: number | null;
  created_at: string;
  updated_at: string;
}

// ─── Config ──────────────────────────────────────────────────────────────────

const API_BASE =
  (typeof process !== 'undefined' && process.env?.PALMVIEW_API_URL) ||
  'http://100.81.217.18:8000';

const DATASET_ID = 'plantation_kb';

// ─── Styled Components ───────────────────────────────────────────────────────

const Panel = styled.div`
  padding: 12px;
  color: ${(p: any) => p.theme?.textColor || '#A0A7B4'};
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow-y: auto;
  ${(p: any) => p.theme?.sidePanelScrollBar || ''}
`;

const Section = styled.div`
  background: ${(p: any) => p.theme?.panelBackgroundHover || 'rgba(255,255,255,0.06)'};
  border-radius: 4px;
  padding: 12px;
`;

const SectionTitle = styled.div`
  color: ${(p: any) => p.theme?.subtextColorActive || '#D3D8E0'};
  font-size: 11px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 8px;
`;

const Label = styled.div`
  font-size: 11px;
  color: ${(p: any) => p.theme?.textColorHl || '#8A9BB0'};
  margin-bottom: 4px;
`;

const Input = styled.input`
  width: 100%;
  background: ${(p: any) => p.theme?.inputBgd || 'rgba(0,0,0,0.3)'};
  border: 1px solid ${(p: any) => p.theme?.inputBorderColor || 'rgba(255,255,255,0.08)'};
  border-radius: 3px;
  color: ${(p: any) => p.theme?.textColorHl || '#D3D8E0'};
  font-size: 12px;
  padding: 5px 8px;
  outline: none;
  box-sizing: border-box;
  &:focus {
    border-color: ${(p: any) => p.theme?.activeColor || '#1fbad6'};
  }
`;

const Row = styled.div`
  display: flex;
  gap: 6px;
`;

const CountryBtn = styled.button<{active?: boolean}>`
  flex: 1;
  padding: 5px 0;
  border-radius: 3px;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid ${p => p.active ? '#22c55e' : 'rgba(255,255,255,0.1)'};
  background: ${p => p.active ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.04)'};
  color: ${p => p.active ? '#22c55e' : '#8A9BB0'};
  transition: all 0.15s;
  &:hover {
    border-color: #22c55e;
    color: #22c55e;
  }
`;

const ActionBtn = styled.button<{variant?: 'primary' | 'danger'}>`
  flex: 1;
  padding: 7px 0;
  border-radius: 3px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  border: none;
  background: ${p =>
    p.variant === 'danger'
      ? 'rgba(239,68,68,0.2)'
      : 'rgba(34,197,94,0.2)'};
  color: ${p => p.variant === 'danger' ? '#f87171' : '#22c55e'};
  &:hover {
    background: ${p =>
      p.variant === 'danger'
        ? 'rgba(239,68,68,0.35)'
        : 'rgba(34,197,94,0.35)'};
  }
  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
`;

const StatusLine = styled.div<{type?: 'error' | 'success' | 'info'}>`
  font-size: 11px;
  padding: 6px 8px;
  border-radius: 3px;
  background: ${p =>
    p.type === 'error' ? 'rgba(239,68,68,0.1)'
    : p.type === 'success' ? 'rgba(34,197,94,0.1)'
    : 'rgba(255,255,255,0.05)'};
  color: ${p =>
    p.type === 'error' ? '#f87171'
    : p.type === 'success' ? '#86efac'
    : '#8A9BB0'};
`;

const CountBadge = styled.span`
  background: rgba(34,197,94,0.2);
  color: #22c55e;
  border-radius: 10px;
  padding: 1px 6px;
  font-size: 10px;
  font-weight: 600;
  margin-left: 6px;
`;

const HalfInput = styled(Input)`
  width: 50%;
`;

// ─── Component ───────────────────────────────────────────────────────────────

function PlantationPanel() {
  const dispatch = useDispatch();

  // Filter state
  const [nameQuery, setNameQuery] = useState('');
  const [country, setCountry] = useState<'ALL' | 'MY' | 'ID'>('ALL');
  const [minArea, setMinArea] = useState('');
  const [maxArea, setMaxArea] = useState('');

  // Loading state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [onMap, setOnMap] = useState(false);
  const [count, setCount] = useState<number | null>(null);

  const buildUrl = useCallback((name: string, cty: string, minA: string, maxA: string) => {
    const params = new URLSearchParams();
    if (name) params.set('name', name);
    if (cty && cty !== 'ALL') params.set('country', cty);
    if (minA) params.set('min_area', minA);
    if (maxA) params.set('max_area', maxA);
    return `${API_BASE}/api/plantations?${params.toString()}`;
  }, []);

  const handleLoad = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = buildUrl(nameQuery, country, minArea, maxArea);
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const records: PlantationRecord[] = await resp.json();

      if (!records.length) {
        setError('No records matching filters');
        setLoading(false);
        return;
      }

      // Build Kepler-compatible dataset: fields + rows (matching kepler-integration.ts pattern)
      const fields = [
        {name: '_geojson', type: 'geojson'},
        {name: 'name', type: 'string'},
        {name: 'description', type: 'string'},
        {name: 'area_hectares', type: 'real'},
      ];

      const rows = records.map(r => [
        // _geojson: the full GeoJSON Feature for this record
        {type: 'Feature', geometry: r.location, properties: {name: r.name}},
        r.name,
        r.description || '',
        r.area_hectares ?? 0,
      ]);

      dispatch({
        type: '@@kepler.gl/ADD_DATA_TO_MAP',
        payload: {
          datasets: [{
            info: {id: DATASET_ID, label: '🌴 Plantation KB', color: [34, 197, 94]},
            data: {fields, rows},
          }],
          options: {centerMap: false, readOnly: false},
          config: {
            version: 'v1',
            config: {
              visState: {
                layers: [
                  {
                    id: 'plantation_layer',
                    type: 'geojson',
                    config: {
                      dataId: DATASET_ID,
                      label: '🌴 Plantations',
                      columns: {geojson: '_geojson'},
                      color: [34, 197, 94],
                      isVisible: true,
                      visConfig: {
                        radius: 6,
                        opacity: 0.85,
                        stroked: false,
                        filled: true,
                      },
                    },
                    visualChannels: {},
                  },
                ],
                interactionConfig: {
                  tooltip: {
                    fieldsToShow: {
                      [DATASET_ID]: [
                        {name: 'name', format: null},
                        {name: 'description', format: null},
                        {name: 'area_hectares', format: null},
                      ],
                    },
                    compareMode: false,
                    compareType: 'absolute',
                    enabled: true,
                  },
                },
              },
            },
          },
        },
      });

      // Zoom to SE Asia bounds
      try {
        const map = (window as any).__PALMVIEW_MAP;
        if (map) map.fitBounds([[95, -10], [125, 10]], {padding: 40, duration: 1200});
      } catch (_) {
        dispatch(fitBounds([95, -10, 125, 10]));
      }

      setCount(records.length);
      setOnMap(true);
    } catch (e: any) {
      setError(e.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [dispatch, buildUrl, nameQuery, country, minArea, maxArea]);

  const handleClear = useCallback(() => {
    dispatch(removeDataset(DATASET_ID));
    setOnMap(false);
    setCount(null);
  }, [dispatch]);

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setNameQuery(v);
  };

  return (
    <Panel>
      {/* Header */}
      <Section>
        <div style={{display: 'flex', alignItems: 'center', marginBottom: 8}}>
          <span style={{fontSize: 14, fontWeight: 600, color: '#D3D8E0'}}>
            🌴 Plantation KB
          </span>
          {count !== null && <CountBadge>{count.toLocaleString()} pts</CountBadge>}
        </div>
        <div style={{fontSize: 11, color: '#6B7584'}}>
          GFW palm oil concessions · Malaysia &amp; Indonesia
        </div>
      </Section>

      {/* Filters */}
      <Section>
        <SectionTitle>Filters</SectionTitle>

        <Label>Company Name</Label>
        <Input
          placeholder="Search by name…"
          value={nameQuery}
          onChange={handleNameChange}
          style={{marginBottom: 8}}
        />

        <Label>Country</Label>
        <Row style={{marginBottom: 8}}>
          {(['ALL', 'MY', 'ID'] as const).map(c => (
            <CountryBtn key={c} active={country === c} onClick={() => setCountry(c)}>
              {c === 'ALL' ? 'All' : c === 'MY' ? '🇲🇾 MY' : '🇮🇩 ID'}
            </CountryBtn>
          ))}
        </Row>

        <Label>Area (ha)</Label>
        <Row>
          <HalfInput
            placeholder="Min"
            type="number"
            value={minArea}
            onChange={e => setMinArea(e.target.value)}
          />
          <HalfInput
            placeholder="Max"
            type="number"
            value={maxArea}
            onChange={e => setMaxArea(e.target.value)}
          />
        </Row>
      </Section>

      {/* Actions */}
      <Row>
        <ActionBtn onClick={handleLoad} disabled={loading}>
          {loading ? '⏳ Loading…' : onMap ? '🔄 Reload' : '🗺 Load to Map'}
        </ActionBtn>
        {onMap && (
          <ActionBtn variant="danger" onClick={handleClear}>
            ✕ Clear
          </ActionBtn>
        )}
      </Row>

      {/* Status */}
      {error && <StatusLine type="error">⚠ {error}</StatusLine>}
      {onMap && !error && (
        <StatusLine type="success">
          ✓ {count?.toLocaleString()} plantation points on map. Click a point to see details.
        </StatusLine>
      )}
      {!onMap && !error && !loading && (
        <StatusLine type="info">
          Apply filters and click "Load to Map" to visualise plantation concessions.
        </StatusLine>
      )}
    </Panel>
  );
}

// ─── Error Boundary ──────────────────────────────────────────────────────────

class PlantationPanelBoundary extends React.Component<{children: React.ReactNode}, {error: Error | null}> {
  constructor(props: any) {
    super(props);
    this.state = {error: null};
  }
  static getDerivedStateFromError(error: Error) {
    return {error};
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{padding: 12, color: '#f87171', fontSize: 12}}>
          Plantation panel error: {this.state.error.message}
        </div>
      );
    }
    return this.props.children;
  }
}

const PlantationPanelWithBoundary = () => (
  <PlantationPanelBoundary>
    <PlantationPanel />
  </PlantationPanelBoundary>
);

// ─── Palm Tree Icon ──────────────────────────────────────────────────────────

const PalmTreeIcon = (props: any) => (
  <svg
    viewBox="0 0 24 24"
    width={props.height || '18px'}
    height={props.height || '18px'}
    fill="currentColor"
    stroke="none"
  >
    {/* Trunk */}
    <path d="M12 22 C11.5 18 11 14 11.5 10 L12.5 10 C13 14 12.5 18 12 22Z" />
    {/* Left fronds */}
    <path d="M11.5 10 C9 8 5 6 3 4 C5.5 5.5 8.5 7.5 11 9.5Z" opacity="0.9" />
    <path d="M11.5 11 C8 11 4 10 2 8 C5 9.5 8.5 10 11.5 11Z" opacity="0.8" />
    {/* Right fronds */}
    <path d="M12.5 10 C15 8 19 6 21 4 C18.5 5.5 15.5 7.5 13 9.5Z" opacity="0.9" />
    <path d="M12.5 11 C16 11 20 10 22 8 C19 9.5 15.5 10 12.5 11Z" opacity="0.8" />
    {/* Top frond */}
    <path d="M12 10 C10 7 9 4 10 2 C11 4 11.5 7 12 10Z" opacity="0.85" />
    <path d="M12 10 C14 7 15 4 14 2 C13 4 12.5 7 12 10Z" opacity="0.85" />
  </svg>
);

// ─── Factory ─────────────────────────────────────────────────────────────────

function PlantationPanelFactory() {
  const CustomPanels: any = () => null;
  CustomPanels.panels = [
    {
      id: 'plantation',
      label: 'KB',
      iconComponent: PalmTreeIcon,
      component: PlantationPanelWithBoundary,
    },
  ];
  CustomPanels.getProps = () => ({});
  return CustomPanels;
}

PlantationPanelFactory.deps = [];
export default PlantationPanelFactory;
