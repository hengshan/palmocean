// PalmView Theme — Synga brand colors applied to Kepler.gl
// Source: synga.git/src/app/globals.css
//
// Synga Design System:
//   Primary:    #0A3D2E (deep green)
//   Accent:     #1FBF6E (vibrant green)
//   Tech:       #2196F3 (blue)
//   Gold:       #D4A843 (gold accent)
//   Dark:       #0D1117 (background)
//   Dark Card:  #1c2128
//   Text:       #ffffff / #a0aec0 / #718096

import {theme as keplerTheme} from '@kepler.gl/styles';

// ─── Synga Brand Tokens ──────────────────────────────────────

const SYNGA = {
  primary: '#0A3D2E',
  primaryDark: '#072a20',
  primaryLight: '#0d5a42',
  accent: '#1FBF6E',
  accentDark: '#17a05b',
  accentLight: '#3dd688',
  tech: '#2196F3',
  techDark: '#1976D2',
  techLight: '#64B5F6',
  gold: '#D4A843',
  goldDark: '#B8922E',
  goldLight: '#E4C06A',
  dark: '#0D1117',
  darkLighter: '#161b22',
  darkCard: '#1c2128',
  textPrimary: '#ffffff',
  textSecondary: '#a0aec0',
  textMuted: '#718096',
  success: '#22c55e',
  warning: '#eab308',
  error: '#F9042C',
};

// ─── PalmView Theme Override ─────────────────────────────────

export const palmviewTheme = {
  ...keplerTheme,

  // ── Core Active Color (accent green replaces Kepler's cyan) ──
  activeColor: SYNGA.accent,
  activeColorHover: SYNGA.accentDark,
  logoColor: SYNGA.accent,

  // ── Text ──
  textColor: SYNGA.textSecondary,
  textColorHl: SYNGA.textPrimary,
  titleTextColor: SYNGA.textPrimary,
  subtextColor: SYNGA.textMuted,
  subtextColorActive: SYNGA.textPrimary,
  labelColor: SYNGA.textMuted,
  labelHoverColor: SYNGA.textSecondary,

  // ── Side Panel ──
  sidePanelBg: SYNGA.darkCard,
  sidePanelHeaderBg: SYNGA.darkLighter,
  panelBackground: SYNGA.dark,
  panelBackgroundHover: SYNGA.darkLighter,
  panelToggleBorderColor: SYNGA.accent,
  panelTabColor: SYNGA.textMuted,

  // ── Backgrounds ──
  mapPanelBackgroundColor: SYNGA.darkCard,
  mapPanelHeaderBackgroundColor: SYNGA.darkLighter,

  // ── Primary Button (gold — matches Synga CTA) ──
  primaryBtnBgd: SYNGA.accent,
  primaryBtnActBgd: SYNGA.accentDark,
  primaryBtnBgdHover: SYNGA.accentLight,
  primaryBtnColor: '#FFFFFF',
  primaryBtnActColor: '#FFFFFF',

  // ── CTA Button ──
  ctaBtnBgd: SYNGA.accent,
  ctaBtnBgdHover: SYNGA.accentLight,
  ctaBtnActBgd: SYNGA.accentDark,
  ctaBtnColor: '#FFFFFF',

  // ── Secondary Button ──
  secondaryBtnBgd: SYNGA.primaryLight,
  secondaryBtnActBgd: SYNGA.primary,
  secondaryBtnBgdHover: SYNGA.primary,
  secondaryBtnColor: '#FFFFFF',
  secondaryBtnActColor: '#FFFFFF',

  // ── Selection Button (tab/toggle selection) ──
  selectionBtnActColor: SYNGA.accent,
  selectionBtnBgdHover: SYNGA.accent,
  selectionBtnBorderActColor: SYNGA.accent,

  // ── Link Button ──
  linkBtnColor: SYNGA.textSecondary,
  linkBtnActColor: SYNGA.accent,

  // ── Floating Button (map controls) ──
  floatingBtnBgd: SYNGA.darkCard,
  floatingBtnActBgd: SYNGA.darkLighter,
  floatingBtnBgdHover: SYNGA.darkLighter,

  // ── Input ──
  inputBgd: SYNGA.darkLighter,
  inputBgdHover: SYNGA.darkCard,
  inputBgdActive: SYNGA.darkCard,
  inputBorderActiveColor: SYNGA.accent,

  // ── Dropdown ──
  dropdownListBgd: SYNGA.darkCard,
  dropdownListHighlightBg: SYNGA.primaryLight,

  // ── Switch / Toggle ──
  switchTrackBgdActive: SYNGA.accent,
  switchBtnBgdActive: SYNGA.textPrimary,

  // ── Slider ──
  sliderBarColor: SYNGA.primaryLight,
  sliderBarBgd: SYNGA.darkLighter,
  sliderBarHoverColor: SYNGA.accent,
  sliderHandleColor: SYNGA.accent,
  sliderHandleHoverColor: SYNGA.accentLight,

  // ── Borders ──
  borderColor: 'rgba(31, 191, 110, 0.15)',
  panelBorderColor: 'rgba(31, 191, 110, 0.1)',

  // ── Tooltip ──
  tooltipBg: SYNGA.darkCard,
  tooltipColor: SYNGA.textPrimary,

  // ── Notification ──
  notificationColors: {
    info: SYNGA.tech,
    error: SYNGA.error,
    success: SYNGA.accent,
    warning: SYNGA.warning,
  },

  // ── Bottom Widget (timeline) ──
  bottomWidgetBgd: SYNGA.darkCard,

  // ── Data Table ──
  headerCellBackground: SYNGA.darkLighter,
  headerCellBorderColor: SYNGA.primary,
  headerCellIconColor: SYNGA.textMuted,

  // ── Plot ──
  rangeBrushBgd: SYNGA.accent,

  // ── Checkbox / Radio ──
  radioButtonBgdColor: SYNGA.textPrimary,

  // ── SidePanel Close Button ──
  sideBarCloseBtnBgd: SYNGA.darkCard,
  sideBarCloseBtnColor: SYNGA.textMuted,
  sideBarCloseBtnBgdHover: SYNGA.accent,
};

export default palmviewTheme;
