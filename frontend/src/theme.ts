export type ThemeColor = 'purple' | 'emerald' | 'blue' | 'rose' | 'amber' | 'slate';
export type ThemeMode = 'light' | 'dark' | 'system';

export interface ThemeOption {
  id: ThemeColor;
  name: string;
  primary: string;
  hover: string;
  light: string;
  border: string;
  glow: string;
  gradient: string;
}

export const THEME_COLORS: ThemeOption[] = [
  {
    id: 'purple',
    name: 'Imperial Purple',
    primary: '#715ee8',
    hover: '#5d4cd0',
    light: '#f0edff',
    border: '#c8bffd',
    glow: 'rgba(113, 94, 232, 0.22)',
    gradient: 'linear-gradient(135deg, #9f8df9, #6056d4)',
  },
  {
    id: 'emerald',
    name: 'Emerald Growth',
    primary: '#10b981',
    hover: '#059669',
    light: '#ecfdf5',
    border: '#a7f3d0',
    glow: 'rgba(16, 185, 129, 0.22)',
    gradient: 'linear-gradient(135deg, #34d399, #059669)',
  },
  {
    id: 'blue',
    name: 'Ocean Sapphire',
    primary: '#2563eb',
    hover: '#1d4ed8',
    light: '#eff6ff',
    border: '#bfdbfe',
    glow: 'rgba(37, 99, 235, 0.22)',
    gradient: 'linear-gradient(135deg, #60a5fa, #2563eb)',
  },
  {
    id: 'rose',
    name: 'Crimson Ember',
    primary: '#e11d48',
    hover: '#be123c',
    light: '#fff1f2',
    border: '#fecdd3',
    glow: 'rgba(225, 29, 72, 0.22)',
    gradient: 'linear-gradient(135deg, #fb7185, #e11d48)',
  },
  {
    id: 'amber',
    name: 'Amber Sunrise',
    primary: '#f59e0b',
    hover: '#d97706',
    light: '#fffbeb',
    border: '#fde68a',
    glow: 'rgba(245, 158, 11, 0.22)',
    gradient: 'linear-gradient(135deg, #fbbf24, #d97706)',
  },
  {
    id: 'slate',
    name: 'Midnight Slate',
    primary: '#475569',
    hover: '#334155',
    light: '#f1f5f9',
    border: '#cbd5e1',
    glow: 'rgba(71, 85, 105, 0.22)',
    gradient: 'linear-gradient(135deg, #94a3b8, #334155)',
  },
];

export function getStoredTheme(): { mode: ThemeMode; color: ThemeColor } {
  if (typeof window === 'undefined') return { mode: 'light', color: 'purple' };
  const mode = (localStorage.getItem('optimus_theme_mode') as ThemeMode) || 'light';
  const color = (localStorage.getItem('optimus_accent_color') as ThemeColor) || 'purple';
  return { mode, color };
}

export function applyTheme(mode: ThemeMode, color: ThemeColor) {
  if (typeof window === 'undefined') return;
  localStorage.setItem('optimus_theme_mode', mode);
  localStorage.setItem('optimus_accent_color', color);

  const root = document.documentElement;
  const isDark =
    mode === 'dark' ||
    (mode === 'system' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);

  if (isDark) {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }

  const selected = THEME_COLORS.find(c => c.id === color) || THEME_COLORS[0];
  root.style.setProperty('--brand-primary', selected.primary);
  root.style.setProperty('--brand-primary-hover', selected.hover);
  root.style.setProperty('--brand-primary-light', selected.light);
  root.style.setProperty('--brand-primary-border', selected.border);
  root.style.setProperty('--brand-primary-glow', selected.glow);
  root.style.setProperty('--brand-primary-gradient', selected.gradient);
}
