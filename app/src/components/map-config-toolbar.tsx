// SPDX-License-Identifier: MIT
// Copyright ©Synga — PalmView Map Config Toolbar
// Sprint 4 T5: Save & Share map workspace via /api/v1/map-configs
//
// Features:
//  - Save: serialises current Kepler state → POST /api/v1/map-configs
//  - Share: POST /api/v1/map-configs/{id}/share → copies URL to clipboard
//  - Toast notification on success/error

import React, {useState, useCallback, useEffect, useRef} from 'react';
import styled, {keyframes} from 'styled-components';
import {useSelector, useDispatch} from 'react-redux';
import {addDataToMap} from '@kepler.gl/actions';
import KeplerGlSchema from '@kepler.gl/schemas';
import {
  saveMapConfig,
  loadMapConfig,
  shareMapConfig,
  listProjects,
  createProject,
} from '../palmview/api';

// ─── Config ──────────────────────────────────────────────────────────────────

const ORG_ID = '1b77d523-9e70-4486-b64a-2b78fc600e9e';
const FALLBACK_PROJECT_ID = 'dd341b39-da8f-4142-98e8-da582b6f8d6a';
const API_BASE =
  (typeof process !== 'undefined' && process.env?.PALMVIEW_API_URL) ||
  'http://100.81.217.18:8000';

// ─── Styled Components ───────────────────────────────────────────────────────

const Toolbar = styled.div`
  position: absolute;
  top: 12px;
  right: 12px;
  display: flex;
  gap: 6px;
  z-index: 950;
  pointer-events: all;
`;

const ToolBtn = styled.button<{variant?: 'primary' | 'secondary'; disabled?: boolean}>`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  border-radius: 4px;
  border: 1px solid
    ${p => p.variant === 'primary' ? 'rgba(90,200,120,0.5)' : 'rgba(255,255,255,0.12)'};
  background: ${p =>
    p.variant === 'primary'
      ? 'rgba(30,90,50,0.85)'
      : 'rgba(18,22,28,0.88)'};
  color: ${p =>
    p.variant === 'primary' ? '#6ae08a' : '#b0bac8'};
  font-size: 11.5px;
  font-family: 'Roboto Mono', 'SF Mono', monospace, sans-serif;
  cursor: ${p => p.disabled ? 'not-allowed' : 'pointer'};
  opacity: ${p => p.disabled ? 0.5 : 1};
  backdrop-filter: blur(4px);
  transition: background 0.15s, border-color 0.15s;
  white-space: nowrap;

  &:hover:not(:disabled) {
    background: ${p =>
      p.variant === 'primary'
        ? 'rgba(40,120,65,0.92)'
        : 'rgba(30,36,46,0.92)'};
    border-color: ${p =>
      p.variant === 'primary' ? 'rgba(90,200,120,0.75)' : 'rgba(255,255,255,0.2)'};
  }
`;

const fadeInUp = keyframes`
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
`;
const fadeOut = keyframes`
  from { opacity: 1; }
  to   { opacity: 0; }
`;

const Toast = styled.div<{type: 'success' | 'error'; fading: boolean}>`
  position: fixed;
  bottom: 36px;
  left: 50%;
  transform: translateX(-50%);
  padding: 9px 18px;
  border-radius: 5px;
  background: ${p => p.type === 'success' ? 'rgba(30,90,50,0.95)' : 'rgba(90,30,30,0.95)'};
  border: 1px solid ${p => p.type === 'success' ? 'rgba(90,200,120,0.5)' : 'rgba(200,90,90,0.5)'};
  color: ${p => p.type === 'success' ? '#6ae08a' : '#e08a8a'};
  font-size: 12px;
  font-family: 'Roboto Mono', monospace, sans-serif;
  z-index: 9999;
  backdrop-filter: blur(4px);
  animation: ${p => p.fading ? fadeOut : fadeInUp} 0.3s ease forwards;
  pointer-events: none;
  white-space: nowrap;
`;

const Spinner = styled.span`
  display: inline-block;
  width: 10px;
  height: 10px;
  border: 2px solid rgba(255,255,255,0.15);
  border-top-color: currentColor;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
`;

// ─── Types ───────────────────────────────────────────────────────────────────

interface ToastState {
  message: string;
  type: 'success' | 'error';
  fading: boolean;
}

// ─── Hook: toast ─────────────────────────────────────────────────────────────

function useToast() {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setToast({message, type, fading: false});
    timerRef.current = setTimeout(() => {
      setToast(prev => prev ? {...prev, fading: true} : null);
      timerRef.current = setTimeout(() => setToast(null), 350);
    }, 2800);
  }, []);

  return {toast, showToast};
}

// ─── Project ID helper ────────────────────────────────────────────────────────

async function resolveProjectId(): Promise<string> {
  try {
    const list = await listProjects(ORG_ID);
    if (list.projects?.length) return list.projects[0].project_id;
    const created = await createProject({org_id: ORG_ID, name: 'Default', description: 'PalmView'});
    return created.project_id;
  } catch {
    return FALLBACK_PROJECT_ID;
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

interface MapConfigToolbarProps {
  /** Position override — useful when toolbar needs to dodge other UI */
  style?: React.CSSProperties;
}

const MapConfigToolbar: React.FC<MapConfigToolbarProps> = ({style}) => {
  const {toast, showToast} = useToast();
  const dispatch = useDispatch();

  // Saved config id from last successful save (persisted in sessionStorage too)
  const [savedConfigId, setSavedConfigId] = useState<string | null>(() =>
    sessionStorage.getItem('palmview:last_config_id')
  );

  const [saving, setSaving] = useState(false);
  const [sharing, setSharing] = useState(false);

  // Pull the full kepler map state from Redux
  const mapState = useSelector((state: any) => state?.demo?.keplerGl?.map);

  // ── Save handler ──────────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    if (!mapState || saving) return;
    setSaving(true);
    try {
      const keplerConfig = KeplerGlSchema.getConfigToSave(mapState);
      const projectId = await resolveProjectId();
      const now = new Date().toISOString().slice(0, 16).replace('T', ' ');
      const result = await saveMapConfig({
        project_id: projectId,
        title: `PalmView Workspace ${now}`,
        kepler_config: keplerConfig as Record<string, unknown>,
        dataset_refs: [],
      });
      setSavedConfigId(result.map_config_id);
      sessionStorage.setItem('palmview:last_config_id', result.map_config_id);
      showToast(`✓ Map saved (v${result.version})`);
    } catch (err: any) {
      console.error('[MapConfigToolbar] Save failed:', err);
      showToast(`✗ Save failed: ${err.message ?? 'unknown error'}`, 'error');
    } finally {
      setSaving(false);
    }
  }, [mapState, saving, showToast]);

  // ── Share handler ─────────────────────────────────────────────────────────

  const handleShare = useCallback(async () => {
    if (sharing) return;
    setSharing(true);

    try {
      // Auto-save first if we don't have a config id
      let configId = savedConfigId;
      if (!configId) {
        if (!mapState) {
          showToast('✗ No map to share', 'error');
          return;
        }
        const keplerConfig = KeplerGlSchema.getConfigToSave(mapState);
        const projectId = await resolveProjectId();
        const now = new Date().toISOString().slice(0, 16).replace('T', ' ');
        const saveResult = await saveMapConfig({
          project_id: projectId,
          title: `PalmView Workspace ${now}`,
          kepler_config: keplerConfig as Record<string, unknown>,
          dataset_refs: [],
        });
        configId = saveResult.map_config_id;
        setSavedConfigId(configId);
        sessionStorage.setItem('palmview:last_config_id', configId);
      }

      // Create share token
      const shareResult = await shareMapConfig(configId, {visibility: 'public_link'});

      // Build the shareable URL — ?config=<id> pointing to this app
      const appOrigin = window.location.origin + window.location.pathname;
      const shareUrl = `${appOrigin}?config=${configId}`;

      // Copy to clipboard
      try {
        await navigator.clipboard.writeText(shareUrl);
        showToast('✓ Share link copied to clipboard!');
      } catch {
        // Fallback for non-HTTPS or restricted contexts
        const input = document.createElement('input');
        input.value = shareUrl;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
        showToast('✓ Share link copied to clipboard!');
      }
    } catch (err: any) {
      console.error('[MapConfigToolbar] Share failed:', err);
      showToast(`✗ Share failed: ${err.message ?? 'unknown error'}`, 'error');
    } finally {
      setSharing(false);
    }
  }, [sharing, savedConfigId, mapState, showToast]);

  return (
    <>
      <Toolbar style={style}>
        <ToolBtn
          variant="primary"
          onClick={handleSave}
          disabled={saving}
          title="Save current map workspace to backend"
        >
          {saving ? <Spinner /> : '💾'}
          {saving ? 'Saving…' : 'Save'}
        </ToolBtn>
        <ToolBtn
          onClick={handleShare}
          disabled={sharing}
          title="Generate shareable link for this workspace"
        >
          {sharing ? <Spinner /> : '🔗'}
          {sharing ? 'Sharing…' : 'Share'}
        </ToolBtn>
      </Toolbar>

      {toast && (
        <Toast type={toast.type} fading={toast.fading}>
          {toast.message}
        </Toast>
      )}
    </>
  );
};

// ─── Startup hook: load config from ?config=<id> ─────────────────────────────

/**
 * Call this once on app startup. If the URL contains `?config=<uuid>`, fetch
 * the map config from the backend and restore it into Kepler.gl.
 */
export async function loadConfigFromUrl(dispatch: any): Promise<void> {
  try {
    const params = new URLSearchParams(window.location.search);
    const configId = params.get('config');
    if (!configId) return;

    console.log('[MapConfigToolbar] Loading config from URL:', configId);
    const detail = await loadMapConfig(configId);

    if (detail?.kepler_config) {
      dispatch(
        addDataToMap({
          datasets: [],
          config: detail.kepler_config as any,
          options: {keepExistingConfig: false},
        })
      );
      console.log('[MapConfigToolbar] Config restored from URL (id=%s, v%d)', configId, detail.version);
    }
  } catch (err) {
    console.warn('[MapConfigToolbar] Could not load config from URL:', err);
  }
}

export default MapConfigToolbar;
