// Sidebar Navigation Colorful Badge Configurations
// Matches Optimus Orien AI Studio Design A to Z

export interface NavColorConfig {
  color: string;
  bg: string;
  border: string;
  gradStart: string;
  gradEnd: string;
  glow: string;
}

export const NAV_COLORS: Record<string, NavColorConfig> = {
  // ORGANISATION & CAMPUSES
  'Overview': {
    color: '#0284c7', // Sky Blue
    bg: 'rgba(2, 132, 199, 0.12)',
    border: 'rgba(2, 132, 199, 0.26)',
    gradStart: '#38bdf8',
    gradEnd: '#0284c7',
    glow: 'rgba(2, 132, 199, 0.38)',
  },
  'Campuses': {
    color: '#c026d3', // Magenta / Fuchsia
    bg: 'rgba(192, 38, 211, 0.12)',
    border: 'rgba(192, 38, 211, 0.26)',
    gradStart: '#ec4899',
    gradEnd: '#a855f7',
    glow: 'rgba(217, 70, 239, 0.40)',
  },

  // ACADEMIC CONFIGURATION
  'Campus setup': {
    color: '#e11d48', // Coral / Rose
    bg: 'rgba(225, 29, 72, 0.12)',
    border: 'rgba(225, 29, 72, 0.26)',
    gradStart: '#fb7185',
    gradEnd: '#e11d48',
    glow: 'rgba(225, 29, 72, 0.38)',
  },
  'Academic years': {
    color: '#d97706', // Amber / Orange
    bg: 'rgba(217, 119, 6, 0.12)',
    border: 'rgba(217, 119, 6, 0.26)',
    gradStart: '#fbbf24',
    gradEnd: '#ea580c',
    glow: 'rgba(217, 119, 6, 0.38)',
  },

  // ACADEMIC STRUCTURE
  'Classes': {
    color: '#0d9488', // Teal
    bg: 'rgba(13, 148, 136, 0.12)',
    border: 'rgba(13, 148, 136, 0.26)',
    gradStart: '#2dd4bf',
    gradEnd: '#0d9488',
    glow: 'rgba(13, 148, 136, 0.38)',
  },
  'Subjects': {
    color: '#16a34a', // Mint / Emerald
    bg: 'rgba(22, 163, 74, 0.12)',
    border: 'rgba(22, 163, 74, 0.26)',
    gradStart: '#4ade80',
    gradEnd: '#16a34a',
    glow: 'rgba(22, 163, 74, 0.38)',
  },

  // STUDENTS & LEARNING
  'Students': {
    color: '#6366f1', // Indigo
    bg: 'rgba(99, 102, 241, 0.12)',
    border: 'rgba(99, 102, 241, 0.26)',
    gradStart: '#818cf8',
    gradEnd: '#4f46e5',
    glow: 'rgba(99, 102, 241, 0.38)',
  },
  'Attendance': {
    color: '#059669', // Emerald Green
    bg: 'rgba(5, 150, 105, 0.12)',
    border: 'rgba(5, 150, 105, 0.26)',
    gradStart: '#34d399',
    gradEnd: '#059669',
    glow: 'rgba(5, 150, 105, 0.38)',
  },
  'Homework': {
    color: '#2563eb', // Royal Blue
    bg: 'rgba(37, 99, 235, 0.12)',
    border: 'rgba(37, 99, 235, 0.26)',
    gradStart: '#60a5fa',
    gradEnd: '#2563eb',
    glow: 'rgba(37, 99, 235, 0.38)',
  },
  'Academics': {
    color: '#7c3aed', // Purple Violet
    bg: 'rgba(124, 58, 237, 0.12)',
    border: 'rgba(124, 58, 237, 0.26)',
    gradStart: '#a78bfa',
    gradEnd: '#7c3aed',
    glow: 'rgba(124, 58, 237, 0.38)',
  },
  'Grading Scale': {
    color: '#ca8a04', // Amber Sunflower
    bg: 'rgba(202, 138, 4, 0.12)',
    border: 'rgba(202, 138, 4, 0.26)',
    gradStart: '#facc15',
    gradEnd: '#ca8a04',
    glow: 'rgba(202, 138, 4, 0.38)',
  },
  'Examinations': {
    color: '#ea580c', // Tangerine Orange
    bg: 'rgba(234, 88, 12, 0.12)',
    border: 'rgba(234, 88, 12, 0.26)',
    gradStart: '#fb923c',
    gradEnd: '#ea580c',
    glow: 'rgba(234, 88, 12, 0.38)',
  },
  'Academic Quality Index': {
    color: '#0891b2', // Cyan / Aqua
    bg: 'rgba(8, 145, 178, 0.12)',
    border: 'rgba(8, 145, 178, 0.26)',
    gradStart: '#22d3ee',
    gradEnd: '#0891b2',
    glow: 'rgba(8, 145, 178, 0.38)',
  },
  'Study materials': {
    color: '#0284c7', // Sky Blue
    bg: 'rgba(2, 132, 199, 0.12)',
    border: 'rgba(2, 132, 199, 0.26)',
    gradStart: '#38bdf8',
    gradEnd: '#0369a1',
    glow: 'rgba(2, 132, 199, 0.38)',
  },
  'Student fees': {
    color: '#047857', // Forest Jade
    bg: 'rgba(4, 120, 87, 0.12)',
    border: 'rgba(4, 120, 87, 0.26)',
    gradStart: '#10b981',
    gradEnd: '#047857',
    glow: 'rgba(4, 120, 87, 0.38)',
  },
  'Fee overview': {
    color: '#059669',
    bg: 'rgba(5, 150, 105, 0.12)',
    border: 'rgba(5, 150, 105, 0.24)',
    gradStart: '#34d399',
    gradEnd: '#059669',
    glow: 'rgba(5, 150, 105, 0.35)',
  },
  'Fee structure': {
    color: '#0d9488',
    bg: 'rgba(13, 148, 136, 0.12)',
    border: 'rgba(13, 148, 136, 0.24)',
    gradStart: '#2dd4bf',
    gradEnd: '#0d9488',
    glow: 'rgba(13, 148, 136, 0.35)',
  },
  'Collect fee': {
    color: '#0891b2',
    bg: 'rgba(8, 145, 178, 0.12)',
    border: 'rgba(8, 145, 178, 0.24)',
    gradStart: '#22d3ee',
    gradEnd: '#0891b2',
    glow: 'rgba(8, 145, 178, 0.35)',
  },
  'Vouchers': {
    color: '#4f46e5',
    bg: 'rgba(79, 70, 229, 0.12)',
    border: 'rgba(79, 70, 229, 0.24)',
    gradStart: '#818cf8',
    gradEnd: '#4f46e5',
    glow: 'rgba(79, 70, 229, 0.35)',
  },
  'Defaulters': {
    color: '#e11d48',
    bg: 'rgba(225, 29, 72, 0.12)',
    border: 'rgba(225, 29, 72, 0.24)',
    gradStart: '#fb7185',
    gradEnd: '#e11d48',
    glow: 'rgba(225, 29, 72, 0.35)',
  },
  'Concessions': {
    color: '#d97706',
    bg: 'rgba(217, 119, 6, 0.12)',
    border: 'rgba(217, 119, 6, 0.24)',
    gradStart: '#fbbf24',
    gradEnd: '#d97706',
    glow: 'rgba(217, 119, 6, 0.35)',
  },
  'Receipts': {
    color: '#0284c7',
    bg: 'rgba(2, 132, 199, 0.12)',
    border: 'rgba(2, 132, 199, 0.24)',
    gradStart: '#38bdf8',
    gradEnd: '#0284c7',
    glow: 'rgba(2, 132, 199, 0.35)',
  },
  'Timetable': {
    color: '#e11d48', // Crimson Rose
    bg: 'rgba(225, 29, 72, 0.12)',
    border: 'rgba(225, 29, 72, 0.26)',
    gradStart: '#f43f5e',
    gradEnd: '#be123c',
    glow: 'rgba(225, 29, 72, 0.38)',
  },

  // STUDENT SUPPORT
  'Students at Risk': {
    color: '#dc2626', // Red Warning
    bg: 'rgba(220, 38, 38, 0.12)',
    border: 'rgba(220, 38, 38, 0.26)',
    gradStart: '#f87171',
    gradEnd: '#dc2626',
    glow: 'rgba(220, 38, 38, 0.38)',
  },
  'At-risk list': {
    color: '#dc2626',
    bg: 'rgba(220, 38, 38, 0.12)',
    border: 'rgba(220, 38, 38, 0.24)',
    gradStart: '#f87171',
    gradEnd: '#dc2626',
    glow: 'rgba(220, 38, 38, 0.35)',
  },
  'Risk criteria': {
    color: '#ea580c',
    bg: 'rgba(234, 88, 12, 0.12)',
    border: 'rgba(234, 88, 12, 0.24)',
    gradStart: '#fb923c',
    gradEnd: '#ea580c',
    glow: 'rgba(234, 88, 12, 0.35)',
  },
  'Review cases': {
    color: '#e11d48',
    bg: 'rgba(225, 29, 72, 0.12)',
    border: 'rgba(225, 29, 72, 0.24)',
    gradStart: '#fb7185',
    gradEnd: '#e11d48',
    glow: 'rgba(225, 29, 72, 0.35)',
  },

  // RECORD & ARCHIVE
  'Record': {
    color: '#0ea5e9', // Sky Cyan
    bg: 'rgba(14, 165, 233, 0.12)',
    border: 'rgba(14, 165, 233, 0.26)',
    gradStart: '#38bdf8',
    gradEnd: '#0284c7',
    glow: 'rgba(14, 165, 233, 0.38)',
  },

  // FACULTY & PERFORMANCE
  'Teacher Performance': {
    color: '#9333ea', // Purple
    bg: 'rgba(147, 51, 234, 0.12)',
    border: 'rgba(147, 51, 234, 0.26)',
    gradStart: '#c084fc',
    gradEnd: '#7e22ce',
    glow: 'rgba(147, 51, 234, 0.38)',
  },
  'Set Criteria': {
    color: '#9333ea',
    bg: 'rgba(147, 51, 234, 0.12)',
    border: 'rgba(147, 51, 234, 0.24)',
    gradStart: '#c084fc',
    gradEnd: '#7e22ce',
    glow: 'rgba(147, 51, 234, 0.35)',
  },
  'Evaluation': {
    color: '#c026d3',
    bg: 'rgba(192, 38, 211, 0.12)',
    border: 'rgba(192, 38, 211, 0.24)',
    gradStart: '#e879f9',
    gradEnd: '#a21caf',
    glow: 'rgba(192, 38, 211, 0.35)',
  },

  // COMMUNICATION & NETWORKING
  'Communication': {
    color: '#ea580c', // Sunset Orange
    bg: 'rgba(234, 88, 12, 0.12)',
    border: 'rgba(234, 88, 12, 0.26)',
    gradStart: '#fb923c',
    gradEnd: '#d97706',
    glow: 'rgba(234, 88, 12, 0.38)',
  },
  'Leaderboard': {
    color: '#f43f5e', // Coral / Rose
    bg: 'rgba(244, 63, 94, 0.12)',
    border: 'rgba(244, 63, 94, 0.26)',
    gradStart: '#fb7185',
    gradEnd: '#e11d48',
    glow: 'rgba(244, 63, 94, 0.38)',
  },
  'Community': {
    color: '#10b981', // Emerald Green
    bg: 'rgba(16, 185, 129, 0.12)',
    border: 'rgba(16, 185, 129, 0.26)',
    gradStart: '#34d399',
    gradEnd: '#059669',
    glow: 'rgba(16, 185, 129, 0.38)',
  },
  'Online Assessments & Quiz Competitions': {
    color: '#8b5cf6', // Violet
    bg: 'rgba(139, 92, 246, 0.12)',
    border: 'rgba(139, 92, 246, 0.26)',
    gradStart: '#a78bfa',
    gradEnd: '#6d28d9',
    glow: 'rgba(139, 92, 246, 0.38)',
  },
  'Online Assessments': {
    color: '#8b5cf6',
    bg: 'rgba(139, 92, 246, 0.12)',
    border: 'rgba(139, 92, 246, 0.26)',
    gradStart: '#a78bfa',
    gradEnd: '#6d28d9',
    glow: 'rgba(139, 92, 246, 0.38)',
  },
  'Assessments': {
    color: '#8b5cf6',
    bg: 'rgba(139, 92, 246, 0.12)',
    border: 'rgba(139, 92, 246, 0.26)',
    gradStart: '#a78bfa',
    gradEnd: '#6d28d9',
    glow: 'rgba(139, 92, 246, 0.38)',
  },
  'Announcements': {
    color: '#d97706', // Amber Gold
    bg: 'rgba(217, 119, 6, 0.12)',
    border: 'rgba(217, 119, 6, 0.26)',
    gradStart: '#f59e0b',
    gradEnd: '#b45309',
    glow: 'rgba(217, 119, 6, 0.38)',
  },

  // PEOPLE & HR
  'Staff': {
    color: '#4f46e5', // Royal Indigo
    bg: 'rgba(79, 70, 229, 0.12)',
    border: 'rgba(79, 70, 229, 0.26)',
    gradStart: '#818cf8',
    gradEnd: '#3730a3',
    glow: 'rgba(79, 70, 229, 0.38)',
  },
  'Staff Salaries': {
    color: '#059669', // Emerald
    bg: 'rgba(5, 150, 105, 0.12)',
    border: 'rgba(5, 150, 105, 0.26)',
    gradStart: '#34d399',
    gradEnd: '#047857',
    glow: 'rgba(5, 150, 105, 0.38)',
  },

  // FINANCE & BILLING
  'Finance': {
    color: '#10b981', // Emerald
    bg: 'rgba(16, 185, 129, 0.12)',
    border: 'rgba(16, 185, 129, 0.26)',
    gradStart: '#34d399',
    gradEnd: '#059669',
    glow: 'rgba(16, 185, 129, 0.38)',
  },

  // DATA MANAGEMENT
  'Data import': {
    color: '#0284c7', // Sky Blue
    bg: 'rgba(2, 132, 199, 0.12)',
    border: 'rgba(2, 132, 199, 0.26)',
    gradStart: '#38bdf8',
    gradEnd: '#0284c7',
    glow: 'rgba(2, 132, 199, 0.38)',
  },

  // INSIGHTS & SYSTEM
  'Reports': {
    color: '#6366f1', // Indigo
    bg: 'rgba(99, 102, 241, 0.12)',
    border: 'rgba(99, 102, 241, 0.26)',
    gradStart: '#818cf8',
    gradEnd: '#4f46e5',
    glow: 'rgba(99, 102, 241, 0.38)',
  },
  'Permissions': {
    color: '#0d9488', // Teal
    bg: 'rgba(13, 148, 136, 0.12)',
    border: 'rgba(13, 148, 136, 0.26)',
    gradStart: '#2dd4bf',
    gradEnd: '#0f766e',
    glow: 'rgba(13, 148, 136, 0.38)',
  },
  'Audit log': {
    color: '#475569', // Slate
    bg: 'rgba(71, 85, 105, 0.12)',
    border: 'rgba(71, 85, 105, 0.26)',
    gradStart: '#94a3b8',
    gradEnd: '#334155',
    glow: 'rgba(71, 85, 105, 0.38)',
  },
  'Platform owner': {
    color: '#d97706', // Amber
    bg: 'rgba(217, 119, 6, 0.12)',
    border: 'rgba(217, 119, 6, 0.26)',
    gradStart: '#fbbf24',
    gradEnd: '#d97706',
    glow: 'rgba(217, 119, 6, 0.38)',
  },
  'Notifications': {
    color: '#f59e0b', // Amber
    bg: 'rgba(245, 158, 11, 0.12)',
    border: 'rgba(245, 158, 11, 0.26)',
    gradStart: '#fbbf24',
    gradEnd: '#ea580c',
    glow: 'rgba(245, 158, 11, 0.38)',
  },
  'Settings': {
    color: '#06b6d4', // Aqua Cyan
    bg: 'rgba(6, 182, 212, 0.12)',
    border: 'rgba(6, 182, 212, 0.26)',
    gradStart: '#22d3ee',
    gradEnd: '#0891b2',
    glow: 'rgba(6, 182, 212, 0.38)',
  },
  'Profile': {
    color: '#06b6d4',
    bg: 'rgba(6, 182, 212, 0.12)',
    border: 'rgba(6, 182, 212, 0.26)',
    gradStart: '#22d3ee',
    gradEnd: '#0891b2',
    glow: 'rgba(6, 182, 212, 0.38)',
  },
  'My Profile': {
    color: '#06b6d4',
    bg: 'rgba(6, 182, 212, 0.12)',
    border: 'rgba(6, 182, 212, 0.26)',
    gradStart: '#22d3ee',
    gradEnd: '#0891b2',
    glow: 'rgba(6, 182, 212, 0.38)',
  },
  'Profile & Security': {
    color: '#06b6d4',
    bg: 'rgba(6, 182, 212, 0.12)',
    border: 'rgba(6, 182, 212, 0.26)',
    gradStart: '#22d3ee',
    gradEnd: '#0891b2',
    glow: 'rgba(6, 182, 212, 0.38)',
  },

  // Role-Specific Aliases
  'My Home': {
    color: '#0284c7',
    bg: 'rgba(2, 132, 199, 0.12)',
    border: 'rgba(2, 132, 199, 0.26)',
    gradStart: '#38bdf8',
    gradEnd: '#0284c7',
    glow: 'rgba(2, 132, 199, 0.38)',
  },
  'My Dashboard': {
    color: '#0284c7',
    bg: 'rgba(2, 132, 199, 0.12)',
    border: 'rgba(2, 132, 199, 0.26)',
    gradStart: '#38bdf8',
    gradEnd: '#0284c7',
    glow: 'rgba(2, 132, 199, 0.38)',
  },
  'My Class': {
    color: '#2563eb',
    bg: 'rgba(37, 99, 235, 0.12)',
    border: 'rgba(37, 99, 235, 0.26)',
    gradStart: '#60a5fa',
    gradEnd: '#2563eb',
    glow: 'rgba(37, 99, 235, 0.38)',
  },
  'My Subjects': {
    color: '#16a34a',
    bg: 'rgba(22, 163, 74, 0.12)',
    border: 'rgba(22, 163, 74, 0.26)',
    gradStart: '#4ade80',
    gradEnd: '#16a34a',
    glow: 'rgba(22, 163, 74, 0.38)',
  },
  'My Students': {
    color: '#6366f1',
    bg: 'rgba(99, 102, 241, 0.12)',
    border: 'rgba(99, 102, 241, 0.26)',
    gradStart: '#818cf8',
    gradEnd: '#4f46e5',
    glow: 'rgba(99, 102, 241, 0.38)',
  },
  'My Attendance': {
    color: '#059669',
    bg: 'rgba(5, 150, 105, 0.12)',
    border: 'rgba(5, 150, 105, 0.26)',
    gradStart: '#34d399',
    gradEnd: '#059669',
    glow: 'rgba(5, 150, 105, 0.38)',
  },
  'Academics / Exams': {
    color: '#ea580c',
    bg: 'rgba(234, 88, 12, 0.12)',
    border: 'rgba(234, 88, 12, 0.26)',
    gradStart: '#fb923c',
    gradEnd: '#ea580c',
    glow: 'rgba(234, 88, 12, 0.38)',
  },
  'Academic Quality (AQI)': {
    color: '#0891b2',
    bg: 'rgba(8, 145, 178, 0.12)',
    border: 'rgba(8, 145, 178, 0.26)',
    gradStart: '#22d3ee',
    gradEnd: '#0891b2',
    glow: 'rgba(8, 145, 178, 0.38)',
  },
  'My Performance': {
    color: '#9333ea',
    bg: 'rgba(147, 51, 234, 0.12)',
    border: 'rgba(147, 51, 234, 0.26)',
    gradStart: '#c084fc',
    gradEnd: '#7e22ce',
    glow: 'rgba(147, 51, 234, 0.38)',
  },
  'Results & Progress': {
    color: '#6366f1',
    bg: 'rgba(99, 102, 241, 0.12)',
    border: 'rgba(99, 102, 241, 0.26)',
    gradStart: '#818cf8',
    gradEnd: '#4f46e5',
    glow: 'rgba(99, 102, 241, 0.38)',
  },
  'Class Discussion': {
    color: '#ea580c',
    bg: 'rgba(234, 88, 12, 0.12)',
    border: 'rgba(234, 88, 12, 0.26)',
    gradStart: '#fb923c',
    gradEnd: '#d97706',
    glow: 'rgba(234, 88, 12, 0.38)',
  },
};

// Fallback configuration if a new item is added without explicit mapping
export const DEFAULT_NAV_COLOR: NavColorConfig = {
  color: '#06b6d4',
  bg: 'rgba(6, 182, 212, 0.12)',
  border: 'rgba(6, 182, 212, 0.26)',
  gradStart: '#22d3ee',
  gradEnd: '#0891b2',
  glow: 'rgba(6, 182, 212, 0.38)',
};

export function getNavColorConfig(name: string): NavColorConfig {
  return NAV_COLORS[name] || DEFAULT_NAV_COLOR;
}
