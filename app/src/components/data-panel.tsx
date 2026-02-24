// Data Tab — Satellite Data Search, Download & Load to Map
// STAC search (Planetary Computer, Earth Search, Copernicus) + GEE + Local Upload
// State is persisted in raster-state.ts so it survives panel switches.
import React, {useState, useEffect, useCallback, useRef, useSyncExternalStore} from 'react';
import styled from 'styled-components';
import {fromArrayBuffer} from 'geotiff';
import {
  getMapState,
  subscribe,
  updateDataTab,
  addLoadedLayer,
  removeLoadedLayer,
  updateLoadedLayer,
  toggleLayerVisibility,
  updateLayerOpacity,
  attachStyleListener,
  type STACSearchItemPersist,
  type LoadedLayerInfo,
  type DataTabState,
} from '../palmview/raster-state';

const API_BASE =
  (typeof process !== 'undefined' && process.env?.PALMVIEW_API_URL) ||
  'http://100.81.217.18:8000';

// ─── Hook: subscribe to dataTab state ────────────────

function useDataTab(): DataTabState {
  return useSyncExternalStore(
    subscribe,
    () => getMapState().dataTab
  );
}

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
  border: 1px solid ${(p: any) => p.theme?.borderColor || 'rgba(255,255,255,0.1)'};
  flex-shrink: 0;
`;

const SourceBtn = styled.button<{$active?: boolean}>`
  flex: 1;
  background: ${(p: any) => p.$active ? p.theme?.activeColor || '#1FBF6E' : 'transparent'};
  color: ${(p: any) => p.$active ? '#fff' : p.theme?.textColor || '#A0A7B4'};
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

const Btn = styled.button<{$primary?: boolean; $small?: boolean; $danger?: boolean}>`
  background: ${(p: any) =>
    p.$danger ? '#F9042C' :
    p.$primary ? p.theme?.activeColor || '#1FBF6E' :
    p.theme?.panelBackground || 'rgba(255,255,255,0.06)'};
  color: ${(p: any) => (p.$primary || p.$danger) ? '#fff' : p.theme?.textColor || '#A0A7B4'};
  border: 1px solid ${(p: any) => (p.$primary || p.$danger) ? 'transparent' : p.theme?.borderColor || 'rgba(255,255,255,0.1)'};
  border-radius: 4px;
  padding: ${(p: any) => p.$small ? '4px 8px' : '8px 12px'};
  font-size: ${(p: any) => p.$small ? '10px' : '11px'};
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

const Badge = styled.span<{$color?: string}>`
  background: ${(p: any) => p.$color || 'rgba(255,255,255,0.1)'};
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

const DropZone = styled.div<{$active?: boolean}>`
  border: 2px dashed ${(p: any) => p.$active ? p.theme?.activeColor || '#1FBF6E' : p.theme?.borderColor || 'rgba(255,255,255,0.15)'};
  border-radius: 4px;
  padding: 24px 16px;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s;
  background: ${(p: any) => p.$active ? 'rgba(31,191,110,0.08)' : 'transparent'};
  &:hover { border-color: ${(p: any) => p.theme?.activeColor || '#1FBF6E'}; background: rgba(31,191,110,0.04); }
`;

const OpacitySlider = styled.input`
  width: 60px;
  accent-color: ${(p: any) => p.theme?.activeColor || '#1FBF6E'};
  height: 3px;
`;

const LayerItem = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 0;
  border-bottom: 1px solid rgba(255,255,255,0.04);
  &:last-child { border-bottom: none; }
`;

const LayerName = styled.span`
  flex: 1;
  font-size: 11px;
  color: ${(p: any) => p.theme?.textColor || '#A0A7B4'};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
`;

const IconBtn = styled.button<{$dim?: boolean}>`
  background: none;
  border: none;
  cursor: pointer;
  font-size: 13px;
  padding: 2px 4px;
  opacity: ${(p: any) => p.$dim ? 0.35 : 0.8};
  transition: opacity 0.15s;
  &:hover { opacity: 1; }
`;

const EmptyMsg = styled.p`
  color: ${(p: any) => p.theme?.subtextColor || '#6A7485'};
  font-size: 11px;
  font-style: italic;
  text-align: center;
  padding: 16px 0;
  margin: 0;
`;

// ─── Helper ──────────────────────────────────────────

function formatDate(iso: string): string {
  return iso?.slice(0, 10) || '—';
}

function getCloudCover(props: Record<string, any>): number | null {
  return props['eo:cloud_cover'] ?? props['cloudcover'] ?? null;
}

function getThumbnail(item: STACSearchItemPersist): string | null {
  const thumb = item.assets?.thumbnail?.href || item.assets?.rendered_preview?.href;
  if (thumb) return thumb;
  const link = item.links?.find(l => l.rel === 'preview' || l.rel === 'thumbnail');
  return link?.href || null;
}

/** Get the map instance and ensure style listener is attached */
function getMap(): any {
  const map = (window as any).__PALMVIEW_MAP;
  if (map) attachStyleListener();
  return map;
}

/** Find first symbol layer id for inserting raster beneath labels */
function getFirstSymbolId(map: any): string | undefined {
  return map.getStyle()?.layers?.find((l: any) => l.type === 'symbol')?.id;
}

/** Add a raster layer to the map, returns true on success */
function addRasterToMap(
  map: any,
  layerId: string,
  sourceId: string,
  opts: { tileUrl?: string; imageUrl?: string; bbox?: [number, number, number, number] }
): boolean {
  const firstSymbolId = getFirstSymbolId(map);
  try {
    if (opts.tileUrl) {
      map.addSource(sourceId, { type: 'raster', tiles: [opts.tileUrl], tileSize: 256 });
    } else if (opts.imageUrl && opts.bbox) {
      const [west, south, east, north] = opts.bbox;
      map.addSource(sourceId, {
        type: 'image',
        url: opts.imageUrl,
        coordinates: [[west, north], [east, north], [east, south], [west, south]],
      });
    } else {
      return false;
    }
    map.addLayer(
      { id: layerId, type: 'raster', source: sourceId, paint: { 'raster-opacity': 0.85 } },
      firstSymbolId
    );
    return true;
  } catch (e) {
    console.error('[Data] addRasterToMap failed:', e);
    return false;
  }
}

// ─── GEE Panel ───────────────────────────────────────

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

const GEEPanel = () => {
  const dt = useDataTab();
  const [collections, setCollections] = useState<GEECollection[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [loadingThumb, setLoadingThumb] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/api/v1/data/gee/status`)
      .then(r => r.json())
      .then(data => updateDataTab({ geeStatus: data.status === 'connected' ? 'connected' : 'disconnected' }))
      .catch(() => updateDataTab({ geeStatus: 'disconnected' }));

    fetch(`${API_BASE}/api/v1/data/gee/collections`)
      .then(r => r.json())
      .then(data => setCollections(Array.isArray(data) ? data : []))
      .catch(console.error);
  }, []);

  const handleSearch = useCallback(async () => {
    const map = getMap();
    if (!map) {
      setSearchError('Map not ready');
      return;
    }
    setSearching(true);
    setSearchError(null);
    updateDataTab({ geeResults: [] });
    try {
      const bounds = map.getBounds();
      const bbox = [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()];
      const url = new URL(`${API_BASE}/api/v1/data/gee/search`);
      url.searchParams.set('collection', dt.geeCollection);
      url.searchParams.set('bbox', bbox.join(','));
      url.searchParams.set('start_date', dt.geeDateFrom);
      url.searchParams.set('end_date', dt.geeDateTo);
      url.searchParams.set('max_cloud_cover', String(dt.geeMaxCloud));
      url.searchParams.set('limit', '20');

      const res = await fetch(url.toString());
      if (!res.ok) throw new Error(`GEE search failed: ${res.status}`);
      const data = await res.json();
      updateDataTab({ geeResults: Array.isArray(data) ? data : data.images || data.results || [] });
    } catch (err: any) {
      setSearchError(err.message);
    } finally {
      setSearching(false);
    }
  }, [dt.geeCollection, dt.geeDateFrom, dt.geeDateTo, dt.geeMaxCloud]);

  const handleLoadThumbnail = useCallback(async (item: GEESearchResult) => {
    const map = getMap();
    if (!map || !item.thumbnail_url) return;
    setLoadingThumb(item.id);
    try {
      const bounds = map.getBounds();
      const [w, s, e, n] = item.bounds || [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()];
      const layerId = `gee-${item.id}-${Date.now()}`;
      const sourceId = `src-${layerId}`;
      const bbox: [number, number, number, number] = [w, s, e, n];

      if (map.getSource(sourceId)) return;

      const ok = addRasterToMap(map, layerId, sourceId, { imageUrl: item.thumbnail_url, bbox });
      if (ok) {
        map.fitBounds([[w, s], [e, n]], { padding: 40, maxZoom: 16 });
        addLoadedLayer({ id: layerId, itemId: item.id, sourceId, visible: true, sourceType: 'gee', opacity: 0.85, imageUrl: item.thumbnail_url, bbox });
        console.log('[GEE] Thumbnail overlay added:', layerId);
      }
    } catch (err: any) {
      console.error('[GEE] Load thumbnail failed:', err);
    } finally {
      setLoadingThumb(null);
    }
  }, []);

  if (dt.geeStatus === 'checking') return <EmptyMsg>⏳ Checking GEE connection...</EmptyMsg>;
  if (dt.geeStatus === 'disconnected') return <EmptyMsg>⚠️ GEE service not available.</EmptyMsg>;

  return (
    <>
      <Section>
        <SectionTitle>🌍 Google Earth Engine</SectionTitle>
        <Badge $color="#22c55e">✓ Connected</Badge>
        <div style={{height: 8}} />
        <Label>Collection</Label>
        <Select value={dt.geeCollection} onChange={e => updateDataTab({ geeCollection: e.target.value })}>
          {collections.map(c => <option key={c.id} value={c.id}>{c.name || c.id}</option>)}
        </Select>
        <div style={{height: 6}} />
        <Row>
          <div style={{flex: 1}}>
            <Label>From</Label>
            <Input type="date" value={dt.geeDateFrom} onChange={e => updateDataTab({ geeDateFrom: e.target.value })} />
          </div>
          <div style={{flex: 1}}>
            <Label>To</Label>
            <Input type="date" value={dt.geeDateTo} onChange={e => updateDataTab({ geeDateTo: e.target.value })} />
          </div>
        </Row>
        <div style={{height: 6}} />
        <Label>Max Cloud Cover: {dt.geeMaxCloud}%</Label>
        <SliderRow>
          <Slider type="range" min={0} max={100} value={dt.geeMaxCloud} onChange={e => updateDataTab({ geeMaxCloud: Number(e.target.value) })} />
          <Muted>{dt.geeMaxCloud}%</Muted>
        </SliderRow>
      </Section>

      <Btn $primary onClick={handleSearch} disabled={searching} style={{width: '100%'}}>
        {searching ? '🔍 Searching GEE...' : '📍 Search Current View (GEE)'}
      </Btn>
      {searchError && <Muted style={{color: '#F9042C'}}>⚠️ {searchError}</Muted>}

      {dt.geeResults.length > 0 && (
        <Section>
          <SectionTitle>🌍 Results ({dt.geeResults.length})</SectionTitle>
          {dt.geeResults.map((item: GEESearchResult) => {
            const cc = item.cloud_cover;
            return (
              <ResultCard key={item.id}>
                {item.thumbnail_url ? <Thumb src={item.thumbnail_url} alt={item.id} /> : <ThumbPlaceholder>🌍</ThumbPlaceholder>}
                <div style={{flex: 1, minWidth: 0}}>
                  <div style={{fontWeight: 500, fontSize: 11, color: '#D3D8E0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>{item.id}</div>
                  <div style={{display: 'flex', gap: 4, marginTop: 3, flexWrap: 'wrap'}}>
                    <Badge>📅 {item.date}</Badge>
                    {cc != null && <Badge $color={cc < 10 ? '#22c55e' : cc < 30 ? '#eab308' : '#F9042C'}>☁️ {Math.round(cc)}%</Badge>}
                  </div>
                  <Row style={{marginTop: 6}}>
                    {item.thumbnail_url && (
                      <Btn $small $primary onClick={() => handleLoadThumbnail(item)} disabled={loadingThumb === item.id}>
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

      {!searching && dt.geeResults.length === 0 && !searchError && (
        <Section style={{textAlign: 'center', padding: '24px 16px'}}>
          <div style={{fontSize: 28, marginBottom: 8}}>🌍</div>
          <div style={{color: '#D3D8E0', fontSize: 12, fontWeight: 500, marginBottom: 6}}>Ready to search Earth Engine</div>
          <EmptyMsg style={{textAlign: 'center', padding: 0}}>Navigate the map to your area of interest, then click "Search Current View".</EmptyMsg>
        </Section>
      )}
    </>
  );
};

// ─── Data Panel Content ──────────────────────────────

const DataPanelContent = () => {
  const dt = useDataTab();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Local ephemeral state (OK to lose)
  const [providers, setProviders] = useState<Record<string, STACProvider>>({});
  const [collections, setCollections] = useState<STACCollection[]>([]);
  const [searching, setSearching] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);

  // Attach style listener on mount
  useEffect(() => { attachStyleListener(); }, []);

  // Load providers once
  useEffect(() => {
    fetch(`${API_BASE}/api/v1/data/stac/providers`)
      .then(r => r.json())
      .then(setProviders)
      .catch(console.error);
  }, []);

  // Load collections when provider changes
  useEffect(() => {
    if (!dt.selectedProvider) return;
    setCollections([]);
    fetch(`${API_BASE}/api/v1/data/stac/${dt.selectedProvider}/collections`)
      .then(r => r.json())
      .then(data => {
        const cols = Array.isArray(data) ? data : [];
        setCollections(cols);
        const popular = providers[dt.selectedProvider]?.popular_collections;
        if (popular?.length) {
          const match = cols.find((c: any) => popular.includes(typeof c === 'string' ? c : c.id));
          if (match) updateDataTab({ selectedCollection: typeof match === 'string' ? match : match.id });
        }
      })
      .catch(console.error);
  }, [dt.selectedProvider, providers]);

  // Search
  const handleSearch = useCallback(async () => {
    setSearching(true);
    updateDataTab({ searchError: null, results: [] });
    try {
      const bbox = dt.bboxStr.split(',').map(Number);
      if (bbox.length !== 4 || bbox.some(isNaN)) throw new Error('Invalid bbox format');
      const url = new URL(`${API_BASE}/api/v1/data/stac/${dt.selectedProvider}/search`);
      url.searchParams.set('collection', dt.selectedCollection);
      url.searchParams.set('bbox', bbox.join(','));
      url.searchParams.set('datetime', `${dt.dateFrom}/${dt.dateTo}`);
      url.searchParams.set('limit', '20');

      const res = await fetch(url.toString());
      if (!res.ok) throw new Error(`Search failed: ${res.status}`);
      const data = await res.json();
      let items: STACSearchItemPersist[] = Array.isArray(data) ? data : data.features || data.items || [];
      items = items.filter(item => {
        const cc = getCloudCover(item.properties);
        return cc === null || cc <= dt.maxCloud;
      });
      updateDataTab({ results: items });
    } catch (err: any) {
      updateDataTab({ searchError: err.message });
    } finally {
      setSearching(false);
    }
  }, [dt.selectedProvider, dt.selectedCollection, dt.bboxStr, dt.dateFrom, dt.dateTo, dt.maxCloud]);

  // Load raster to map
  const handleLoadToMap = useCallback(async (item: STACSearchItemPersist) => {
    const map = getMap();
    if (!map) {
      console.error('[Data] Map ref not available');
      return;
    }
    setDownloading(item.id);
    try {
      const layerId = `stac-${item.id}-${Date.now()}`;
      const sourceId = `src-${layerId}`;
      let loaded = false;
      let tileUrl: string | undefined;
      let imageUrl: string | undefined;
      let bbox: [number, number, number, number] | undefined = item.bbox as any;

      // 1. Try tile URL from backend
      try {
        const res = await fetch(
          `${API_BASE}/api/v1/data/stac/${dt.selectedProvider}/${dt.selectedCollection}/${item.id}/tile-url?asset_key=visual`
        );
        if (res.ok) {
          const data = await res.json();
          tileUrl = data.tile_url || data.url;
          if (tileUrl) {
            console.log('[Data] Map instance:', map.constructor?.name);
            loaded = addRasterToMap(map, layerId, sourceId, { tileUrl });
            if (loaded) console.log('[Data] Raster tile layer added:', layerId);
          }
        }
      } catch (e) {
        console.warn('[Data] tile-url attempt failed:', e);
      }

      // 2. Fallback: thumbnail or rendered_preview as image overlay
      if (!loaded && item.bbox) {
        const thumbUrl = getThumbnail(item);
        const cogHref = item.assets?.visual?.href || item.assets?.rendered_preview?.href || thumbUrl;
        if (cogHref) {
          imageUrl = cogHref;
          console.log('[Data] Fallback image overlay:', cogHref, 'bbox:', item.bbox);
          loaded = addRasterToMap(map, layerId, sourceId, { imageUrl: cogHref, bbox });
          if (loaded) console.log('[Data] Image overlay added:', layerId);
        }
      }

      if (!loaded) throw new Error('No tile URL or image asset available');

      // 3. Fly to data extent
      if (item.bbox) {
        const [west, south, east, north] = item.bbox;
        map.fitBounds([[west, south], [east, north]], { padding: 50, maxZoom: 16 });
        console.log('[Data] fitBounds to:', item.bbox);
      }

      addLoadedLayer({ id: layerId, itemId: item.id, sourceId, visible: true, sourceType: 'stac', opacity: 0.85, tileUrl, imageUrl, bbox });
    } catch (err: any) {
      console.error('[Data] Load to map failed:', err);
    } finally {
      setDownloading(null);
    }
  }, [dt.selectedProvider, dt.selectedCollection]);

  // Local GeoTIFF upload
  const handleLocalUpload = useCallback(async (file: File) => {
    const map = getMap();
    if (!map) {
      updateDataTab({ uploadStatus: '❌ Map not ready' });
      return;
    }
    updateDataTab({ uploadStatus: `⏳ Reading ${file.name}...` });
    try {
      const arrayBuffer = await file.arrayBuffer();
      const tiff = await fromArrayBuffer(arrayBuffer);
      const image = await tiff.getImage();
      const [west, south, east, north] = image.getBoundingBox();
      const width = image.getWidth();
      const height = image.getHeight();
      const samplesPerPixel = image.getSamplesPerPixel();
      const rasters = await image.readRasters();

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      const imgData = ctx.createImageData(width, height);

      if (samplesPerPixel >= 3) {
        for (let i = 0; i < width * height; i++) {
          imgData.data[i * 4] = (rasters[0] as any)[i];
          imgData.data[i * 4 + 1] = (rasters[1] as any)[i];
          imgData.data[i * 4 + 2] = (rasters[2] as any)[i];
          imgData.data[i * 4 + 3] = samplesPerPixel >= 4 ? (rasters[3] as any)[i] : 255;
        }
      } else {
        const band = rasters[0] as any;
        let min = Infinity, max = -Infinity;
        for (let i = 0; i < band.length; i++) {
          if (band[i] !== 0) {
            if (band[i] < min) min = band[i];
            if (band[i] > max) max = band[i];
          }
        }
        const range = max - min || 1;
        for (let i = 0; i < width * height; i++) {
          const v = Math.round(((band[i] - min) / range) * 255);
          imgData.data[i * 4] = v;
          imgData.data[i * 4 + 1] = v;
          imgData.data[i * 4 + 2] = v;
          imgData.data[i * 4 + 3] = band[i] === 0 ? 0 : 255;
        }
      }

      ctx.putImageData(imgData, 0, 0);
      const dataUrl = canvas.toDataURL('image/png');
      const layerId = `local-${Date.now()}`;
      const sourceId = `src-${layerId}`;
      const bbox: [number, number, number, number] = [west, south, east, north];

      const ok = addRasterToMap(map, layerId, sourceId, { imageUrl: dataUrl, bbox });
      if (ok) {
        map.fitBounds([[west, south], [east, north]], { padding: 50, maxZoom: 16 });
        addLoadedLayer({ id: layerId, itemId: file.name, sourceId, visible: true, sourceType: 'local', opacity: 0.85, imageUrl: dataUrl, bbox });
        updateDataTab({ uploadStatus: `✅ ${file.name} loaded` });
        console.log('[Upload] Local GeoTIFF loaded:', file.name);
      } else {
        throw new Error('Failed to add to map');
      }
    } catch (err: any) {
      console.error('[Upload] Failed:', err);
      updateDataTab({ uploadStatus: `❌ ${err.message}` });
    }
  }, []);

  // Local GeoJSON/CSV upload
  const handleLocalUploadVector = useCallback(async (file: File) => {
    const map = getMap();
    if (!map) {
      updateDataTab({ uploadStatus: '❌ Map not ready' });
      return;
    }
    updateDataTab({ uploadStatus: `⏳ Reading ${file.name}...` });
    try {
      const text = await file.text();
      let geojson: any;

      if (file.name.endsWith('.csv')) {
        // Simple CSV to GeoJSON: expects lat/lng or latitude/longitude columns
        const lines = text.trim().split('\n');
        const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
        const latIdx = headers.findIndex(h => ['lat', 'latitude', 'y'].includes(h));
        const lngIdx = headers.findIndex(h => ['lng', 'lon', 'longitude', 'x'].includes(h));
        if (latIdx === -1 || lngIdx === -1) throw new Error('CSV must have lat/latitude and lng/longitude columns');
        const rawHeaders = lines[0].split(',').map(h => h.trim());
        const features = [];
        for (let i = 1; i < lines.length; i++) {
          const vals = lines[i].split(',').map(v => v.trim());
          if (!vals[latIdx] || !vals[lngIdx]) continue;
          const props: Record<string, string> = {};
          rawHeaders.forEach((h, idx) => { if (idx !== latIdx && idx !== lngIdx) props[h] = vals[idx]; });
          features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [parseFloat(vals[lngIdx]), parseFloat(vals[latIdx])] }, properties: props });
        }
        geojson = { type: 'FeatureCollection', features };
      } else {
        geojson = JSON.parse(text);
      }

      const layerId = `vector-${Date.now()}`;
      const sourceId = `src-${layerId}`;
      const subLayerIds: string[] = [];

      map.addSource(sourceId, { type: 'geojson', data: geojson });

      const geomType = geojson.features?.[0]?.geometry?.type || 'Point';
      const firstSymbolId = getFirstSymbolId(map);

      if (geomType.includes('Polygon')) {
        map.addLayer({ id: layerId, type: 'fill', source: sourceId, paint: { 'fill-color': '#1FBF6E', 'fill-opacity': 0.4 } }, firstSymbolId);
        const outlineId = `${layerId}-outline`;
        map.addLayer({ id: outlineId, type: 'line', source: sourceId, paint: { 'line-color': '#1FBF6E', 'line-width': 1.5 } }, firstSymbolId);
        subLayerIds.push(outlineId);
      } else if (geomType.includes('Line')) {
        map.addLayer({ id: layerId, type: 'line', source: sourceId, paint: { 'line-color': '#1FBF6E', 'line-width': 2 } }, firstSymbolId);
      } else {
        map.addLayer({ id: layerId, type: 'circle', source: sourceId, paint: { 'circle-radius': 5, 'circle-color': '#1FBF6E' } }, firstSymbolId);
      }

      // Fit bounds
      if (geojson.features?.length) {
        let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
        const processCoord = (c: number[]) => { minLng = Math.min(minLng, c[0]); minLat = Math.min(minLat, c[1]); maxLng = Math.max(maxLng, c[0]); maxLat = Math.max(maxLat, c[1]); };
        const processCoords = (coords: any, type: string) => {
          if (type === 'Point') processCoord(coords);
          else if (type === 'MultiPoint' || type === 'LineString') coords.forEach(processCoord);
          else if (type === 'MultiLineString' || type === 'Polygon') coords.forEach((ring: any) => ring.forEach(processCoord));
          else if (type === 'MultiPolygon') coords.forEach((poly: any) => poly.forEach((ring: any) => ring.forEach(processCoord)));
        };
        geojson.features.forEach((f: any) => { if (f.geometry) processCoords(f.geometry.coordinates, f.geometry.type); });
        if (minLng !== Infinity) map.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: 50, maxZoom: 16 });
      }

      addLoadedLayer({ id: layerId, itemId: file.name, sourceId, visible: true, sourceType: 'vector', opacity: 0.85, geojsonData: geojson, geomType, subLayerIds });
      updateDataTab({ uploadStatus: `✅ ${file.name} loaded` });
    } catch (err: any) {
      console.error('[Upload] Vector failed:', err);
      updateDataTab({ uploadStatus: `❌ ${err.message}` });
    }
  }, []);

  // Multi-file upload handler
  const handleMultiUpload = useCallback(async (files: FileList | File[]) => {
    const fileArr = Array.from(files);
    if (fileArr.length === 0) return;
    for (let i = 0; i < fileArr.length; i++) {
      const file = fileArr[i];
      if (fileArr.length > 1) setUploadProgress(`Loading ${i + 1}/${fileArr.length}...`);
      const ext = file.name.toLowerCase();
      if (ext.endsWith('.geojson') || ext.endsWith('.json') || ext.endsWith('.csv')) {
        await handleLocalUploadVector(file);
      } else {
        await handleLocalUpload(file);
      }
    }
    setUploadProgress(null);
  }, [handleLocalUpload, handleLocalUploadVector]);

  // Drag & drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setDragActive(true); }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setDragActive(false); }, []);
  const handleDrop = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setDragActive(false); if (e.dataTransfer.files.length) handleMultiUpload(e.dataTransfer.files); }, [handleMultiUpload]);

  // Remove layer
  const handleRemoveLayer = useCallback((layer: LoadedLayerInfo) => {
    const map = (window as any).__PALMVIEW_MAP;
    if (map) {
      try {
        // Remove sub-layers first (e.g. polygon outlines)
        if (layer.subLayerIds) {
          for (const subId of layer.subLayerIds) {
            if (map.getLayer(subId)) map.removeLayer(subId);
          }
        }
        if (map.getLayer(layer.id)) map.removeLayer(layer.id);
        if (map.getSource(layer.sourceId)) map.removeSource(layer.sourceId);
      } catch (e) {
        console.warn('[Data] Error removing layer:', e);
      }
    }
    removeLoadedLayer(layer.id);
  }, []);

  // ─── Loaded Layers Section (grouped) ───
  const vectorLayers = dt.loadedLayers.filter(l => l.sourceType === 'vector');
  const rasterLayers = dt.loadedLayers.filter(l => ['stac', 'gee', 'local'].includes(l.sourceType));

  const renderLayerItem = (layer: LoadedLayerInfo) => (
    <LayerItem key={layer.id}>
      <IconBtn $dim={!layer.visible} onClick={() => toggleLayerVisibility(layer.id)} title={layer.visible ? 'Hide' : 'Show'}>
        {layer.visible ? '👁️' : '👁️‍🗨️'}
      </IconBtn>
      <LayerName title={layer.itemId}>{layer.itemId}</LayerName>
      <Badge $color={
        layer.sourceType === 'stac' ? '#3b82f6' :
        layer.sourceType === 'gee' ? '#22c55e' :
        layer.sourceType === 'vector' ? '#a855f7' :
        'rgba(255,255,255,0.15)'
      }>{layer.sourceType.toUpperCase()}</Badge>
      <OpacitySlider
        type="range" min={0} max={100}
        value={Math.round((layer.opacity ?? 0.85) * 100)}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateLayerOpacity(layer.id, Number(e.target.value) / 100)}
        title={`Opacity: ${Math.round((layer.opacity ?? 0.85) * 100)}%`}
      />
      <IconBtn onClick={() => handleRemoveLayer(layer)} title="Remove">✕</IconBtn>
    </LayerItem>
  );

  const LoadedLayersSection = (vectorLayers.length > 0 || rasterLayers.length > 0) ? (
    <Section>
      <SectionTitle>🗺️ Loaded Layers ({dt.loadedLayers.length})</SectionTitle>
      {vectorLayers.length > 0 && (
        <>
          <Muted style={{fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginTop: 4, marginBottom: 2}}>🗺️ Vector Layers</Muted>
          {vectorLayers.map(renderLayerItem)}
        </>
      )}
      {rasterLayers.length > 0 && (
        <>
          <Muted style={{fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginTop: vectorLayers.length > 0 ? 8 : 4, marginBottom: 2}}>🛰️ Raster Layers</Muted>
          {rasterLayers.map(renderLayerItem)}
        </>
      )}
      <Muted style={{fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginTop: 8, marginBottom: 2}}>🌐 Basemap</Muted>
      <LayerItem>
        <LayerName>Default</LayerName>
        <Badge>BASE</Badge>
      </LayerItem>
    </Section>
  ) : null;

  return (
    <Panel>
      {/* Source Toggle — always visible */}
      <SourceToggle>
        <SourceBtn $active={dt.source === 'stac'} onClick={() => updateDataTab({ source: 'stac' })}>
          🛰 STAC
        </SourceBtn>
        <SourceBtn $active={dt.source === 'gee'} onClick={() => updateDataTab({ source: 'gee' })}>
          🌍 GEE
        </SourceBtn>
        <SourceBtn $active={dt.source === 'local'} onClick={() => updateDataTab({ source: 'local' })}>
          📁 Local
        </SourceBtn>
      </SourceToggle>

      {dt.source === 'gee' ? (
        <GEEPanel />
      ) : dt.source === 'local' ? (
        <>
          <Section>
            <SectionTitle>📁 Upload Local Files</SectionTitle>
            <input
              ref={fileInputRef}
              type="file"
              accept=".tif,.tiff,.geotiff,.geojson,.json,.csv"
              multiple
              style={{display: 'none'}}
              onChange={e => {
                if (e.target.files?.length) handleMultiUpload(e.target.files);
                e.target.value = '';
              }}
            />
            <DropZone
              $active={dragActive}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <div style={{fontSize: 24, marginBottom: 6}}>📂</div>
              <div style={{fontSize: 11, color: '#D3D8E0', fontWeight: 500}}>
                {dragActive ? 'Drop files here' : 'Click or drag files here'}
              </div>
              <Muted style={{fontSize: 10, marginTop: 4}}>
                GeoTIFF · GeoJSON · CSV
              </Muted>
            </DropZone>
            {uploadProgress && <div style={{marginTop: 8, fontSize: 11, color: '#1FBF6E'}}>{uploadProgress}</div>}
            {dt.uploadStatus && <div style={{marginTop: 4, fontSize: 11}}>{dt.uploadStatus}</div>}
          </Section>
          {LoadedLayersSection}
        </>
      ) : (
        <>
          {/* STAC Provider + Collection */}
          <Section>
            <SectionTitle>Data Source</SectionTitle>
            <Label>Provider</Label>
            <Select value={dt.selectedProvider} onChange={e => updateDataTab({ selectedProvider: e.target.value })}>
              {Object.entries(providers).map(([key, p]) => (
                <option key={key} value={key}>{p.name}</option>
              ))}
            </Select>
            <div style={{height: 6}} />
            <Label>Collection</Label>
            <Select value={dt.selectedCollection} onChange={e => updateDataTab({ selectedCollection: e.target.value })}>
              {providers[dt.selectedProvider]?.popular_collections?.map(c => (
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
                value={dt.bboxStr}
                onChange={e => updateDataTab({ bboxStr: e.target.value })}
                placeholder="103.6,1.2,104.0,1.45"
              />
              <Btn $small onClick={() => {
                const map = (window as any).__PALMVIEW_MAP;
                if (map) {
                  const bounds = map.getBounds();
                  updateDataTab({
                    bboxStr: [
                      bounds.getWest().toFixed(4),
                      bounds.getSouth().toFixed(4),
                      bounds.getEast().toFixed(4),
                      bounds.getNorth().toFixed(4),
                    ].join(',')
                  });
                }
              }} title="Use current map view">
                📍 Current View
              </Btn>
            </Row>
            <div style={{height: 6}} />
            <Row>
              <div style={{flex: 1}}>
                <Label>From</Label>
                <Input type="date" value={dt.dateFrom} onChange={e => updateDataTab({ dateFrom: e.target.value })} />
              </div>
              <div style={{flex: 1}}>
                <Label>To</Label>
                <Input type="date" value={dt.dateTo} onChange={e => updateDataTab({ dateTo: e.target.value })} />
              </div>
            </Row>
            <div style={{height: 6}} />
            <Label>Max Cloud Cover: {dt.maxCloud}%</Label>
            <SliderRow>
              <Slider type="range" min={0} max={100} value={dt.maxCloud} onChange={e => updateDataTab({ maxCloud: Number(e.target.value) })} />
              <Muted>{dt.maxCloud}%</Muted>
            </SliderRow>
          </Section>

          <Btn $primary onClick={handleSearch} disabled={searching} style={{width: '100%'}}>
            {searching ? '🔍 Searching...' : '🔍 Search Satellite Data'}
          </Btn>
          {dt.searchError && <Muted style={{color: '#F9042C'}}>⚠️ {dt.searchError}</Muted>}

          {/* Results */}
          {dt.results.length > 0 && (
            <Section>
              <SectionTitle>📡 Results ({dt.results.length})</SectionTitle>
              {dt.results.map(item => {
                const thumb = getThumbnail(item);
                const cc = getCloudCover(item.properties);
                const isDownloading = downloading === item.id;
                const isLoaded = dt.loadedLayers.some(l => l.itemId === item.id);
                return (
                  <ResultCard key={item.id}>
                    {thumb ? <Thumb src={thumb} alt={item.id} /> : <ThumbPlaceholder>🛰</ThumbPlaceholder>}
                    <div style={{flex: 1, minWidth: 0}}>
                      <div style={{fontWeight: 500, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#D3D8E0'}}>
                        {item.id}
                      </div>
                      <div style={{display: 'flex', gap: 4, marginTop: 3, flexWrap: 'wrap'}}>
                        <Badge>📅 {formatDate(item.datetime)}</Badge>
                        {cc !== null && <Badge $color={cc < 10 ? '#22c55e' : cc < 30 ? '#eab308' : '#F9042C'}>☁️ {Math.round(cc)}%</Badge>}
                      </div>
                      <Row style={{marginTop: 6}}>
                        <Btn $small $primary onClick={() => handleLoadToMap(item)} disabled={isDownloading}>
                          {isDownloading ? '⏳ Loading...' : '🗺️ Load to Map'}
                        </Btn>
                        {isLoaded && <Badge $color="#1FBF6E">✓ Loaded</Badge>}
                      </Row>
                    </div>
                  </ResultCard>
                );
              })}
            </Section>
          )}

          {LoadedLayersSection}

          {!searching && dt.results.length === 0 && !dt.searchError && (
            <Section style={{textAlign: 'center', padding: '24px 16px'}}>
              <div style={{fontSize: 28, marginBottom: 8}}>🛰️</div>
              <div style={{color: '#D3D8E0', fontSize: 12, fontWeight: 500, marginBottom: 6}}>No satellite imagery loaded yet</div>
              <EmptyMsg style={{textAlign: 'center', padding: 0}}>
                Choose a provider and collection above, then click "Search Satellite Data" to find imagery.
              </EmptyMsg>
            </Section>
          )}
        </>
      )}
    </Panel>
  );
};

// ─── Data Icon ───────────────────────────────────────

const DataIcon = (props: any) => (
  <svg viewBox="0 0 24 24" width={props.height || '18px'} height={props.height || '18px'} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="6" height="6" rx="1" strokeWidth="1.5" />
    <path d="M3 8h4v8H3zM17 8h4v8h-4z" strokeWidth="1.5" />
    <path d="M7 12H9M15 12h2" strokeWidth="1.5" />
    <path d="M12 9V5" strokeWidth="1.5" />
    <circle cx="12" cy="4" r="1" strokeWidth="1" />
    <path d="M10 19c1-1 3-1 4 0" strokeWidth="1" opacity="0.5" />
    <path d="M8 21c2-2 6-2 8 0" strokeWidth="1" opacity="0.35" />
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
