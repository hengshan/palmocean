// Data Tab — Satellite Data Search, Download & Load to Map
// STAC search (Planetary Computer, Earth Search, Copernicus) + future GEE
import React, {useState, useEffect, useCallback} from 'react';
import styled from 'styled-components';

const API_BASE =
  (typeof process !== 'undefined' && process.env?.PALMVIEW_API_URL) ||
  'http://100.81.217.18:8000';

// ─── Types ───────────────────────────────────────────

interface STACProvider {
  name: string;
  url: string;
  requires_auth: boolean;
  popular_collections: string[];
}

interface STACCollection {
  id: string;
  title?: string;
  description?: string;
}

interface STACSearchItem {
  id: string;
  collection: string;
  datetime: string;
  bbox: number[];
  properties: Record<string, any>;
  assets: Record<string, { href: string; type?: string; title?: string }>;
  links?: Array<{ rel: string; href: string }>;
}

// ─── Styled Components ───────────────────────────────

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

const SourceToggle = styled.div`
  display: flex;
  gap: 0;
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 10px;
  border: 1px solid ${(p: any) => p.theme?.borderColor || 'rgba(255,255,255,0.1)'};
`;

const SourceBtn = styled.button<{active?: boolean}>`
  flex: 1;
  background: ${(p: any) => p.active ? p.theme?.activeColor || '#1FBF6E' : 'transparent'};
  color: ${(p: any) => p.active ? '#fff' : p.theme?.textColor || '#A0A7B4'};
  border: none;
  padding: 8px;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
  &:hover { opacity: 0.85; }
`;

const Select = styled.select`
  width: 100%;
  background: ${(p: any) => p.theme?.inputBgd || '#161b22'};
  color: ${(p: any) => p.theme?.textColor || '#A0A7B4'};
  border: 1px solid ${(p: any) => p.theme?.borderColor || 'rgba(255,255,255,0.1)'};
  border-radius: 4px;
  padding: 7px 8px;
  font-size: 11px;
  outline: none;
  &:focus { border-color: ${(p: any) => p.theme?.activeColor || '#1FBF6E'}; }
`;

const Input = styled.input`
  width: 100%;
  background: ${(p: any) => p.theme?.inputBgd || '#161b22'};
  color: ${(p: any) => p.theme?.textColor || '#A0A7B4'};
  border: 1px solid ${(p: any) => p.theme?.borderColor || 'rgba(255,255,255,0.1)'};
  border-radius: 4px;
  padding: 7px 8px;
  font-size: 11px;
  outline: none;
  &:focus { border-color: ${(p: any) => p.theme?.activeColor || '#1FBF6E'}; }
  &::placeholder { color: ${(p: any) => p.theme?.subtextColor || '#6A7485'}; }
`;

const Row = styled.div`
  display: flex;
  gap: 6px;
  align-items: center;
`;

const Label = styled.label`
  font-size: 10px;
  color: ${(p: any) => p.theme?.subtextColor || '#6A7485'};
  margin-bottom: 2px;
  display: block;
`;

const Btn = styled.button<{primary?: boolean; small?: boolean; danger?: boolean}>`
  background: ${(p: any) =>
    p.danger ? '#F9042C' :
    p.primary ? p.theme?.activeColor || '#1FBF6E' :
    p.theme?.panelBackground || 'rgba(255,255,255,0.06)'};
  color: ${(p: any) => (p.primary || p.danger) ? '#fff' : p.theme?.textColor || '#A0A7B4'};
  border: 1px solid ${(p: any) => (p.primary || p.danger) ? 'transparent' : p.theme?.borderColor || 'rgba(255,255,255,0.1)'};
  border-radius: 4px;
  padding: ${(p: any) => p.small ? '4px 8px' : '8px 12px'};
  font-size: ${(p: any) => p.small ? '10px' : '11px'};
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
  &:hover { opacity: 0.85; }
  &:disabled { opacity: 0.4; cursor: not-allowed; }
`;

const ResultCard = styled.div`
  display: flex;
  gap: 10px;
  padding: 10px;
  background: ${(p: any) => p.theme?.panelBackground || 'rgba(0,0,0,0.2)'};
  border-radius: 4px;
  margin-top: 6px;
  border: 1px solid transparent;
  transition: border-color 0.15s;
  &:hover { border-color: ${(p: any) => p.theme?.activeColor || '#1FBF6E'}; }
`;

const Thumb = styled.img`
  width: 64px;
  height: 64px;
  border-radius: 4px;
  object-fit: cover;
  background: rgba(0,0,0,0.3);
  flex-shrink: 0;
`;

const ThumbPlaceholder = styled.div`
  width: 64px;
  height: 64px;
  border-radius: 4px;
  background: rgba(255,255,255,0.05);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  flex-shrink: 0;
`;

const Muted = styled.span`
  color: ${(p: any) => p.theme?.subtextColor || '#6A7485'};
  font-size: 10px;
`;

const Badge = styled.span<{color?: string}>`
  background: ${(p: any) => p.color || 'rgba(255,255,255,0.1)'};
  color: #fff;
  font-size: 9px;
  padding: 2px 6px;
  border-radius: 8px;
  font-weight: 500;
`;

const SliderRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
`;

const Slider = styled.input`
  flex: 1;
  accent-color: ${(p: any) => p.theme?.activeColor || '#1FBF6E'};
`;

const EmptyMsg = styled.p`
  color: ${(p: any) => p.theme?.subtextColor || '#6A7485'};
  font-size: 11px;
  font-style: italic;
  text-align: center;
  padding: 16px 0;
  margin: 0;
`;

const Divider = styled.div`
  height: 1px;
  background: ${(p: any) => p.theme?.borderColor || 'rgba(255,255,255,0.08)'};
  margin: 4px 0;
`;

// ─── Helper ──────────────────────────────────────────

function formatDate(iso: string): string {
  return iso?.slice(0, 10) || '—';
}

function getCloudCover(props: Record<string, any>): number | null {
  return props['eo:cloud_cover'] ?? props['cloudcover'] ?? null;
}

function getThumbnail(item: STACSearchItem): string | null {
  const thumb = item.assets?.thumbnail?.href || item.assets?.rendered_preview?.href;
  if (thumb) return thumb;
  // Try links
  const link = item.links?.find(l => l.rel === 'preview' || l.rel === 'thumbnail');
  return link?.href || null;
}

// ─── GEE Types ───────────────────────────────────────

interface GEECollection {
  id: string;
  name: string;
  description?: string;
  temporal_range?: string;
}

interface GEESearchResult {
  id: string;
  date: string;
  cloud_cover?: number;
  bounds?: number[];
  thumbnail_url?: string;
  properties?: Record<string, any>;
}

// ─── GEE Panel ───────────────────────────────────────

const GEEPanel = () => {
  const [collections, setCollections] = useState<GEECollection[]>([]);
  const [selectedCollection, setSelectedCollection] = useState('COPERNICUS/S2_SR_HARMONIZED');
  const [dateFrom, setDateFrom] = useState('2025-01-01');
  const [dateTo, setDateTo] = useState('2025-12-31');
  const [maxCloud, setMaxCloud] = useState(30);
  const [results, setResults] = useState<GEESearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [geeStatus, setGeeStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking');
  const [loadingThumb, setLoadingThumb] = useState<string | null>(null);

  // Check GEE status + load collections on mount
  useEffect(() => {
    fetch(`${API_BASE}/api/v1/data/gee/status`)
      .then(r => r.json())
      .then(data => setGeeStatus(data.status === 'connected' ? 'connected' : 'disconnected'))
      .catch(() => setGeeStatus('disconnected'));

    fetch(`${API_BASE}/api/v1/data/gee/collections`)
      .then(r => r.json())
      .then(data => setCollections(Array.isArray(data) ? data : []))
      .catch(console.error);
  }, []);

  const handleSearch = useCallback(async () => {
    const map = (window as any).__PALMVIEW_MAP;
    if (!map) {
      setSearchError('Map not ready — please wait for map to load');
      return;
    }
    setSearching(true);
    setSearchError(null);
    setResults([]);
    try {
      const bounds = map.getBounds();
      const bbox = [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()];

      const url = new URL(`${API_BASE}/api/v1/data/gee/search`);
      url.searchParams.set('collection', selectedCollection);
      url.searchParams.set('bbox', bbox.join(','));
      url.searchParams.set('start_date', dateFrom);
      url.searchParams.set('end_date', dateTo);
      url.searchParams.set('max_cloud_cover', String(maxCloud));
      url.searchParams.set('limit', '20');

      const res = await fetch(url.toString());
      if (!res.ok) throw new Error(`GEE search failed: ${res.status}`);
      const data = await res.json();
      setResults(Array.isArray(data) ? data : data.images || data.results || []);
    } catch (err: any) {
      setSearchError(err.message);
    } finally {
      setSearching(false);
    }
  }, [selectedCollection, dateFrom, dateTo, maxCloud]);

  const handleLoadThumbnail = useCallback(async (item: GEESearchResult) => {
    const map = (window as any).__PALMVIEW_MAP;
    if (!map || !item.thumbnail_url) return;

    setLoadingThumb(item.id);
    try {
      // Use GEE thumbnail as image overlay on map
      const bounds = map.getBounds();
      const west = bounds.getWest(), south = bounds.getSouth();
      const east = bounds.getEast(), north = bounds.getNorth();

      // If item has bounds, use those; otherwise use current viewport
      const [w, s, e, n] = item.bounds || [west, south, east, north];

      const sourceId = `gee-${item.id}`;
      const layerId = `gee-layer-${item.id}`;

      if (map.getSource(sourceId)) {
        // Already loaded
        return;
      }

      map.addSource(sourceId, {
        type: 'image',
        url: item.thumbnail_url,
        coordinates: [[w, n], [e, n], [e, s], [w, s]]
      });
      map.addLayer({id: layerId, type: 'raster', source: sourceId});
      console.log('[GEE] Thumbnail overlay added:', layerId);
    } catch (err: any) {
      console.error('[GEE] Load thumbnail failed:', err);
    } finally {
      setLoadingThumb(null);
    }
  }, []);

  if (geeStatus === 'checking') {
    return <EmptyMsg>⏳ Checking GEE connection...</EmptyMsg>;
  }
  if (geeStatus === 'disconnected') {
    return <EmptyMsg>⚠️ GEE service not available. Please check backend configuration.</EmptyMsg>;
  }

  return (
    <>
      <Section>
        <SectionTitle>🌍 Google Earth Engine</SectionTitle>
        <Badge color="#22c55e">✓ Connected</Badge>

        <div style={{height: 8}} />

        <Label>Collection</Label>
        <Select value={selectedCollection} onChange={e => setSelectedCollection(e.target.value)}>
          {collections.map(c => (
            <option key={c.id} value={c.id}>{c.name || c.id}</option>
          ))}
        </Select>

        <div style={{height: 6}} />

        <Row>
          <div style={{flex: 1}}>
            <Label>From</Label>
            <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          </div>
          <div style={{flex: 1}}>
            <Label>To</Label>
            <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
          </div>
        </Row>

        <div style={{height: 6}} />

        <Label>Max Cloud Cover: {maxCloud}%</Label>
        <SliderRow>
          <Slider
            type="range" min={0} max={100}
            value={maxCloud}
            onChange={e => setMaxCloud(Number(e.target.value))}
          />
          <Muted>{maxCloud}%</Muted>
        </SliderRow>
      </Section>

      <Btn primary onClick={handleSearch} disabled={searching} style={{width: '100%'}}>
        {searching ? '🔍 Searching GEE...' : '📍 Search Current View (GEE)'}
      </Btn>

      {searchError && <Muted style={{color: '#F9042C'}}>⚠️ {searchError}</Muted>}

      {results.length > 0 && (
        <Section>
          <SectionTitle>🌍 Results ({results.length})</SectionTitle>
          {results.map(item => {
            const cc = item.cloud_cover;
            return (
              <ResultCard key={item.id}>
                {item.thumbnail_url ? (
                  <Thumb src={item.thumbnail_url} alt={item.id} />
                ) : (
                  <ThumbPlaceholder>🌍</ThumbPlaceholder>
                )}
                <div style={{flex: 1, minWidth: 0}}>
                  <div style={{fontWeight: 500, fontSize: 11, color: '#D3D8E0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>
                    {item.id}
                  </div>
                  <div style={{display: 'flex', gap: 4, marginTop: 3, flexWrap: 'wrap'}}>
                    <Badge>📅 {item.date}</Badge>
                    {cc != null && (
                      <Badge color={cc < 10 ? '#22c55e' : cc < 30 ? '#eab308' : '#F9042C'}>
                        ☁️ {Math.round(cc)}%
                      </Badge>
                    )}
                  </div>
                  <Row style={{marginTop: 6}}>
                    {item.thumbnail_url && (
                      <Btn small primary onClick={() => handleLoadThumbnail(item)} disabled={loadingThumb === item.id}>
                        {loadingThumb === item.id ? '⏳...' : '🗺️ Preview on Map'}
                      </Btn>
                    )}
                  </Row>
                </div>
              </ResultCard>
            );
          })}
        </Section>
      )}

      {!searching && results.length === 0 && !searchError && (
        <EmptyMsg>Navigate to an area of interest, then search. GEE will find imagery for the current map view.</EmptyMsg>
      )}
    </>
  );
};

// ─── Data Panel Content ──────────────────────────────

const DataPanelContent = () => {
  // Source toggle
  const [source, setSource] = useState<'stac' | 'gee'>('stac');

  // STAC state
  const [providers, setProviders] = useState<Record<string, STACProvider>>({});
  const [selectedProvider, setSelectedProvider] = useState('planetary-computer');
  const [collections, setCollections] = useState<STACCollection[]>([]);
  const [selectedCollection, setSelectedCollection] = useState('sentinel-2-l2a');
  const [dateFrom, setDateFrom] = useState('2025-01-01');
  const [dateTo, setDateTo] = useState('2025-12-31');
  const [maxCloud, setMaxCloud] = useState(30);
  const [bboxStr, setBboxStr] = useState('103.6,1.2,104.0,1.45'); // Singapore default

  // Results
  const [results, setResults] = useState<STACSearchItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Download/Load state
  const [downloading, setDownloading] = useState<string | null>(null);
  // Loaded raster layers (managed outside Kepler)
  const [loadedLayers, setLoadedLayers] = useState<Array<{id: string; itemId: string; visible: boolean}>>([]);

  // Load providers
  useEffect(() => {
    fetch(`${API_BASE}/api/v1/data/stac/providers`)
      .then(r => r.json())
      .then(setProviders)
      .catch(console.error);
  }, []);

  // Load collections when provider changes
  useEffect(() => {
    if (!selectedProvider) return;
    setCollections([]);
    fetch(`${API_BASE}/api/v1/data/stac/${selectedProvider}/collections`)
      .then(r => r.json())
      .then(data => {
        const cols = Array.isArray(data) ? data : [];
        setCollections(cols);
        // Auto-select first popular or first available
        const popular = providers[selectedProvider]?.popular_collections;
        if (popular?.length) {
          const match = cols.find((c: any) => popular.includes(typeof c === 'string' ? c : c.id));
          if (match) setSelectedCollection(typeof match === 'string' ? match : match.id);
        }
      })
      .catch(console.error);
  }, [selectedProvider, providers]);

  // Search
  const handleSearch = useCallback(async () => {
    setSearching(true);
    setSearchError(null);
    setResults([]);
    try {
      const bbox = bboxStr.split(',').map(Number);
      if (bbox.length !== 4 || bbox.some(isNaN)) throw new Error('Invalid bbox format');

      const url = new URL(`${API_BASE}/api/v1/data/stac/${selectedProvider}/search`);
      url.searchParams.set('collection', selectedCollection);
      url.searchParams.set('bbox', bbox.join(','));
      url.searchParams.set('datetime', `${dateFrom}/${dateTo}`);
      url.searchParams.set('limit', '20');

      const res = await fetch(url.toString());
      if (!res.ok) throw new Error(`Search failed: ${res.status}`);
      const data = await res.json();

      let items: STACSearchItem[] = Array.isArray(data) ? data :
        data.features || data.items || [];

      // Filter by cloud cover client-side
      items = items.filter(item => {
        const cc = getCloudCover(item.properties);
        return cc === null || cc <= maxCloud;
      });

      setResults(items);
    } catch (err: any) {
      setSearchError(err.message);
    } finally {
      setSearching(false);
    }
  }, [selectedProvider, selectedCollection, bboxStr, dateFrom, dateTo, maxCloud]);

  // Load raster to map via mapbox raster source
  // Kepler can't handle GeoTIFF natively — use mapbox addSource/addLayer (#90)
  const handleLoadToMap = useCallback(async (item: STACSearchItem) => {
    const map = (window as any).__PALMVIEW_MAP;
    if (!map) {
      console.error('[Data] Map ref not available — cannot load raster layer');
      return;
    }

    setDownloading(item.id);
    try {
      const layerId = `stac-${item.id}-${Date.now()}`;
      const sourceId = `src-${layerId}`;

      // 1. Try tile URL from backend
      let loaded = false;
      try {
        const res = await fetch(
          `${API_BASE}/api/v1/data/stac/${selectedProvider}/${selectedCollection}/${item.id}/tile-url?asset_key=visual`
        );
        if (res.ok) {
          const data = await res.json();
          const tileUrl = data.tile_url || data.url;
          if (tileUrl) {
            map.addSource(sourceId, {type: 'raster', tiles: [tileUrl], tileSize: 256});
            map.addLayer({id: layerId, type: 'raster', source: sourceId});
            loaded = true;
            console.log('[Data] Raster tile layer added:', layerId);
          }
        }
      } catch (e) {
        console.warn('[Data] tile-url fallback:', e);
      }

      // 2. Fallback: COG asset href as image overlay
      if (!loaded) {
        const cogHref = item.assets?.visual?.href || item.assets?.['B04']?.href;
        if (cogHref && item.bbox) {
          const [west, south, east, north] = item.bbox;
          map.addSource(sourceId, {
            type: 'image',
            url: cogHref,
            coordinates: [[west,north],[east,north],[east,south],[west,south]]
          });
          map.addLayer({id: layerId, type: 'raster', source: sourceId});
          loaded = true;
          console.log('[Data] Image overlay added:', layerId);
        }
      }

      if (!loaded) throw new Error('No tile URL or COG asset available');

      setLoadedLayers(prev => [...prev, {id: layerId, itemId: item.id, visible: true}]);

    } catch (err: any) {
      console.error('[Data] Load to map failed:', err);
    } finally {
      setDownloading(null);
    }
  }, [selectedProvider, selectedCollection]);

  // Remove loaded layer from mapbox + state
  const handleRemoveLayer = useCallback((layerId: string) => {
    const map = (window as any).__PALMVIEW_MAP;
    if (map) {
      try {
        if (map.getLayer(layerId)) map.removeLayer(layerId);
        const sourceId = `src-${layerId}`;
        if (map.getSource(sourceId)) map.removeSource(sourceId);
      } catch (e) {
        console.warn('[Data] Error removing layer:', e);
      }
    }
    setLoadedLayers(prev => prev.filter(l => l.id !== layerId));
  }, []);

  return (
    <Panel>
      {/* Source Toggle */}
      <SourceToggle>
        <SourceBtn active={source === 'stac'} onClick={() => setSource('stac')}>
          🛰 STAC Satellite
        </SourceBtn>
        <SourceBtn active={source === 'gee'} onClick={() => setSource('gee')}>
          🌍 Google Earth Engine
        </SourceBtn>
      </SourceToggle>

      {source === 'gee' ? (
        <GEEPanel />
      ) : (
        <>
          {/* Provider + Collection */}
          <Section>
            <SectionTitle>🛰 Data Source</SectionTitle>

            <Label>Provider</Label>
            <Select value={selectedProvider} onChange={e => setSelectedProvider(e.target.value)}>
              {Object.entries(providers).map(([key, p]) => (
                <option key={key} value={key}>{p.name}</option>
              ))}
            </Select>

            <div style={{height: 6}} />

            <Label>Collection</Label>
            <Select value={selectedCollection} onChange={e => setSelectedCollection(e.target.value)}>
              {/* Popular collections first */}
              {providers[selectedProvider]?.popular_collections?.map(c => (
                <option key={c} value={c}>⭐ {c}</option>
              ))}
              <option disabled>──────────</option>
              {collections.map(c => {
                const id = typeof c === 'string' ? c : c.id;
                const title = typeof c === 'string' ? c : c.title || c.id;
                return <option key={id} value={id}>{title}</option>;
              })}
            </Select>
          </Section>

          {/* Search Parameters */}
          <Section>
            <SectionTitle>🔍 Search Parameters</SectionTitle>

            <Label>Bounding Box (west, south, east, north)</Label>
            <Row>
              <Input
                style={{flex: 1}}
                value={bboxStr}
                onChange={e => setBboxStr(e.target.value)}
                placeholder="103.6,1.2,104.0,1.45"
              />
              <Btn small onClick={() => {
                const map = (window as any).__PALMVIEW_MAP;
                if (map) {
                  const bounds = map.getBounds();
                  const bbox = [
                    bounds.getWest().toFixed(4),
                    bounds.getSouth().toFixed(4),
                    bounds.getEast().toFixed(4),
                    bounds.getNorth().toFixed(4),
                  ].join(',');
                  setBboxStr(bbox);
                } else {
                  console.warn('[Data] Map ref not available yet');
                }
              }} title="Use current map view">
                📍 Current View
              </Btn>
            </Row>

            <div style={{height: 6}} />

            <Row>
              <div style={{flex: 1}}>
                <Label>From</Label>
                <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
              </div>
              <div style={{flex: 1}}>
                <Label>To</Label>
                <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
              </div>
            </Row>

            <div style={{height: 6}} />

            <Label>Max Cloud Cover: {maxCloud}%</Label>
            <SliderRow>
              <Slider
                type="range"
                min={0}
                max={100}
                value={maxCloud}
                onChange={e => setMaxCloud(Number(e.target.value))}
              />
              <Muted>{maxCloud}%</Muted>
            </SliderRow>
          </Section>

          {/* Search Button */}
          <Btn primary onClick={handleSearch} disabled={searching} style={{width: '100%'}}>
            {searching ? '🔍 Searching...' : '🔍 Search Satellite Data'}
          </Btn>

          {searchError && <Muted style={{color: '#F9042C'}}>⚠️ {searchError}</Muted>}

          {/* Results */}
          {results.length > 0 && (
            <Section>
              <SectionTitle>📡 Results ({results.length})</SectionTitle>
              {results.map(item => {
                const thumb = getThumbnail(item);
                const cc = getCloudCover(item.properties);
                const isDownloading = downloading === item.id;

                return (
                  <ResultCard key={item.id}>
                    {thumb ? (
                      <Thumb src={thumb} alt={item.id} />
                    ) : (
                      <ThumbPlaceholder>🛰</ThumbPlaceholder>
                    )}
                    <div style={{flex: 1, minWidth: 0}}>
                      <div style={{
                        fontWeight: 500,
                        fontSize: 11,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        color: '#D3D8E0'
                      }}>
                        {item.id}
                      </div>
                      <div style={{display: 'flex', gap: 4, marginTop: 3, flexWrap: 'wrap'}}>
                        <Badge>📅 {formatDate(item.datetime)}</Badge>
                        {cc !== null && (
                          <Badge color={cc < 10 ? '#22c55e' : cc < 30 ? '#eab308' : '#F9042C'}>
                            ☁️ {Math.round(cc)}%
                          </Badge>
                        )}
                      </div>
                      <Row style={{marginTop: 6}}>
                        <Btn small primary onClick={() => handleLoadToMap(item)} disabled={isDownloading}>
                          {isDownloading ? '⏳ Loading...' : '🗺️ Load to Map'}
                        </Btn>
                        {loadedLayers.some(l => l.itemId === item.id) && (
                          <Badge color="#1FBF6E">✓ Loaded</Badge>
                        )}
                      </Row>
                    </div>
                  </ResultCard>
                );
              })}
            </Section>
          )}

          {/* Loaded Raster Layers */}
          {loadedLayers.length > 0 && (
            <Section>
              <SectionTitle>🗺️ Loaded Layers ({loadedLayers.length})</SectionTitle>
              {loadedLayers.map(layer => (
                <Row key={layer.id} style={{justifyContent: 'space-between', padding: '4px 0'}}>
                  <Muted style={{fontSize: 11}}>{layer.itemId}</Muted>
                  <Btn small danger onClick={() => handleRemoveLayer(layer.id)}>✕</Btn>
                </Row>
              ))}
            </Section>
          )}

          {!searching && results.length === 0 && !searchError && (
            <EmptyMsg>Search for satellite imagery above. Results will appear here.</EmptyMsg>
          )}
        </>
      )}
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
  DataTab.panels = [{
    id: 'data',
    label: 'Data',
    iconComponent: DataIcon,
    component: DataPanelContent,
  }];
  DataTab.getProps = () => ({});
  return DataTab;
}

DataTabFactory.deps = [];

export default DataTabFactory;
