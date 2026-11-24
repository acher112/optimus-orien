// Sidebar Navigation Theme-based Badge Configurations
// Unified theme color with luminous aura removed per design request

export interface NavColorConfig {
  color: string;
  bg: string;
  border: string;
  glow: string;
  gradStart?: string;
  gradEnd?: string;
}

export const THEME_NAV_COLOR: NavColorConfig = {
  color: 'var(--brand-primary, #06b6d4)',
  bg: '#ffffff',
  border: 'var(--brand-primary-border, rgba(6, 182, 212, 0.28))',
  glow: 'none',
  gradStart: 'var(--brand-primary, #06b6d4)',
  gradEnd: 'var(--brand-primary-hover, #0891b2)',
};

export const DEFAULT_NAV_COLOR: NavColorConfig = THEME_NAV_COLOR;

export const NAV_COLORS: Record<string, NavColorConfig> = new Proxy({} as Record<string, NavColorConfig>, {
  get: () => THEME_NAV_COLOR,
});

export function getNavColorConfig(_name?: string): NavColorConfig {
  return THEME_NAV_COLOR;
}
