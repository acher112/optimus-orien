import type { CSSProperties } from 'react';

/**
 * Performance, Risk & Academic Grade Color Palette & Helpers
 *
 * System-wide standard color mapping:
 * - RED: Warning / High Risk / Critical Deficit / Needs Support / Failing Grade (F, D) / Below Benchmark
 * - GREEN: Best Performance / On Track / Low Risk / Secure / Top Grades (A+, A) / Exceeding Benchmark
 * - BLUE: Good Achievement / Above Average / Commendable / Grade B / Steady
 * - AMBER: Moderate / Average / Progressing / Watch Level / Medium Risk / Grade C
 * - PURPLE: Outstanding / Honors / Distinction
 * - SLATE: Insufficient Data / No Marks / Neutral Pending
 */

export interface ColorPillStyle extends CSSProperties {
  bg: string;
  text: string;
  border: string;
  dot?: string;
  solid: string;
  label?: string;
  background?: string;
  backgroundColor?: string;
  color?: string;
  borderColor?: string;
}

export interface DifferenceStyle extends CSSProperties {
  text: string;
  bg: string;
  sign: string;
  color: string;
  background: string;
  backgroundColor: string;
}

function makeStyle(bg: string, text: string, border: string, solid: string, label?: string, dot?: string): ColorPillStyle {
  return {
    bg,
    text,
    border,
    solid,
    label,
    dot,
    background: bg,
    backgroundColor: bg,
    color: text,
    borderColor: border
  };
}

/**
 * Returns color style based on numerical score or percentage (0 - 100).
 */
export function getScoreColorStyle(pct: number | null | undefined, benchmark = 60): ColorPillStyle {
  if (pct === null || pct === undefined || isNaN(pct)) {
    return makeStyle('#f1f5f9', '#64748b', '#cbd5e1', '#94a3b8', 'No Data');
  }

  if (pct >= 80) {
    // Best / Distinction (Green)
    return makeStyle('#dcfce7', '#15803d', '#86efac', '#16a34a', 'Best');
  }

  if (pct >= benchmark) {
    // Good / On Track (Blue)
    return makeStyle('#dbeafe', '#1d4ed8', '#93c5fd', '#2563eb', 'Good');
  }

  if (pct >= benchmark - 10) {
    // Moderate / Watch (Amber)
    return makeStyle('#fef3c7', '#b45309', '#fde047', '#d97706', 'Watch');
  }

  // Warning Risk / Deficit (Red)
  return makeStyle('#fee2e2', '#b91c1c', '#fca5a5', '#dc2626', 'Risk');
}

/**
 * Returns color style for letter grades (A+, A, B, C, D, F).
 */
export function getGradeBadgeStyle(letter: string | null | undefined): ColorPillStyle {
  if (!letter) {
    return makeStyle('#f1f5f9', '#64748b', '#cbd5e1', '#94a3b8', '—');
  }

  const clean = letter.toUpperCase().trim();

  if (clean === 'A+' || clean === 'O') {
    // Outstanding / Honors (Purple)
    return makeStyle('#f3e8ff', '#6b21a8', '#d8b4fe', '#7c3aed', 'Outstanding');
  }

  if (clean === 'A' || clean === 'A-') {
    // Best / Excellent (Green)
    return makeStyle('#dcfce7', '#15803d', '#86efac', '#16a34a', 'Best');
  }

  if (clean.startsWith('B')) {
    // Good (Blue)
    return makeStyle('#dbeafe', '#1e40af', '#93c5fd', '#2563eb', 'Good');
  }

  if (clean.startsWith('C')) {
    // Average / Satisfactory (Amber)
    return makeStyle('#fef3c7', '#b45309', '#fde047', '#d97706', 'Average');
  }

  if (clean.startsWith('D')) {
    // Marginal / Low Pass (Orange)
    return makeStyle('#ffedd5', '#c2410c', '#fdba74', '#ea580c', 'Low Pass');
  }

  if (clean === 'F' || clean === 'FAIL' || clean === 'U') {
    // Failing / Risk (Warning Red)
    return makeStyle('#fee2e2', '#991b1b', '#fca5a5', '#dc2626', 'Remedial Risk');
  }

  return makeStyle('#f1f5f9', '#475569', '#cbd5e1', '#64748b', clean);
}

/**
 * Returns color style for Risk levels (high, medium, low, insufficient).
 */
export function getRiskBadgeStyle(level: string | null | undefined): ColorPillStyle {
  const norm = (level || '').toLowerCase().trim();

  if (['high', 'critical', 'needs_support', 'severe', 'at_risk', 'risk'].includes(norm)) {
    // High Risk / Warning (Red)
    return makeStyle('#fee2e2', '#b91c1c', '#fca5a5', '#dc2626', 'High Risk', '#ef4444');
  }

  if (['medium', 'watch', 'moderate', 'progressing'].includes(norm)) {
    // Medium Risk / Watch (Amber)
    return makeStyle('#fef3c7', '#b45309', '#fde047', '#d97706', 'Medium', '#f59e0b');
  }

  if (['low', 'on_track', 'secure', 'safe', 'best'].includes(norm)) {
    // Low Risk / On Track (Green Best)
    return makeStyle('#dcfce7', '#15803d', '#86efac', '#16a34a', 'On Track', '#22c55e');
  }

  // Insufficient Data / No marks (Slate)
  return makeStyle('#f1f5f9', '#64748b', '#cbd5e1', '#64748b', 'Insufficient Data', '#94a3b8');
}

/**
 * Returns color for points difference (+/-).
 */
export function getDifferenceStyle(diff: number | null | undefined): DifferenceStyle {
  if (diff === null || diff === undefined || isNaN(diff)) {
    return { text: '#64748b', bg: '#f1f5f9', sign: '', color: '#64748b', background: '#f1f5f9', backgroundColor: '#f1f5f9' };
  }

  if (diff > 0) {
    return { text: '#15803d', bg: '#dcfce7', sign: '+', color: '#15803d', background: '#dcfce7', backgroundColor: '#dcfce7' };
  }

  if (diff < 0) {
    return { text: '#b91c1c', bg: '#fee2e2', sign: '', color: '#b91c1c', background: '#fee2e2', backgroundColor: '#fee2e2' };
  }

  return { text: '#64748b', bg: '#f1f5f9', sign: '', color: '#64748b', background: '#f1f5f9', backgroundColor: '#f1f5f9' };
}

/**
 * Returns color style for attendance percentage.
 */
export function getAttendanceStyle(rate: number | null | undefined): ColorPillStyle {
  if (rate === null || rate === undefined || isNaN(rate)) {
    return makeStyle('#f1f5f9', '#64748b', '#cbd5e1', '#94a3b8', '—');
  }

  if (rate >= 90) {
    return makeStyle('#dcfce7', '#15803d', '#86efac', '#16a34a', 'Excellent');
  }

  if (rate >= 75) {
    return makeStyle('#dbeafe', '#1d4ed8', '#93c5fd', '#2563eb', 'Regular');
  }

  if (rate >= 65) {
    return makeStyle('#fef3c7', '#b45309', '#fde047', '#d97706', 'Irregular');
  }

  // Warning Attendance Deficit (Red)
  return makeStyle('#fee2e2', '#b91c1c', '#fca5a5', '#dc2626', 'Critical Deficit');
}
