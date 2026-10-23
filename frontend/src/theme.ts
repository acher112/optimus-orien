export type ThemeMode = 'light' | 'dark' | 'system';

export interface ThemePreset {
  id: string;
  name: string;
  hex: string;
}

export const THEME_PRESETS: ThemePreset[] = [
  { id: 'yellow', name: 'Vibrant Yellow', hex: '#eab308' },
  { id: 'purple', name: 'Imperial Purple', hex: '#715ee8' },
  { id: 'emerald', name: 'Emerald Green', hex: '#10b981' },
  { id: 'blue', name: 'Ocean Blue', hex: '#2563eb' },
  { id: 'rose', name: 'Crimson Rose', hex: '#e11d48' },
  { id: 'violet', name: 'Amethyst Violet', hex: '#8b5cf6' },
  { id: 'cyan', name: 'Aqua Cyan', hex: '#06b6d4' },
  { id: 'slate', name: 'Midnight Slate', hex: '#475569' },
];

export const THEME_COLORS = THEME_PRESETS.map(p => ({
  id: p.id,
  name: p.name,
  primary: p.hex,
  light: p.hex + '22',
  hover: p.hex,
}));

export type ThemeColor = string;

export function resolveHex(input?: string): string {
  if (!input) return '#715ee8';
  const trimmed = input.trim();
  const found = THEME_PRESETS.find(
    p => p.id.toLowerCase() === trimmed.toLowerCase() || p.hex.toLowerCase() === trimmed.toLowerCase()
  );
  if (found) return found.hex;
  if (trimmed.startsWith('#')) return trimmed;
  if (/^[0-9a-fA-F]{3,8}$/.test(trimmed)) return `#${trimmed}`;
  return '#715ee8';
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  hex = hex.replace('#', '').trim();
  if (hex.length === 3) {
    hex = hex.split('').map(c => c + c).join('');
  }
  const num = parseInt(hex, 16);
  if (isNaN(num)) {
    return { r: 113, g: 94, b: 232 };
  }
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

function adjustBrightness(hex: string, percent: number): string {
  const { r, g, b } = hexToRgb(hex);
  const adjust = (c: number) => Math.min(255, Math.max(0, Math.round(c * (1 + percent / 100))));
  const toHex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${toHex(adjust(r))}${toHex(adjust(g))}${toHex(adjust(b))}`;
}

export function getStoredTheme(): { mode: ThemeMode; colorHex: string; color: string } {
  if (typeof window === 'undefined') return { mode: 'light', colorHex: '#715ee8', color: '#715ee8' };
  const mode = (localStorage.getItem('optimus_theme_mode') as ThemeMode) || 'light';
  const raw = localStorage.getItem('optimus_accent_hex') || '#715ee8';
  const colorHex = resolveHex(raw);
  return { mode, colorHex, color: colorHex };
}

export function applyTheme(mode: ThemeMode, colorInput?: string) {
  if (typeof window === 'undefined') return;

  const hex = resolveHex(colorInput || localStorage.getItem('optimus_accent_hex') || '#715ee8');
  localStorage.setItem('optimus_theme_mode', mode);
  localStorage.setItem('optimus_accent_hex', hex);

  const rgb = hexToRgb(hex);
  const hoverHex = adjustBrightness(hex, -15);
  const lighterHex = adjustBrightness(hex, 25);
  const lightBg = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.16)`;
  const lightBorder = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.38)`;
  const glow = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.28)`;
  const gradient = `linear-gradient(135deg, ${lighterHex} 0%, ${hex} 55%, ${hoverHex} 100%)`;
  const darkBg = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.24)`;

  // Luminance: for bright yellow (#eab308), ensure readable dark text on buttons
  const lum = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  const contrastText = lum > 0.62 ? '#1e2433' : '#ffffff';
  // Text color on light backgrounds: deep shade for bright hues so it remains legible
  const lightBgText = lum > 0.62 ? adjustBrightness(hex, -35) : hex;
  const heroContrast = lum > 0.62 ? '#1e2433' : '#ffffff';

  const isDark =
    mode === 'dark' ||
    (mode === 'system' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);

  const root = document.documentElement;
  root.style.setProperty('--brand-primary', hex);
  root.style.setProperty('--brand-primary-hover', hoverHex);
  root.style.setProperty('--brand-primary-lighter', lighterHex);
  root.style.setProperty('--brand-primary-light', lightBg);
  root.style.setProperty('--brand-primary-border', lightBorder);
  root.style.setProperty('--brand-primary-glow', glow);
  root.style.setProperty('--brand-primary-gradient', gradient);
  root.style.setProperty('--brand-primary-dark-bg', darkBg);
  root.style.setProperty('--brand-primary-dark-text', lighterHex);
  root.style.setProperty('--brand-primary-contrast', contrastText);
  root.style.setProperty('--brand-primary-text', isDark ? lighterHex : lightBgText);
  root.style.setProperty('--hero-contrast', heroContrast);

  if (isDark) {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }

  window.dispatchEvent(new CustomEvent('optimus_theme_change', { detail: { mode, hex } }));
}
