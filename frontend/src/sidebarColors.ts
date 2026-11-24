// Sidebar Navigation Colorful Badge Configurations
// Matches Optimus Orien AI Studio Design A to Z with Luminous Auras

export interface NavColorConfig {
  color: string;
  bg: string;
  border: string;
  glow: string;
  gradStart?: string;
  gradEnd?: string;
}

export const NAV_COLORS: Record<string, NavColorConfig> = {
  // ORGANISATION & CAMPUSES
  'Overview': {
    color: '#06b6d4', // Cyan
    bg: '#ffffff',
    border: 'rgba(6, 182, 212, 0.40)',
    glow: 'rgba(6, 182, 212, 0.50)',
  },
  'Campuses': {
    color: '#d946ef', // Magenta / Fuchsia
    bg: '#ffffff',
    border: 'rgba(236, 72, 153, 0.45)',
    glow: 'rgba(236, 72, 153, 0.55)',
  },

  // ACADEMIC CONFIGURATION
  'Campus setup': {
    color: '#f43f5e', // Coral / Rose
    bg: '#ffffff',
    border: 'rgba(244, 63, 94, 0.40)',
    glow: 'rgba(244, 63, 94, 0.50)',
  },
  'Academic years': {
    color: '#f59e0b', // Amber / Orange
    bg: '#ffffff',
    border: 'rgba(245, 158, 11, 0.40)',
    glow: 'rgba(245, 158, 11, 0.50)',
  },

  // ACADEMIC STRUCTURE
  'Classes': {
    color: '#14b8a6', // Teal
    bg: '#ffffff',
    border: 'rgba(20, 184, 166, 0.40)',
    glow: 'rgba(20, 184, 166, 0.50)',
  },
  'Subjects': {
    color: '#22c55e', // Mint / Emerald
    bg: '#ffffff',
    border: 'rgba(34, 197, 94, 0.40)',
    glow: 'rgba(34, 197, 94, 0.50)',
  },

  // STUDENTS & LEARNING
  'Students': {
    color: '#6366f1', // Indigo
    bg: '#ffffff',
    border: 'rgba(99, 102, 241, 0.40)',
    glow: 'rgba(99, 102, 241, 0.50)',
  },
  'Attendance': {
    color: '#10b981', // Emerald Green
    bg: '#ffffff',
    border: 'rgba(16, 185, 129, 0.40)',
    glow: 'rgba(16, 185, 129, 0.50)',
  },
  'Homework': {
    color: '#3b82f6', // Royal Blue
    bg: '#ffffff',
    border: 'rgba(59, 130, 246, 0.40)',
    glow: 'rgba(59, 130, 246, 0.50)',
  },
  'Academics': {
    color: '#8b5cf6', // Purple Violet
    bg: '#ffffff',
    border: 'rgba(139, 92, 246, 0.40)',
    glow: 'rgba(139, 92, 246, 0.50)',
  },
  'Grading Scale': {
    color: '#ca8a04', // Amber Sunflower
    bg: '#ffffff',
    border: 'rgba(202, 138, 4, 0.40)',
    glow: 'rgba(202, 138, 4, 0.50)',
  },
  'Examinations': {
    color: '#ea580c', // Tangerine Orange
    bg: '#ffffff',
    border: 'rgba(234, 88, 12, 0.40)',
    glow: 'rgba(234, 88, 12, 0.50)',
  },
  'Academic Quality Index': {
    color: '#0891b2', // Aqua Cyan
    bg: '#ffffff',
    border: 'rgba(8, 145, 178, 0.40)',
    glow: 'rgba(8, 145, 178, 0.50)',
  },
  'Study materials': {
    color: '#0284c7', // Sky Blue
    bg: '#ffffff',
    border: 'rgba(2, 132, 199, 0.40)',
    glow: 'rgba(2, 132, 199, 0.50)',
  },
  'Student fees': {
    color: '#047857', // Forest Jade
    bg: '#ffffff',
    border: 'rgba(4, 120, 87, 0.40)',
    glow: 'rgba(4, 120, 87, 0.50)',
  },
  'Fee overview': {
    color: '#059669',
    bg: '#ffffff',
    border: 'rgba(5, 150, 105, 0.38)',
    glow: 'rgba(5, 150, 105, 0.45)',
  },
  'Fee structure': {
    color: '#0d9488',
    bg: '#ffffff',
    border: 'rgba(13, 148, 136, 0.38)',
    glow: 'rgba(13, 148, 136, 0.45)',
  },
  'Collect fee': {
    color: '#0891b2',
    bg: '#ffffff',
    border: 'rgba(8, 145, 178, 0.38)',
    glow: 'rgba(8, 145, 178, 0.45)',
  },
  'Vouchers': {
    color: '#4f46e5',
    bg: '#ffffff',
    border: 'rgba(79, 70, 229, 0.38)',
    glow: 'rgba(79, 70, 229, 0.45)',
  },
  'Defaulters': {
    color: '#e11d48',
    bg: '#ffffff',
    border: 'rgba(225, 29, 72, 0.38)',
    glow: 'rgba(225, 29, 72, 0.45)',
  },
  'Concessions': {
    color: '#d97706',
    bg: '#ffffff',
    border: 'rgba(217, 119, 6, 0.38)',
    glow: 'rgba(217, 119, 6, 0.45)',
  },
  'Receipts': {
    color: '#0284c7',
    bg: '#ffffff',
    border: 'rgba(2, 132, 199, 0.38)',
    glow: 'rgba(2, 132, 199, 0.45)',
  },
  'Timetable': {
    color: '#e11d48', // Crimson Rose
    bg: '#ffffff',
    border: 'rgba(225, 29, 72, 0.40)',
    glow: 'rgba(225, 29, 72, 0.50)',
  },

  // STUDENT SUPPORT
  'Students at Risk': {
    color: '#dc2626', // Red
    bg: '#ffffff',
    border: 'rgba(220, 38, 38, 0.40)',
    glow: 'rgba(220, 38, 38, 0.50)',
  },
  'At-risk list': {
    color: '#dc2626',
    bg: '#ffffff',
    border: 'rgba(220, 38, 38, 0.38)',
    glow: 'rgba(220, 38, 38, 0.45)',
  },
  'Risk criteria': {
    color: '#ea580c',
    bg: '#ffffff',
    border: 'rgba(234, 88, 12, 0.38)',
    glow: 'rgba(234, 88, 12, 0.45)',
  },
  'Review cases': {
    color: '#e11d48',
    bg: '#ffffff',
    border: 'rgba(225, 29, 72, 0.38)',
    glow: 'rgba(225, 29, 72, 0.45)',
  },

  // RECORD & ARCHIVE
  'Record': {
    color: '#0ea5e9', // Sky Cyan
    bg: '#ffffff',
    border: 'rgba(14, 165, 233, 0.40)',
    glow: 'rgba(14, 165, 233, 0.50)',
  },

  // FACULTY & PERFORMANCE
  'Teacher Performance': {
    color: '#9333ea', // Purple
    bg: '#ffffff',
    border: 'rgba(147, 51, 234, 0.40)',
    glow: 'rgba(147, 51, 234, 0.50)',
  },
  'Set Criteria': {
    color: '#9333ea',
    bg: '#ffffff',
    border: 'rgba(147, 51, 234, 0.38)',
    glow: 'rgba(147, 51, 234, 0.45)',
  },
  'Evaluation': {
    color: '#c026d3',
    bg: '#ffffff',
    border: 'rgba(192, 38, 211, 0.38)',
    glow: 'rgba(192, 38, 211, 0.45)',
  },

  // COMMUNICATION & NETWORKING
  'Communication': {
    color: '#ec4899', // Fuchsia Pink
    bg: '#ffffff',
    border: 'rgba(236, 72, 153, 0.45)',
    glow: 'rgba(236, 72, 153, 0.50)',
  },
  'Leaderboard': {
    color: '#f43f5e', // Coral / Rose
    bg: '#ffffff',
    border: 'rgba(244, 63, 94, 0.40)',
    glow: 'rgba(244, 63, 94, 0.50)',
  },
  'Community': {
    color: '#10b981', // Emerald Green
    bg: '#ffffff',
    border: 'rgba(16, 185, 129, 0.40)',
    glow: 'rgba(16, 185, 129, 0.50)',
  },
  'Online Assessments & Quiz Competitions': {
    color: '#8b5cf6', // Violet
    bg: '#ffffff',
    border: 'rgba(139, 92, 246, 0.40)',
    glow: 'rgba(139, 92, 246, 0.50)',
  },
  'Online Assessments': {
    color: '#8b5cf6',
    bg: '#ffffff',
    border: 'rgba(139, 92, 246, 0.40)',
    glow: 'rgba(139, 92, 246, 0.50)',
  },
  'Assessments': {
    color: '#8b5cf6',
    bg: '#ffffff',
    border: 'rgba(139, 92, 246, 0.40)',
    glow: 'rgba(139, 92, 246, 0.50)',
  },
  'Announcements': {
    color: '#d97706', // Amber Gold
    bg: '#ffffff',
    border: 'rgba(217, 119, 6, 0.40)',
    glow: 'rgba(217, 119, 6, 0.50)',
  },

  // PEOPLE & HR
  'Staff': {
    color: '#4f46e5', // Royal Indigo
    bg: '#ffffff',
    border: 'rgba(79, 70, 229, 0.40)',
    glow: 'rgba(79, 70, 229, 0.50)',
  },
  'Staff Salaries': {
    color: '#059669', // Emerald
    bg: '#ffffff',
    border: 'rgba(5, 150, 105, 0.40)',
    glow: 'rgba(5, 150, 105, 0.50)',
  },

  // FINANCE & BILLING
  'Finance': {
    color: '#10b981', // Emerald
    bg: '#ffffff',
    border: 'rgba(16, 185, 129, 0.40)',
    glow: 'rgba(16, 185, 129, 0.50)',
  },

  // DATA MANAGEMENT
  'Data import': {
    color: '#0284c7', // Sky Blue
    bg: '#ffffff',
    border: 'rgba(2, 132, 199, 0.40)',
    glow: 'rgba(2, 132, 199, 0.50)',
  },

  // INSIGHTS & SYSTEM
  'Reports': {
    color: '#6366f1', // Indigo
    bg: '#ffffff',
    border: 'rgba(99, 102, 241, 0.40)',
    glow: 'rgba(99, 102, 241, 0.50)',
  },
  'Permissions': {
    color: '#0d9488', // Teal
    bg: '#ffffff',
    border: 'rgba(13, 148, 136, 0.40)',
    glow: 'rgba(13, 148, 136, 0.50)',
  },
  'Audit log': {
    color: '#475569', // Slate
    bg: '#ffffff',
    border: 'rgba(71, 85, 105, 0.40)',
    glow: 'rgba(71, 85, 105, 0.50)',
  },
  'Platform owner': {
    color: '#d97706', // Amber
    bg: '#ffffff',
    border: 'rgba(217, 119, 6, 0.40)',
    glow: 'rgba(217, 119, 6, 0.50)',
  },
  'Notifications': {
    color: '#f59e0b', // Amber
    bg: '#ffffff',
    border: 'rgba(245, 158, 11, 0.40)',
    glow: 'rgba(245, 158, 11, 0.50)',
  },
  'Settings': {
    color: '#06b6d4', // Aqua Cyan
    bg: '#ffffff',
    border: 'rgba(6, 182, 212, 0.40)',
    glow: 'rgba(6, 182, 212, 0.50)',
  },
  'Profile': {
    color: '#06b6d4',
    bg: '#ffffff',
    border: 'rgba(6, 182, 212, 0.40)',
    glow: 'rgba(6, 182, 212, 0.50)',
  },
  'My Profile': {
    color: '#06b6d4',
    bg: '#ffffff',
    border: 'rgba(6, 182, 212, 0.40)',
    glow: 'rgba(6, 182, 212, 0.50)',
  },
  'Profile & Security': {
    color: '#06b6d4',
    bg: '#ffffff',
    border: 'rgba(6, 182, 212, 0.40)',
    glow: 'rgba(6, 182, 212, 0.50)',
  },

  // Role-Specific Aliases
  'My Home': {
    color: '#06b6d4',
    bg: '#ffffff',
    border: 'rgba(6, 182, 212, 0.40)',
    glow: 'rgba(6, 182, 212, 0.50)',
  },
  'My Dashboard': {
    color: '#06b6d4',
    bg: '#ffffff',
    border: 'rgba(6, 182, 212, 0.40)',
    glow: 'rgba(6, 182, 212, 0.50)',
  },
  'My Class': {
    color: '#2563eb',
    bg: '#ffffff',
    border: 'rgba(37, 99, 235, 0.40)',
    glow: 'rgba(37, 99, 235, 0.50)',
  },
  'My Subjects': {
    color: '#16a34a',
    bg: '#ffffff',
    border: 'rgba(22, 163, 74, 0.40)',
    glow: 'rgba(22, 163, 74, 0.50)',
  },
  'My Students': {
    color: '#6366f1',
    bg: '#ffffff',
    border: 'rgba(99, 102, 241, 0.40)',
    glow: 'rgba(99, 102, 241, 0.50)',
  },
  'My Attendance': {
    color: '#10b981',
    bg: '#ffffff',
    border: 'rgba(16, 185, 129, 0.40)',
    glow: 'rgba(16, 185, 129, 0.50)',
  },
  'Academics / Exams': {
    color: '#ea580c',
    bg: '#ffffff',
    border: 'rgba(234, 88, 12, 0.40)',
    glow: 'rgba(234, 88, 12, 0.50)',
  },
  'Academic Quality (AQI)': {
    color: '#0891b2',
    bg: '#ffffff',
    border: 'rgba(8, 145, 178, 0.40)',
    glow: 'rgba(8, 145, 178, 0.50)',
  },
  'My Performance': {
    color: '#9333ea',
    bg: '#ffffff',
    border: 'rgba(147, 51, 234, 0.40)',
    glow: 'rgba(147, 51, 234, 0.50)',
  },
  'Results & Progress': {
    color: '#6366f1',
    bg: '#ffffff',
    border: 'rgba(99, 102, 241, 0.40)',
    glow: 'rgba(99, 102, 241, 0.50)',
  },
  'Class Discussion': {
    color: '#ea580c',
    bg: '#ffffff',
    border: 'rgba(234, 88, 12, 0.40)',
    glow: 'rgba(234, 88, 12, 0.50)',
  },
};

export const DEFAULT_NAV_COLOR: NavColorConfig = {
  color: '#06b6d4',
  bg: '#ffffff',
  border: 'rgba(6, 182, 212, 0.40)',
  glow: 'rgba(6, 182, 212, 0.50)',
};

export function getNavColorConfig(name: string): NavColorConfig {
  return NAV_COLORS[name] || DEFAULT_NAV_COLOR;
}
