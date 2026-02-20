# PalmView Design System v1.0

> 🌈 Authored by IRIS — Frontend Architecture & Design Lead
> Sprint 1 前置工作 · 2026-02-20

---

## 1. Design Philosophy

**「至善至纯」applied to UI** — Every pixel serves a purpose. No decoration without function. Beauty emerges from clarity.

### Principles
- **Agricultural Context First** — Colors, icons, and layouts that resonate with Southeast Asian agriculture and geospatial workflows
- **Kepler-Native** — Extend Kepler's dark theme, don't fight it. Our additions should feel like they belong
- **Progressive Disclosure** — Show simple controls first, reveal complexity on demand
- **Accessibility** — WCAG 2.1 AA minimum. Geospatial tools are used in field conditions (bright sunlight, small screens)

---

## 2. Color Palette

### Base (inherited from Kepler dark theme)
| Token | Value | Usage |
|-------|-------|-------|
| `--bg-primary` | `#29323C` | Side panel background |
| `--bg-secondary` | `#3A4552` | Card/section background |
| `--bg-map` | `#242730` | Map canvas |
| `--text-primary` | `#A0A7B4` | Body text |
| `--text-active` | `#D3D8E0` | Active/highlighted text |
| `--text-highlight` | `#FFFFFF` | Emphasis |

### PalmView Accent Colors
| Token | Value | Usage |
|-------|-------|-------|
| `--palm-green` | `#2ECC71` | Healthy vegetation, success states |
| `--palm-amber` | `#F39C12` | Warning, moderate confidence |
| `--palm-red` | `#E74C3C` | Disease/stress detection, errors |
| `--palm-blue` | `#3498DB` | Water features, info states |
| `--palm-purple` | `#9B59B6` | AI/ML indicators, processing |
| `--geoai-cyan` | `#00D2FF` | GeoAI tab accent, AOI drawing |

### Confidence Heatmap Ramp
```
Low ← ───────────────────── → High
#E74C3C  #F39C12  #F1C40F  #2ECC71  #27AE60
```

### Land Classification Colors
| Class | Color | Hex |
|-------|-------|-----|
| Oil Palm | 🟢 | `#27AE60` |
| Rubber | 🟤 | `#8B6914` |
| Rice Paddy | 🟡 | `#F1C40F` |
| Water | 🔵 | `#2980B9` |
| Built-up | 🔴 | `#C0392B` |
| Forest | 🌲 | `#1E8449` |
| Bare Soil | 🟫 | `#A0522D` |

---

## 3. Typography

### Font Stack
```css
--font-family-primary: 'Inter', 'SF Pro Display', -apple-system, sans-serif;
--font-family-mono: 'JetBrains Mono', 'Fira Code', monospace;
--font-family-cjk: 'Noto Sans SC', 'PingFang SC', sans-serif;
```

### Scale (Kepler-aligned)
| Token | Size | Weight | Usage |
|-------|------|--------|-------|
| `--text-xs` | 10px | 400 | Labels, metadata |
| `--text-sm` | 11px | 400 | Secondary info, captions |
| `--text-base` | 12px | 400 | Body text (Kepler default) |
| `--text-md` | 13px | 500 | Panel headers |
| `--text-lg` | 14px | 600 | Section titles |
| `--text-xl` | 18px | 700 | Major headings |

---

## 4. Spacing & Layout

### Spacing Scale
```
4px → 8px → 12px → 16px → 24px → 32px → 48px
```

### Side Panel
- Width: `300px` (Kepler default) → `340px` (PalmView, to accommodate GeoAI controls)
- Padding: `16px` horizontal, `12px` vertical between sections
- Section gap: `16px`

### Cards
- Border radius: `2px` (Kepler-consistent)
- Padding: `12px`
- Background: `--bg-secondary`
- Hover: `lighten(--bg-secondary, 5%)`

---

## 5. Component Library

### 5.1 GeoAI-Specific Components

#### AOI Selector
```
┌─ AOI Selection ─────────────────┐
│ [□ Rectangle] [⬠ Polygon] [✏️ Free] │
│                                  │
│ Area: 124.5 ha                   │
│ Bounds: 1.23°N, 103.45°E ...    │
└──────────────────────────────────┘
```
- Active tool highlighted with `--geoai-cyan` border
- Area auto-calculated and displayed

#### Model Selector Card
```
┌─ Model ─────────────────────────┐
│ ○ Auto-select (recommended)     │
│ ● Manual:                       │
│   ┌──────────────────────────┐  │
│   │ 🌴 YOLOv8-Palm  v1.2   │◄─│
│   │   P: 0.888 | R: 0.903   │  │
│   └──────────────────────────┘  │
│   ┌──────────────────────────┐  │
│   │ 🧠 SAM2         v2.1   │  │
│   └──────────────────────────┘  │
└──────────────────────────────────┘
```

#### Confidence Slider
```
┌─ Confidence Threshold ──────────┐
│ ━━━━━━━━━━●━━━━ 0.70            │
│ Showing 1,247 / 1,502 detections│
└──────────────────────────────────┘
```

#### Result Summary Card
```
┌─ Results ───────────────────────┐
│ 🌴 1,247 palms detected         │
│ ⚠️  3 disease zones             │
│ 📐 124.5 ha analyzed            │
│ ⏱️  12.3s processing time       │
│                                  │
│ [Export GeoJSON] [View Report]   │
└──────────────────────────────────┘
```

### 5.2 Shared Components

#### Button Variants
| Variant | Style | Usage |
|---------|-------|-------|
| Primary | Filled `--geoai-cyan` | Main actions (Run Analysis) |
| Secondary | Outlined `--text-primary` | Supporting actions |
| Danger | Filled `--palm-red` | Destructive actions |
| Ghost | Text only | Tertiary actions |

#### Status Indicators
| State | Icon | Color |
|-------|------|-------|
| Idle | `○` | `--text-primary` |
| Processing | `◉` spinning | `--palm-purple` |
| Success | `✓` | `--palm-green` |
| Warning | `⚠` | `--palm-amber` |
| Error | `✕` | `--palm-red` |

---

## 6. Iconography

- Use Kepler's existing icon system (`src/components/common/icons/`)
- New GeoAI icons follow same SVG pattern: 20×20 viewBox, 1.5px stroke
- Custom icons needed:
  - 🧠 GeoAI tab icon (brain + satellite)
  - 🌴 Palm detection
  - 🔍 AOI selection
  - 📊 Analysis report
  - 🛰️ Satellite imagery

---

## 7. Animation & Transitions

| Element | Duration | Easing |
|---------|----------|--------|
| Panel open/close | 250ms | ease-out |
| Tab switch | 150ms | ease-in-out |
| Result appear | 300ms | ease-out (staggered 50ms) |
| Progress bar | continuous | linear |
| Map overlay fade | 200ms | ease-in-out |

---

## 8. Responsive Considerations

| Breakpoint | Behavior |
|------------|----------|
| Desktop (>1200px) | Full side panel + map |
| Tablet (768-1200px) | Collapsible panel, map priority |
| Mobile (<768px) | Bottom sheet for GeoAI controls |

---

## 9. Dark/Light Mode

MVP: **Dark mode only** (Kepler default, optimal for satellite imagery viewing).
Future: Light mode for field use in bright conditions.

---

## 10. Implementation Notes

- All new components use **styled-components** (Kepler's styling system)
- Extend Kepler's theme object with PalmView tokens
- Use `Factory` pattern for all replaceable components
- Design tokens exported as both JS constants and CSS custom properties
