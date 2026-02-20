// Data Tab — Upload, STAC Browse, Connected Datasets
// Injected via CustomPanelsFactory alongside GeoAI Tab
import React, {useState, useEffect, useCallback, useRef} from 'react';
import styled from 'styled-components';
import {
  getSTACProviders,
  searchSTAC,
  listDatasets,
  uploadGeoTIFF,
  importSTACItem,
  deleteDataset,
  type STACProvider,
  type STACItem,
  type STACSearchParams,
  type DatasetInfo,
} from '../palmview/api-data';

// ─── Styled Components ───────────────────────────────

const Panel = styled.div`
  padding: 12px;
  color: ${(p: any) => p.theme?.textColor || '#A0A7B4'};
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
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

const TabRow = styled.div`
  display: flex;
  gap: 0;
  margin-bottom: 10px;
  border-bottom: 1px solid ${(p: any) => p.theme?.borderColor || 'rgba(255,255,255,0.1)'};
`;

const Tab = styled.button<{active?: boolean}>`
  flex: 1;
  background: transparent;
  color: ${(p: any) => p.active ? p.theme?.activeColor || '#1FBF6E' : p.theme?.textColor || '#A0A7B4'};
  border: none;
  border-bottom: 2px solid ${(p: any) => p.active ? p.theme?.activeColor || '#1FBF6E' : 'transparent'};
  padding: 8px 4px;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    color: ${(p: any) => p.theme?.activeColor || '#1FBF6E'};
  }
`;

const Btn = styled.button<{primary?: boolean; small?: boolean; danger?: boolean}>`
  background: ${(p: any) =>
    p.danger ? '#F9042C' :
    p.primary ? p.theme?.activeColor || '#1FBF6E' :
    p.theme?.panelBackground || 'rgba(255,255,255,0.06)'};
  color: ${(p: any) => (p.primary || p.danger) ? '#fff' : p.theme?.textColor || '#A0A7B4'};
  border: 1px solid ${(p: any) => (p.primary || p.danger) ? 'transparent' : p.theme?.borderColor || 'rgba(255,255,255,0.1)'};
  border-radius: 4px;
  padding: ${(p: any) => p.small ? '4px 8px' : '6px 12px'};
  font-size: ${(p: any) => p.small ? '10px' : '11px'};
  cursor: pointer;
  transition: all 0.15s;
  &:hover { opacity: 0.85; }
  &:disabled { opacity: 0.4; cursor: not-allowed; }
`;

const Input = styled.input`
  width: 100%;
  background: ${(p: any) => p.theme?.panelBackground || 'rgba(0,0,0,0.2)'};
  color: ${(p: any) => p.theme?.textColor || '#A0A7B4'};
  border: 1px solid ${(p: any) => p.theme?.borderColor || 'rgba(255,255,255,0.1)'};
  border-radius: 4px;
  padding: 6px 8px;
  font-size: 11px;
  outline: none;
  &:focus { border-color: ${(p: any) => p.theme?.activeColor || '#1FBF6E'}; }
  &::placeholder { color: ${(p: any) => p.theme?.subtextColor || '#6A7485'}; }
`;

const Select = styled.select`
  width: 100%;
  background: ${(p: any) => p.theme?.panelBackground || 'rgba(0,0,0,0.2)'};
  color: ${(p: any) => p.theme?.textColor || '#A0A7B4'};
  border: 1px solid ${(p: any) => p.theme?.borderColor || 'rgba(255,255,255,0.1)'};
  border-radius: 4px;
  padding: 6px 8px;
  font-size: 11px;
  outline: none;
`;

const DropZone = styled.div<{isDragging?: boolean}>`
  border: 2px dashed ${(p: any) => p.isDragging ? p.theme?.activeColor || '#1FBF6E' : p.theme?.borderColor || 'rgba(255,255,255,0.15)'};
  border-radius: 8px;
  padding: 24px 16px;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s;
  background: ${(p: any) => p.isDragging ? 'rgba(31,191,110,0.05)' : 'transparent'};

  &:hover {
    border-color: ${(p: any) => p.theme?.activeColor || '#1FBF6E'};
  }
`;

const ItemCard = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  background: ${(p: any) => p.theme?.panelBackground || 'rgba(0,0,0,0.2)'};
  border-radius: 4px;
  margin-top: 6px;
  font-size: 11px;
`;

const Thumb = styled.img`
  width: 48px;
  height: 48px;
  border-radius: 4px;
  object-fit: cover;
  background: rgba(0,0,0,0.3);
`;

const Muted = styled.span`
  color: ${(p: any) => p.theme?.subtextColor || '#6A7485'};
  font-size: 10px;
`;

const ProgressBar = styled.div<{pct: number}>`
  height: 4px;
  background: ${(p: any) => p.theme?.panelBackground || 'rgba(255,255,255,0.1)'};
  border-radius: 2px;
  margin-top: 8px;
  overflow: hidden;

  &::after {
    content: '';
    display: block;
    height: 100%;
    width: ${(p: any) => p.pct}%;
    background: ${(p: any) => p.theme?.activeColor || '#1FBF6E'};
    transition: width 0.3s;
  }
`;

// ─── Sub-Tabs ────────────────────────────────────────

type DataView = 'upload' | 'stac' | 'datasets';

// ─── Upload View ─────────────────────────────────────

const UploadView = ({onUploaded}: {onUploaded: () => void}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (!file.name.match(/\.(tif|tiff|geotiff)$/i)) {
      setError('Please upload a GeoTIFF file (.tif)');
      return;
    }
    setUploading(true);
    setError(null);
    setUploadPct(0);
    try {
      await uploadGeoTIFF(file, setUploadPct);
      onUploaded();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept=".tif,.tiff"
        style={{display: 'none'}}
        onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
      />
      <DropZone
        isDragging={isDragging}
        onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={e => { e.preventDefault(); setIsDragging(false); e.dataTransfer.files[0] && handleFile(e.dataTransfer.files[0]); }}
        onClick={() => fileRef.current?.click()}
      >
        <div style={{fontSize: 24, marginBottom: 4}}>🗺️</div>
        <div style={{fontSize: 12, fontWeight: 500}}>
          {uploading ? `Uploading... ${uploadPct}%` : 'Drop GeoTIFF here or click to browse'}
        </div>
        <Muted>Supports .tif, .tiff files</Muted>
      </DropZone>
      {uploading && <ProgressBar pct={uploadPct} />}
      {error && <Muted style={{color: '#F9042C'}}>⚠️ {error}</Muted>}
    </>
  );
};

// ─── STAC Browser View ───────────────────────────────

const STACView = ({onImported}: {onImported: () => void}) => {
  const [providers, setProviders] = useState<Record<string, STACProvider>>({});
  const [selectedProvider, setSelectedProvider] = useState('planetary-computer');
  const [collection, setCollection] = useState('sentinel-2-l2a');
  const [bbox, setBbox] = useState('-104,39,-103,40');  // Colorado sample
  const [results, setResults] = useState<STACItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [importing, setImporting] = useState<string | null>(null);

  useEffect(() => {
    getSTACProviders().then(setProviders).catch(console.error);
  }, []);

  const handleSearch = async () => {
    setSearching(true);
    try {
      const [w, s, e, n] = bbox.split(',').map(Number);
      const params: STACSearchParams = {
        provider: selectedProvider,
        collections: [collection],
        bbox: [w, s, e, n],
        limit: 10,
      };
      const res = await searchSTAC(params);
      setResults(Array.isArray(res) ? res : res.items || []);
    } catch (err) {
      console.error('[Data] STAC search failed:', err);
    } finally {
      setSearching(false);
    }
  };

  const handleImport = async (item: STACItem) => {
    setImporting(item.id);
    try {
      await importSTACItem(item.id, selectedProvider, 'visual');
      onImported();
    } catch (err) {
      console.error('[Data] Import failed:', err);
    } finally {
      setImporting(null);
    }
  };

  return (
    <>
      <div style={{display: 'flex', flexDirection: 'column', gap: 6}}>
        <Select value={selectedProvider} onChange={e => setSelectedProvider(e.target.value)}>
          {Object.entries(providers).map(([key, p]) => (
            <option key={key} value={key}>{p.name}</option>
          ))}
        </Select>

        <Input
          value={collection}
          onChange={e => setCollection(e.target.value)}
          placeholder="Collection (e.g. sentinel-2-l2a)"
        />

        <Input
          value={bbox}
          onChange={e => setBbox(e.target.value)}
          placeholder="Bbox: west,south,east,north"
        />

        <Btn primary onClick={handleSearch} disabled={searching}>
          {searching ? '🔍 Searching...' : '🔍 Search'}
        </Btn>
      </div>

      {results.length > 0 && (
        <div style={{marginTop: 8}}>
          <Muted>{results.length} results</Muted>
          {results.map(item => (
            <ItemCard key={item.id}>
              {item.thumbnail && <Thumb src={item.thumbnail} alt="" />}
              <div style={{flex: 1, minWidth: 0}}>
                <div style={{fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>
                  {item.id}
                </div>
                <Muted>{item.datetime?.slice(0, 10)} · {item.collection}</Muted>
              </div>
              <Btn small primary onClick={() => handleImport(item)} disabled={importing === item.id}>
                {importing === item.id ? '...' : '＋'}
              </Btn>
            </ItemCard>
          ))}
        </div>
      )}
    </>
  );
};

// ─── Connected Datasets View ─────────────────────────

const DatasetsView = ({datasets, loading, onRefresh, onDelete}: {
  datasets: DatasetInfo[];
  loading: boolean;
  onRefresh: () => void;
  onDelete: (id: string) => void;
}) => (
  <>
    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
      <Muted>{datasets.length} dataset{datasets.length !== 1 ? 's' : ''}</Muted>
      <Btn small onClick={onRefresh} disabled={loading}>↻</Btn>
    </div>
    {loading ? (
      <Muted>Loading...</Muted>
    ) : datasets.length === 0 ? (
      <Muted style={{fontStyle: 'italic', display: 'block', textAlign: 'center', padding: 16}}>
        No datasets yet. Upload a GeoTIFF or import from STAC.
      </Muted>
    ) : (
      datasets.map(ds => (
        <ItemCard key={ds.id}>
          <div style={{flex: 1, minWidth: 0}}>
            <div style={{fontWeight: 500}}>{ds.name}</div>
            <Muted>
              {ds.source_type} · {ds.format}
              {ds.resolution ? ` · ${ds.resolution}m` : ''}
              {ds.bands ? ` · ${ds.bands.length} bands` : ''}
            </Muted>
          </div>
          <Btn small danger onClick={() => onDelete(ds.id)}>✕</Btn>
        </ItemCard>
      ))
    )}
  </>
);

// ─── Main Data Panel Content ─────────────────────────

const DataPanelContent = () => {
  const [view, setView] = useState<DataView>('stac');
  const [datasets, setDatasets] = useState<DatasetInfo[]>([]);
  const [dsLoading, setDsLoading] = useState(false);

  const refreshDatasets = useCallback(async () => {
    setDsLoading(true);
    try {
      const ds = await listDatasets();
      setDatasets(Array.isArray(ds) ? ds : []);
    } catch (err) {
      console.error('[Data] Failed to load datasets:', err);
    } finally {
      setDsLoading(false);
    }
  }, []);

  useEffect(() => { refreshDatasets(); }, [refreshDatasets]);

  const handleDelete = async (id: string) => {
    try {
      await deleteDataset(id);
      refreshDatasets();
    } catch (err) {
      console.error('[Data] Delete failed:', err);
    }
  };

  return (
    <Panel>
      <TabRow>
        <Tab active={view === 'stac'} onClick={() => setView('stac')}>🛰 Satellite</Tab>
        <Tab active={view === 'upload'} onClick={() => setView('upload')}>📁 Upload</Tab>
        <Tab active={view === 'datasets'} onClick={() => setView('datasets')}>
          📊 Datasets {datasets.length > 0 ? `(${datasets.length})` : ''}
        </Tab>
      </TabRow>

      <Section>
        {view === 'upload' && <UploadView onUploaded={refreshDatasets} />}
        {view === 'stac' && <STACView onImported={refreshDatasets} />}
        {view === 'datasets' && (
          <DatasetsView
            datasets={datasets}
            loading={dsLoading}
            onRefresh={refreshDatasets}
            onDelete={handleDelete}
          />
        )}
      </Section>
    </Panel>
  );
};

// ─── Data Icon ───────────────────────────────────────

const DataIcon = (props: any) => (
  <svg viewBox="0 0 24 24" width={props.height || '18px'} height={props.height || '18px'} fill="none" stroke="currentColor">
    <ellipse cx="12" cy="6" rx="8" ry="3" strokeWidth="1.5" />
    <path d="M4 6v6c0 1.66 3.58 3 8 3s8-1.34 8-3V6" strokeWidth="1.5" />
    <path d="M4 12v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" strokeWidth="1.5" />
  </svg>
);

// ─── Factory ─────────────────────────────────────────

function DataTabFactory() {
  const DataTab: any = () => null;

  DataTab.panels = [
    {
      id: 'data',
      label: 'Data',
      iconComponent: DataIcon,
      component: DataPanelContent,
    }
  ];

  DataTab.getProps = () => ({});
  return DataTab;
}

DataTabFactory.deps = [];

export default DataTabFactory;
