'use client';

import { X, Leaf, Bot } from 'lucide-react';

export type SelectedAsset =
  | { type: 'tree'; id: string; age: number; health: number; position: [number, number, number] }
  | { type: 'bot'; id: string; status: string; position: [number, number, number] }
  | null;

interface SceneUIProps {
  plantationName: string;
  /** Area in hectares */
  areaHa?: number;
  onClose: () => void;
  selected?: SelectedAsset;
  onDeselect?: () => void;
}

/** Health bar colour */
function healthBarColor(health: number): string {
  if (health >= 0.7) return '#4caf50';
  if (health >= 0.4) return '#ffc107';
  return '#f44336';
}

export default function SceneUI({
  plantationName,
  areaHa,
  onClose,
  selected,
  onDeselect,
}: SceneUIProps) {
  return (
    <div
      className="absolute inset-0 pointer-events-none select-none"
      style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
    >
      {/* ── Top-left: Plantation info ── */}
      <div
        className="absolute top-4 left-4 pointer-events-auto"
        style={{
          background: 'rgba(10,20,10,0.72)',
          backdropFilter: 'blur(8px)',
          borderRadius: 12,
          padding: '10px 16px',
          color: '#e8f5e9',
          minWidth: 180,
          border: '1px solid rgba(76,175,80,0.35)',
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 2 }}>
          🌴 {plantationName}
        </div>
        {areaHa !== undefined && (
          <div style={{ fontSize: 12, color: '#a5d6a7' }}>
            {areaHa.toFixed(1)} ha
          </div>
        )}
      </div>

      {/* ── Top-right: Close button ── */}
      <button
        className="absolute top-4 right-4 pointer-events-auto flex items-center gap-1.5"
        onClick={onClose}
        style={{
          background: 'rgba(10,20,10,0.72)',
          backdropFilter: 'blur(8px)',
          border: '1px solid rgba(255,255,255,0.2)',
          borderRadius: 10,
          padding: '8px 14px',
          color: '#fff',
          cursor: 'pointer',
          fontSize: 13,
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <X size={14} />
        Close 3D
      </button>

      {/* ── Bottom: Selected asset info card ── */}
      {selected && (
        <div
          className="absolute bottom-6 left-1/2 pointer-events-auto"
          style={{
            transform: 'translateX(-50%)',
            background: 'rgba(10,20,10,0.82)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(76,175,80,0.4)',
            borderRadius: 14,
            padding: '14px 20px',
            color: '#e8f5e9',
            minWidth: 260,
            maxWidth: 380,
          }}
        >
          {/* Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 10,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {selected.type === 'tree' ? (
                <Leaf size={16} color="#4caf50" />
              ) : (
                <Bot size={16} color="#1976d2" />
              )}
              <span style={{ fontWeight: 700, fontSize: 14 }}>
                {selected.type === 'tree' ? 'Palm Tree' : 'Harvest Bot'}{' '}
                <span style={{ color: '#80cbc4', fontWeight: 400 }}>
                  #{selected.id}
                </span>
              </span>
            </div>
            <button
              onClick={onDeselect}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: '#80cbc4',
                padding: 2,
              }}
            >
              <X size={13} />
            </button>
          </div>

          {/* Tree details */}
          {selected.type === 'tree' && (
            <div style={{ fontSize: 13, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#a5d6a7' }}>Age</span>
                <span>{selected.age} yrs</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#a5d6a7' }}>Health</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div
                    style={{
                      width: 80,
                      height: 6,
                      background: 'rgba(255,255,255,0.15)',
                      borderRadius: 3,
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        width: `${selected.health * 100}%`,
                        height: '100%',
                        background: healthBarColor(selected.health),
                        borderRadius: 3,
                        transition: 'width 0.3s',
                      }}
                    />
                  </div>
                  <span>{Math.round(selected.health * 100)}%</span>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#a5d6a7' }}>Position</span>
                <span style={{ color: '#80cbc4', fontSize: 11 }}>
                  ({selected.position.map((v) => v.toFixed(1)).join(', ')})
                </span>
              </div>
            </div>
          )}

          {/* Bot details */}
          {selected.type === 'bot' && (
            <div style={{ fontSize: 13, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#a5d6a7' }}>Status</span>
                <span
                  style={{
                    textTransform: 'capitalize',
                    color:
                      selected.status === 'harvesting'
                        ? '#ffc107'
                        : selected.status === 'moving'
                        ? '#1976d2'
                        : '#90a4ae',
                  }}
                >
                  {selected.status}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#a5d6a7' }}>Position</span>
                <span style={{ color: '#80cbc4', fontSize: 11 }}>
                  ({selected.position.map((v) => v.toFixed(1)).join(', ')})
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
