import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Activity, ArrowDownRight, ArrowRight, ArrowUpRight, Award, Banknote, BarChart3, Bell, BookOpen,
  Building2, CalendarDays, Camera, Check, CheckCircle2, ChevronDown, ChevronLeft,
  ChevronRight, ClipboardCheck, ClipboardList, Download, FileBarChart, GraduationCap,
  HeartHandshake, LayoutDashboard, LogOut, Megaphone, Menu, MessageSquare, MoreHorizontal,
  Pencil, Plus, Receipt, RefreshCw, Search, Settings2, ShieldCheck, ShieldAlert, SlidersHorizontal,
  Sparkles, Sun, Moon, Trash2, TrendingUp, Upload, UploadCloud, UserCheck, UserRound, Users,
  Wallet, X, AlertCircle, Clock, FileSpreadsheet, KeyRound
} from 'lucide-react';
import { Area, AreaChart, Bar, BarChart, Line, ComposedChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from 'recharts';
import {
  request, login, register, logout, list, create, update, destroy,
  createAccount, registerCampus, schoolUsers, updateProfile, forgotPassword, resetPassword,
  type User, type Dashboard, type Resource
} from './api';
import PublicHome from './PublicHome';
import SchoolSetup from './SchoolSetup';
import Reports from './Reports';
import Staff from './Staff';
import Finance from './Finance';
import Fees from './Fees';
import Salaries from './Salaries';
import Examinations from './Examinations';
import AcademicQualityIndex from './AcademicQualityIndex';
import PlatformOwner from './PlatformOwner';
import DataImport from './DataImport';
import MyPerformance from './MyPerformance';
import Communication from './Communication';
import Announcements from './Announcements';
import Timetable from './Timetable';
import StudyMaterials from './StudyMaterials';
import ExportMenu from './ExportMenu';
import Settings from './Settings';
import Permissions from './Permissions';
import StudentsAtRisk from './StudentsAtRisk';
import DashboardFinanceChart from './DashboardFinanceChart';
import PrincipalHome from './PrincipalHome';
import TeacherHome from './TeacherHome';
import TeacherMyClass from './TeacherMyClass';
import TeacherMySubjects from './TeacherMySubjects';
import { FilterBar, type FilterConfig } from './FilterBar';
import { getStoredTheme, applyTheme, type ThemeMode } from './theme';
import ErrorBoundary from './ErrorBoundary';
import PasswordField from './PasswordField';
import AttendanceModule from './AttendanceModule';
import './style.css';

const WORKSPACE_NAV = [
  { name: 'Overview', icon: LayoutDashboard },
  { name: 'Campuses', icon: Building2, adminOnly: true },
  { name: 'Campus setup', icon: Settings2, adminOnly: true },
  { name: 'Academic years', icon: CalendarDays, adminOnly: true },
  { name: 'Classes', icon: Users },
  { name: 'Subjects', icon: BookOpen },
  { name: 'Students', icon: GraduationCap },
  { name: 'Attendance', icon: ClipboardCheck },
  { name: 'Homework', icon: ClipboardList },
  { name: 'Academics', icon: FileBarChart },
  { name: 'Examinations', icon: Award, roles: ['organisation_admin', 'school_admin', 'principal', 'teacher'] },
  { name: 'Academic Quality Index', icon: TrendingUp, roles: ['organisation_admin', 'school_admin', 'principal', 'teacher', 'student', 'parent'] },
  { name: 'Study materials', icon: BookOpen, roles: ['organisation_admin', 'school_admin', 'principal', 'teacher', 'student', 'parent'] },
  { name: 'Student fees', icon: Receipt, roles: ['organisation_admin', 'school_admin'] },
  { name: 'Fee overview', icon: Receipt, childOf: 'Student fees', roles: ['organisation_admin', 'school_admin'] },
  { name: 'Fee structure', icon: FileSpreadsheet, childOf: 'Student fees', roles: ['organisation_admin', 'school_admin'] },
  { name: 'Collect fee', icon: UserCheck, childOf: 'Student fees', roles: ['organisation_admin', 'school_admin'] },
  { name: 'Vouchers', icon: ShieldAlert, childOf: 'Student fees', roles: ['organisation_admin', 'school_admin'] },
  { name: 'Defaulters', icon: AlertCircle, childOf: 'Student fees', roles: ['organisation_admin', 'school_admin'] },
  { name: 'Concessions', icon: Sparkles, childOf: 'Student fees', roles: ['organisation_admin', 'school_admin'] },
  { name: 'Receipts', icon: Receipt, childOf: 'Student fees', roles: ['organisation_admin', 'school_admin'] },
  { name: 'Timetable', icon: CalendarDays, roles: ['organisation_admin', 'school_admin', 'principal', 'teacher', 'student', 'parent'] },
  { name: 'Students at Risk', icon: AlertCircle, roles: ['organisation_admin', 'school_admin', 'principal', 'teacher'] },
  { name: 'At-risk list', icon: AlertCircle, childOf: 'Students at Risk', roles: ['organisation_admin', 'school_admin', 'principal', 'teacher'] },
  { name: 'Risk criteria', icon: SlidersHorizontal, childOf: 'Students at Risk', roles: ['organisation_admin', 'school_admin', 'principal'] },
  { name: 'Review cases', icon: ShieldAlert, childOf: 'Students at Risk', roles: ['organisation_admin', 'school_admin', 'principal', 'teacher'] },
  { name: 'Interventions', icon: HeartHandshake },
  { name: 'Communication', icon: MessageSquare, roles: ['organisation_admin', 'school_admin', 'principal', 'teacher', 'student'] },
  { name: 'Staff', icon: BriefcaseIcon, roles: ['organisation_admin', 'school_admin', 'principal'] },
  { name: 'Staff Salaries', icon: Banknote, roles: ['organisation_admin', 'school_admin', 'teacher'] },
  { name: 'Finance', icon: Wallet, roles: ['organisation_admin', 'school_admin', 'principal'] },
  { name: 'Announcements', icon: Megaphone, roles: ['organisation_admin', 'school_admin', 'principal', 'teacher', 'student', 'parent'] },
  { name: 'Data import', icon: UploadCloud, roles: ['organisation_admin', 'school_admin', 'principal'] },
];

function BriefcaseIcon(props: any) {
  return <Users {...props} />;
}

const SYSTEM_NAV = [
  { name: 'Reports', icon: BarChart3, roles: ['organisation_admin', 'school_admin', 'principal', 'teacher'] },
  { name: 'My performance', icon: TrendingUp, roles: ['student', 'parent'] },
  { name: 'Platform owner', icon: ShieldCheck, superuserOnly: true },
  { name: 'Permissions', icon: KeyRound, roles: ['organisation_admin', 'school_admin', 'principal'] },
  { name: 'Audit log', icon: ShieldCheck, adminOnly: true },
  { name: 'Notifications', icon: Bell },
  { name: 'Settings', icon: Settings2 },
];

const FORBIDDEN_TEACHER_PAGES = [
  'Finance', 'Student fees', 'Fee overview', 'Fee structure', 'Collect fee',
  'Vouchers', 'Defaulters', 'Concessions', 'Receipts', 'Fees',
  'Staff', 'Staff Salaries', 'Salaries',
  'Campuses', 'Campus setup', 'Academic years',
  'Audit log', 'Permissions', 'Data import', 'Platform owner',
  'Reports', 'Risk criteria', 'Students at Risk', 'At-risk list'
];

const NAV_GROUPS = [
  { sublabel: 'ORGANISATION & CAMPUSES', items: ['Overview', 'Campuses'] },
  { sublabel: 'ACADEMIC CONFIGURATION', adminLabel: true, items: ['Campus setup', 'Academic years'] },
  { sublabel: 'ACADEMIC STRUCTURE', items: ['Classes', 'Subjects'] },
  {
    sublabel: 'STUDENTS & LEARNING',
    items: [
      'Students', 'Attendance', 'Homework', 'Academics', 'Examinations', 'Academic Quality Index',
      'Study materials', 'Student fees', 'Fee overview', 'Fee structure',
      'Collect fee', 'Vouchers', 'Defaulters', 'Concessions', 'Receipts',
      'Timetable'
    ]
  },
  { sublabel: 'STUDENT SUPPORT', items: ['Students at Risk', 'At-risk list', 'Risk criteria', 'Review cases', 'Interventions'] },
  { sublabel: 'COMMUNICATION & BROADCASTS', items: ['Communication', 'Announcements'] },
  { sublabel: 'PEOPLE & HR', items: ['Staff', 'Staff Salaries'] },
  { sublabel: 'FINANCE & BILLING', items: ['Finance'] },
  { sublabel: 'DATA MANAGEMENT', items: ['Data import'] },
];

const initials = (name: string) => name.split(/\s+/).map(s => s[0]).join('').slice(0, 2).toUpperCase();
const fmt = (n: number | null | undefined, suffix = '%') => n === null || n === undefined ? '—' : `${n}${suffix}`;
const nice = (s: string) => s.replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase());

const resourceInfo: Record<string, { api: string; title: string; desc: string; columns: { key: string; label: string }[]; fields: { key: string; label: string; type?: string; required?: boolean }[] }> = {
  Students: {
    api: 'students',
    title: 'Student directory',
    desc: 'A unified view of learners across your authorised campuses.',
    columns: [
      { key: 'name', label: 'Student' },
      { key: 'admission_number', label: 'Admission ID' },
      { key: 'class_name', label: 'Class' },
      { key: 'school_name', label: 'Campus' },
      { key: 'father_name', label: 'Father Name' },
      { key: 'gender', label: 'Gender' },
      { key: 'active', label: 'Status' }
    ],
    fields: [
      { key: 'school', label: 'Campus', required: true },
      { key: 'school_class', label: 'Class', required: true },
      { key: 'first_name', label: 'First name', required: true },
      { key: 'last_name', label: 'Last name', required: true },
      { key: 'admission_number', label: 'Admission number', required: true },
      { key: 'gender', label: 'Gender', required: true },
      { key: 'father_name', label: 'Father name', required: true },
      { key: 'mother_name', label: 'Mother name' },
      { key: 'dob', label: 'Date of birth', type: 'date' },
      { key: 'enrolled_on', label: 'Enrolment date', type: 'date', required: true },
      { key: 'guardian_phone', label: 'Guardian phone' }
    ]
  },
  'Academic years': {
    api: 'years',
    title: 'Academic calendar years',
    desc: 'Define and track campus academic sessions, date spans and cycle states.',
    columns: [
      { key: 'name', label: 'Academic Year' },
      { key: 'school_name', label: 'Campus' },
      { key: 'start_date', label: 'Start date' },
      { key: 'end_date', label: 'End date' },
      { key: 'active', label: 'Status' }
    ],
    fields: [
      { key: 'school', label: 'Campus', required: true },
      { key: 'name', label: 'Academic year name (e.g. 2026-2027)', required: true },
      { key: 'start_date', label: 'Start date', type: 'date', required: true },
      { key: 'end_date', label: 'End date', type: 'date', required: true }
    ]
  },
  Classes: {
    api: 'classes',
    title: 'Classes & cohorts',
    desc: 'Classroom groups, teaching assignments and academic structure.',
    columns: [
      { key: 'name', label: 'Class' },
      { key: 'section', label: 'Section' },
      { key: 'grade_level', label: 'Grade' },
      { key: 'teacher_name', label: 'Lead teacher' },
      { key: 'school_name', label: 'Campus' },
      { key: 'academic_year_name', label: 'Academic Year' }
    ],
    fields: [
      { key: 'name', label: 'Class name', required: true },
      { key: 'section', label: 'Section (e.g. A, B)' },
      { key: 'school', label: 'Campus', required: true },
      { key: 'academic_year', label: 'Academic year', required: true },
      { key: 'grade_level', label: 'Grade level (e.g. Grade 8)' },
      { key: 'teacher', label: 'Lead teacher' }
    ]
  },
  Subjects: {
    api: 'subjects',
    title: 'Curriculum subjects',
    desc: 'Curriculum learning areas and subject course codes per campus.',
    columns: [
      { key: 'name', label: 'Subject' },
      { key: 'code', label: 'Code' },
      { key: 'school_name', label: 'Campus' },
      { key: 'active', label: 'Status' }
    ],
    fields: [
      { key: 'school', label: 'Campus', required: true },
      { key: 'code', label: 'Subject code (e.g. ENG, MATH)', required: true },
      { key: 'name', label: 'Subject name', required: true }
    ]
  },
  Academics: {
    api: 'assessments',
    title: 'Academic assessments',
    desc: 'Track tests, marks and assessment publication states.',
    columns: [
      { key: 'title', label: 'Assessment' },
      { key: 'subject_name', label: 'Subject' },
      { key: 'class_name', label: 'Class' },
      { key: 'max_marks', label: 'Max marks' },
      { key: 'published', label: 'Published' }
    ],
    fields: [
      { key: 'title', label: 'Assessment title', required: true },
      { key: 'school_class', label: 'Class', required: true },
      { key: 'subject', label: 'Subject', required: true },
      { key: 'date', label: 'Assessment date', type: 'date', required: true },
      { key: 'max_marks', label: 'Max marks', type: 'number', required: true },
      { key: 'weight', label: 'Weight', type: 'number' }
    ]
  },

  Homework: {
    api: 'homework',
    title: 'Homework & tasks',
    desc: 'Keep assignments and completion review in one place.',
    columns: [
      { key: 'title', label: 'Assignment' },
      { key: 'due_date', label: 'Due date' },
      { key: 'school_class', label: 'Class' },
      { key: 'subject', label: 'Subject' }
    ],
    fields: [
      { key: 'title', label: 'Title', required: true },
      { key: 'school_class', label: 'Class', required: true },
      { key: 'subject', label: 'Subject', required: true },
      { key: 'due_date', label: 'Due date', type: 'date', required: true },
      { key: 'description', label: 'Description' }
    ]
  },
  Interventions: {
    api: 'cases',
    title: 'Student support cases',
    desc: 'Turn transparent indicators into compassionate follow-up.',
    columns: [
      { key: 'title', label: 'Case' },
      { key: 'student_name', label: 'Student' },
      { key: 'priority', label: 'Priority' },
      { key: 'status', label: 'Progress' }
    ],
    fields: [
      { key: 'title', label: 'Case title', required: true },
      { key: 'student', label: 'Student ID', type: 'number', required: true },
      { key: 'reason', label: 'Evidence / reason', required: true },
      { key: 'priority', label: 'Priority' },
      { key: 'status', label: 'Status' }
    ]
  },
  Notifications: {
    api: 'notifications',
    title: 'Notifications',
    desc: 'Updates that matter, without unnecessary noise.',
    columns: [
      { key: 'title', label: 'Message' },
      { key: 'body', label: 'Description' },
      { key: 'read', label: 'Read' },
      { key: 'created_at', label: 'Created' }
    ],
    fields: []
  },
};

function getResourceFilterConfigs(pageName: string, user?: User | null, teacherScope?: any, refClasses?: any[]): FilterConfig[] {
  switch (pageName) {
    case 'Students': {
      const classOpts = user?.role === 'teacher' && teacherScope?.classes
        ? teacherScope.classes.map((c: any) => ({ label: c.display_name || c.name, value: String(c.id) }))
        : (refClasses || []).map((c: any) => ({ label: c.name, value: String(c.id) }));
      const filters: FilterConfig[] = [];
      if (classOpts.length > 0) {
        filters.push({
          key: 'school_class',
          label: 'Class',
          options: classOpts
        });
      }
      filters.push(
        {
          key: 'gender',
          label: 'Gender',
          options: [
            { label: 'Boy', value: 'male' },
            { label: 'Girl', value: 'female' },
          ]
        },
        {
          key: 'active',
          label: 'Status',
          options: [
            { label: 'Active', value: 'true' },
            { label: 'Inactive', value: 'false' },
          ]
        }
      );
      return filters;
    }
    case 'Classes':
      return [
        {
          key: 'grade_level',
          label: 'Grade Level',
          options: [
            { label: 'Grade 1', value: 'Grade 1' },
            { label: 'Grade 2', value: 'Grade 2' },
            { label: 'Grade 3', value: 'Grade 3' },
            { label: 'Grade 4', value: 'Grade 4' },
            { label: 'Grade 5', value: 'Grade 5' },
            { label: 'Grade 6', value: 'Grade 6' },
            { label: 'Grade 7', value: 'Grade 7' },
            { label: 'Grade 8', value: 'Grade 8' },
            { label: 'Grade 9', value: 'Grade 9' },
            { label: 'Grade 10', value: 'Grade 10' },
          ]
        }
      ];
    case 'Academic years':
      return [
        {
          key: 'active',
          label: 'Status',
          options: [
            { label: 'Active Session', value: 'true' },
            { label: 'Closed Session', value: 'false' },
          ]
        }
      ];
    case 'Subjects':
      return [
        {
          key: 'active',
          label: 'Status',
          options: [
            { label: 'Active', value: 'true' },
            { label: 'Inactive', value: 'false' },
          ]
        }
      ];
    case 'Academics':
      return [
        {
          key: 'published',
          label: 'Status',
          options: [
            { label: 'Published', value: 'true' },
            { label: 'Draft', value: 'false' },
          ]
        }
      ];
    case 'Attendance':
      return [
        {
          key: 'status',
          label: 'Status',
          options: [
            { label: 'Present', value: 'present' },
            { label: 'Absent', value: 'absent' },
            { label: 'Late', value: 'late' },
            { label: 'Excused', value: 'excused' },
          ]
        },
        {
          key: 'date',
          label: 'Date',
          type: 'date',
        }
      ];
    case 'Interventions':
      return [
        {
          key: 'priority',
          label: 'Priority',
          options: [
            { label: 'High Priority', value: 'high' },
            { label: 'Medium Priority', value: 'medium' },
            { label: 'Low Priority', value: 'low' },
          ]
        },
        {
          key: 'status',
          label: 'Progress',
          options: [
            { label: 'Open', value: 'open' },
            { label: 'In Progress', value: 'in_progress' },
            { label: 'Resolved', value: 'resolved' },
            { label: 'Closed', value: 'closed' },
          ]
        }
      ];
    default:
      return [];
  }
}

const Pill = ({ value }: { value: string | boolean | undefined }) => {
  const text = typeof value === 'boolean' ? (value ? 'Active' : 'Inactive') : nice(String(value || '—'));
  const tone = /resolved|completed|present|active|published|true/i.test(text) ? 'green' : /high|absent|overdue|false/i.test(text) ? 'red' : /medium|in progress|late|monitoring/i.test(text) ? 'amber' : 'purple';
  return <span className={'pill ' + tone}><span className="pill-dot" />{text}</span>;
};

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [teacherScope, setTeacherScope] = useState<any>(null);

  useEffect(() => {
    if (user?.role === 'teacher') {
      request<any>('teacher/scope/').then(res => {
        setTeacherScope(res);
      }).catch(() => {});
    } else {
      setTeacherScope(null);
    }
  }, [user]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState('Overview');
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [records, setRecords] = useState<Resource[]>([]);
  const [resourceFilters, setResourceFilters] = useState<Record<string, any>>({});
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [modal, setModal] = useState(false);
  const [editModal, setEditModal] = useState(false);
  const [editingRecord, setEditingRecord] = useState<Resource | null>(null);
  const [sidebar, setSidebar] = useState(false);
  const [dark, setDark] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [campusDropdownOpen, setCampusDropdownOpen] = useState(false);
  const [openDropdowns, setOpenDropdowns] = useState<Record<string, boolean>>({});

  const toggleDropdown = (name: string, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setOpenDropdowns(prev => ({
      ...prev,
      [name]: !prev[name]
    }));
  };
  const isSingleCampusRole = !!user && ['principal', 'school_admin', 'teacher', 'student', 'parent'].includes(user.role);
  const [campuses, setCampuses] = useState<Array<{ id: number; name: string; code?: string; city?: string }>>([]);
  const [activeCampusId, setActiveCampusId] = useState<number | null>(() => {
    if (user && ['principal', 'school_admin', 'teacher', 'student', 'parent'].includes(user.role)) {
      return user.school || null;
    }
    const saved = localStorage.getItem('optimus_active_campus_id');
    return saved ? Number(saved) : null;
  });

  useEffect(() => {
    if (user && isSingleCampusRole && user.school && activeCampusId !== user.school) {
      setActiveCampusId(user.school);
    }
  }, [isSingleCampusRole, user, activeCampusId]);

  const [form, setForm] = useState<Record<string, string>>({});
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState('All');
  const [saving, setSaving] = useState(false);
  const [dueDateMode, setDueDateMode] = useState<'standard' | 'custom'>('standard');
  const [customDueDate, setCustomDueDate] = useState<string>('');
  const [dynamicCharges, setDynamicCharges] = useState<Array<{ id: string; name: string; amount: string }>>([]);
  const [setupSchool, setSetupSchool] = useState<number | null>(null);
  const [refData, setRefData] = useState<{
    schools: Array<{ id: number; name: string }>;
    years: Array<{ id: number; name: string; school?: number }>;
    teachers: Array<{ id: number; name: string; school_id?: number }>;
    classes: Array<{ id: number; name: string; school?: number }>;
    subjects: Array<{ id: number; name: string; code?: string; school?: number }>;
  }>({ schools: [], years: [], teachers: [], classes: [], subjects: [] });

  const profileMenuRef = useRef<HTMLDivElement>(null);
  const campusDropdownRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);

  const [accentHex, setAccentHex] = useState(() => getStoredTheme().colorHex);
  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<{ hex?: string; mode?: ThemeMode; isDark?: boolean }>;
      if (ce.detail?.hex) setAccentHex(ce.detail.hex);
      if (typeof ce.detail?.isDark === 'boolean') {
        setDark(ce.detail.isDark);
      } else if (ce.detail?.mode) {
        const isD = ce.detail.mode === 'dark' || (ce.detail.mode === 'system' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
        setDark(isD);
      }
    };
    window.addEventListener('optimus_theme_change', handler);
    return () => window.removeEventListener('optimus_theme_change', handler);
  }, []);

  // Close menus and sidebar when clicking outside
  useEffect(() => {
    const clickOutside = (e: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target as Node)) {
        setProfileMenuOpen(false);
      }
      if (campusDropdownRef.current && !campusDropdownRef.current.contains(e.target as Node)) {
        setCampusDropdownOpen(false);
      }
      if (sidebarRef.current && !sidebarRef.current.contains(e.target as Node)) {
        setSidebar(false);
        setOpenDropdowns({});
      }
    };
    document.addEventListener('mousedown', clickOutside);
    return () => document.removeEventListener('mousedown', clickOutside);
  }, []);

  const dynColor = useMemo(() => [accentHex, '#23b7a0', '#f29d50', '#6c9eff', '#e477a1', '#b4a0e9'], [accentHex]);
  const notify = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3500); };

  useEffect(() => {
    const { mode, color } = getStoredTheme();
    setDark(mode === 'dark' || (mode === 'system' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches));
    applyTheme(mode, color);
    request<User>('auth/me/').then(u => {
      setUser(u);
      list<{ id: number; name: string; code?: string; city?: string }>('schools').then(scs => {
        setCampuses(scs);
        if (activeCampusId && !scs.some(s => s.id === activeCampusId)) {
          setActiveCampusId(null);
          localStorage.removeItem('optimus_active_campus_id');
        }
      }).catch(() => {});
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const load = useCallback(async () => {
    if (!user) return;
    setError('');
    const params = new URLSearchParams();
    if (activeCampusId) params.set('school', String(activeCampusId));
    Object.entries(resourceFilters).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') {
        params.set(k, String(v));
      }
    });
    const qs = params.toString() ? `?${params.toString()}` : '';
    try {
      if (page === 'Overview') {
        if (user.role !== 'teacher') {
          const campusQs = activeCampusId ? `?school=${activeCampusId}` : '';
          setDash(await request<Dashboard>(`dashboard/${campusQs}`));
        }
      } else if (['Reports', 'Campuses', 'Campus setup', 'Audit log', 'Permissions', 'Staff', 'Finance', 'Student fees', 'Fee overview', 'Fee structure', 'Collect fee', 'Vouchers', 'Defaulters', 'Concessions', 'Receipts', 'Study materials', 'My performance', 'Communication', 'Settings', 'Examinations', 'Academic Quality Index', 'Timetable', 'Data import', 'Platform owner', 'Students at Risk', 'At-risk list', 'Risk criteria', 'Review cases', 'My Class', 'My Subjects'].includes(page)) {
        // subcomponents handle own data
      } else if (resourceInfo[page]) {
        setRecords(await list<Resource>(`${resourceInfo[page].api}/${qs}`));
      }
      // Also refresh campus list
      list<{ id: number; name: string; code?: string; city?: string }>('schools').then(setCampuses).catch(() => {});
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load data');
    }
  }, [page, user, activeCampusId, resourceFilters]);

  useEffect(() => { load(); }, [load]);

  const switchPage = (p: string) => {
    let target = p;
    if (target === 'Fees' || target === 'Student Fees') target = 'Student fees';
    setPage(target);
    setSearch('');
    setFilter('All');
    setResourceFilters({});
    setSidebar(false);
  };
  const changeTheme = () => {
    const nextMode = dark ? 'light' : 'dark';
    setDark(!dark);
    const { color } = getStoredTheme();
    applyTheme(nextMode, color);
  };

  const config = resourceInfo[page];
  const effectiveColumns = useMemo(() => {
    if (!config) return [];
    if (page === 'Students' && user?.role === 'teacher' && !teacherScope?.can_view_my_class) {
      return config.columns.filter(c => c.key !== 'father_name');
    }
    return config.columns;
  }, [config, page, user, teacherScope]);
  const filtered = records;

  const activeCampus = useMemo(() => campuses.find(c => c.id === activeCampusId) || null, [campuses, activeCampusId]);

  const openCreateModal = async () => {
    const initialForm: Record<string, string> = {
      enrolled_on: new Date().toISOString().slice(0, 10),
      date: new Date().toISOString().slice(0, 10),
      due_date: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
      status: page === 'Attendance' ? 'present' : page === 'Interventions' ? 'open' : '',
      priority: page === 'Interventions' ? 'medium' : ''
    };
    if (activeCampusId) {
      initialForm.school = String(activeCampusId);
    } else if (user?.school) {
      initialForm.school = String(user.school);
    }
    setDueDateMode('standard');
    setCustomDueDate(new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10));
    setDynamicCharges([]);
    if (page === 'Students') {
      initialForm.admission_fee = '0';
    }
    setForm(initialForm);
    setModal(true);
    try {
      const qs = activeCampusId ? `?school=${activeCampusId}` : '';
      const [sc, yr, tc, cl, sb] = await Promise.all([
        list<{ id: number; name: string }>('schools').catch(() => []),
        list<{ id: number; name: string; school?: number }>(`years/${qs}`).catch(() => []),
        request<{ results: Array<{ id: number; name: string; school_id?: number }> }>(`teachers/${qs}`).then(r => r.results).catch(() => []),
        list<{ id: number; name: string; school?: number }>(`classes/${qs}`).catch(() => []),
        list<{ id: number; name: string; code?: string; school?: number }>(`subjects/${qs}`).catch(() => [])
      ]);
      setRefData({ schools: sc, years: yr, teachers: tc, classes: cl, subjects: sb });
      if (!initialForm.school && sc.length > 0) {
        setForm(prev => ({ ...prev, school: String(activeCampusId || sc[0].id) }));
      }
    } catch {}
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!config) return;
    setSaving(true);
    try {
      const data: Record<string, unknown> = {};
      for (const f of config.fields) {
        const val = form[f.key];
        if (val !== undefined && val !== '') {
          const isNum = ['school', 'academic_year', 'teacher', 'school_class', 'subject', 'student', 'max_marks', 'weight', 'attendance_alert_threshold'].includes(f.key) || f.type === 'number';
          data[f.key] = isNum ? Number(val) : val;
        }
      }
      if (page === 'Students') {
        const selectedCampus = form.school || (user?.school ? String(user.school) : (activeCampusId ? String(activeCampusId) : ''));
        if (!selectedCampus) {
          notify('Please select a campus.');
          setSaving(false);
          return;
        }
        data.school = Number(selectedCampus);

        if (!form.school_class) {
          notify('Class is mandatory. Please select a class.');
          setSaving(false);
          return;
        }
        data.school_class = Number(form.school_class);

        if (!form.monthly_fee || Number(form.monthly_fee) <= 0) {
          notify('Monthly tuition fee is mandatory and must be greater than zero.');
          setSaving(false);
          return;
        }

        const admFeeStr = form.admission_fee !== undefined ? String(form.admission_fee).trim() : '';
        if (admFeeStr === '') {
          notify('Enter the admission fee (0 if there is none)');
          setSaving(false);
          return;
        }
        const admFeeNum = Number(admFeeStr);
        if (isNaN(admFeeNum) || admFeeNum < 0) {
          notify('Fee cannot be negative');
          setSaving(false);
          return;
        }

        if (form.extra_charges && Number(form.extra_charges) > 0 && !form.extra_charges_reason?.trim()) {
          notify('Please provide a reason for the extra charges.');
          setSaving(false);
          return;
        }
      }

      const created = await create(config.api, data);
      if (page === 'Students' && created && created.id) {
        if (form.monthly_fee || form.admission_fee !== undefined) {
          try {
            await request('fees/student-voucher/', {
              method: 'POST',
              body: JSON.stringify({
                student: created.id,
                monthly_fee: Number(form.monthly_fee || 0),
                admission_fee: Number(form.admission_fee !== undefined ? form.admission_fee : 0),
                annual_fee: form.annual_fee ? Number(form.annual_fee) : 0,
                extra_charges: form.extra_charges ? Number(form.extra_charges) : 0,
                extra_charges_reason: form.extra_charges_reason || '',
                custom_charges: dynamicCharges
                  .filter(c => c.name.trim() && Number(c.amount) > 0)
                  .map(c => ({ name: c.name.trim(), amount: Number(c.amount) })),
                due_date: dueDateMode === 'custom' && customDueDate ? customDueDate : undefined,
                school_class: Number(form.school_class),
                reference: `CHALLAN-${created.admission_number || created.id}`
              })
            });
          } catch (feeErr) {
            console.error('Student fee voucher error:', feeErr);
          }
        }
      }
      setModal(false);
      setForm({});
      notify(page === 'Students' ? 'Student registered & fee record created successfully' : 'Record created successfully');
      await load();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not save record');
    } finally {
      setSaving(false);
    }
  };

  const openEditModal = (r: Resource) => {
    if (!config) return;
    setEditingRecord(r);
    const initial: Record<string, string> = {};
    for (const f of config.fields) {
      let val = r[f.key];
      if (f.key === 'school_class' && !val && (r as any).school_class_id) {
        val = (r as any).school_class_id;
      }
      if (f.key === 'dob' && !val && (r as any).date_of_birth) {
        val = (r as any).date_of_birth;
      }
      initial[f.key] = val !== undefined && val !== null ? String(val) : '';
    }
    setEditForm(initial);
    setEditModal(true);
  };

  const handleEditSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!config || !editingRecord) return;
    setSaving(true);
    try {
      const data: Record<string, unknown> = {};
      for (const f of config.fields) {
        const val = editForm[f.key];
        if (val !== undefined && val !== '') {
          const isNum = ['school', 'academic_year', 'teacher', 'school_class', 'subject', 'student', 'max_marks', 'weight', 'attendance_alert_threshold'].includes(f.key) || f.type === 'number';
          data[f.key] = isNum ? Number(val) : val;
        }
      }
      await update(config.api, editingRecord.id, data);
      setEditModal(false);
      setEditingRecord(null);
      notify('Record updated successfully');
      await load();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not update record');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRecord = async (r: Resource) => {
    if (!config) return;
    const name = String(r.name || r.title || r.full_name || `#${r.id}`);
    if (!window.confirm(`Permanently delete "${name}"? This action cannot be undone.`)) return;
    try {
      await destroy(config.api, r.id);
      notify('Record deleted successfully');
      await load();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not delete record');
    }
  };

  const handleProfilePicUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      notify('Photo must be less than 5MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = async () => {
        const canvas = document.createElement('canvas');
        const maxDim = 400;
        let w = img.width, h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) { h = Math.round((h * maxDim) / w); w = maxDim; }
          else { w = Math.round((w * maxDim) / h); h = maxDim; }
        }
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, w, h);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
          try {
            const updated = await updateProfile({ avatar_image: dataUrl });
            setUser(updated);
            notify('Profile picture updated successfully!');
          } catch (err) {
            notify(err instanceof Error ? err.message : 'Could not save picture');
          }
        }
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleRemovePhoto = async () => {
    try {
      const updated = await updateProfile({ avatar_image: '' });
      setUser(updated);
      notify('Profile photo removed');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not remove photo');
    }
  };

  if (loading) return <div className="loader-screen"><div className="brand-symbol">◈</div><div>Preparing your workspace…</div></div>;

  const isPublicRoute = typeof window !== 'undefined' && (window.location.pathname === '/' || window.location.pathname === '');
  if (isPublicRoute) {
    return <PublicHome authenticated={Boolean(user)} />;
  }

  if (!user) return (
    <Login
      onLogin={u => {
        window.history.replaceState(null, '', '/app');
        const { mode, color } = getStoredTheme();
        const isD = mode === 'dark' || (mode === 'system' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
        setDark(isD);
        applyTheme(mode, color);
        setUser(u);
      }}
    />
  );

  return (
    <div className={'app ' + (dark ? 'dark' : '')}>
      <button className="sticky-settings-btn" title="Settings & Preferences" aria-label="Settings" onClick={() => switchPage('Settings')}>
        <Settings2 size={19} />
      </button>

      <div
        className={'sidebar-backdrop ' + (sidebar ? 'open' : '')}
        onClick={() => setSidebar(false)}
        aria-hidden="true"
      />
      <aside ref={sidebarRef} className={'sidebar ' + (sidebar ? 'open' : '')}>
        <div className="brand">
          <span className="brand-symbol">◈</span>
          <span className="brand-copy">
            <strong>optimus<span>orien</span></strong>
            <small>EDUCATION INTELLIGENCE</small>
          </span>
          <button className="mobile-x" onClick={() => setSidebar(false)}><X size={19} /></button>
        </div>

        {/* Dynamic Campus Selector */}
        <div className="workspace-pill-wrap" ref={campusDropdownRef}>
          {user?.role === 'teacher' && teacherScope?.campuses && teacherScope.campuses.length > 1 ? (
            <>
              <button
                className="workspace-pill interactive"
                title="Switch campus"
                onClick={() => setCampusDropdownOpen(v => !v)}
              >
                <span className="workspace-icon"><Building2 size={19} /></span>
                <span className="workspace-name">
                  <b>{campuses.find(c => c.id === activeCampusId)?.name || 'Assigned Campus'}</b>
                  <small>Teaching Campus</small>
                </span>
                <ChevronDown size={15} style={{ transform: campusDropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
              </button>
              {campusDropdownOpen && (
                <div className="campus-dropdown-menu">
                  <div className="campus-dropdown-title">Your Assigned Campuses</div>
                  {teacherScope.campuses.map((c: any) => {
                    const isSelected = activeCampusId === c.id;
                    return (
                      <button
                        key={c.id}
                        className={`campus-dropdown-item ${isSelected ? 'active' : ''}`}
                        onClick={() => {
                          setActiveCampusId(c.id);
                          localStorage.setItem('optimus_active_campus_id', String(c.id));
                          setCampusDropdownOpen(false);
                          notify(`Switched to campus: ${c.name}`);
                        }}
                      >
                        <div className="campus-item-icon"><Building2 size={15} /></div>
                        <div className="campus-item-info">
                          <b>{c.name}</b>
                          <small>Teaching Branch</small>
                        </div>
                        {isSelected && <Check size={16} color="var(--brand-primary, #715ee8)" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          ) : isSingleCampusRole ? (
            <div className="workspace-pill" style={{ cursor: 'default' }} title="Your assigned campus">
              <span className="workspace-icon"><Building2 size={19} /></span>
              <span className="workspace-name">
                <b>{activeCampus ? activeCampus.name : (campuses[0]?.name || 'Assigned Campus')}</b>
                <small>{activeCampus?.city ? `${activeCampus.city} · Campus` : 'Assigned Campus'}</small>
              </span>
            </div>
          ) : (
            <button
              className="workspace-pill interactive"
              title="Switch campus or branch"
              onClick={() => setCampusDropdownOpen(v => !v)}
            >
              <span className="workspace-icon"><Building2 size={19} /></span>
              <span className="workspace-name">
                <b>{activeCampus ? activeCampus.name : 'All Campuses'}</b>
                <small>{activeCampus ? (activeCampus.city ? `${activeCampus.city} · Branch` : 'Selected Campus') : `${campuses.length} Campuses · Multi-branch`}</small>
              </span>
              <ChevronDown size={15} style={{ transform: campusDropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
            </button>
          )}

          {!isSingleCampusRole && campusDropdownOpen && (
            <div className="campus-dropdown-menu">
              <div className="campus-dropdown-title">Branch & Campus Selector</div>
              <button
                className={`campus-dropdown-item ${activeCampusId === null ? 'active' : ''}`}
                onClick={() => {
                  setActiveCampusId(null);
                  localStorage.removeItem('optimus_active_campus_id');
                  setCampusDropdownOpen(false);
                  notify('Showing data across all campuses');
                }}
              >
                <div className="campus-item-icon"><Building2 size={15} /></div>
                <div className="campus-item-info">
                  <b>All Campuses (Consolidated)</b>
                  <small>Network-wide aggregated view</small>
                </div>
                {activeCampusId === null && <Check size={16} color="var(--brand-primary, #715ee8)" />}
              </button>

              {campuses.map(c => {
                const isSelected = activeCampusId === c.id;
                return (
                  <button
                    key={c.id}
                    className={`campus-dropdown-item ${isSelected ? 'active' : ''}`}
                    onClick={() => {
                      setActiveCampusId(c.id);
                      localStorage.setItem('optimus_active_campus_id', String(c.id));
                      setCampusDropdownOpen(false);
                      notify(`Switched to campus: ${c.name}`);
                    }}
                  >
                    <div className="campus-item-icon"><Building2 size={15} /></div>
                    <div className="campus-item-info">
                      <b>{c.name}</b>
                      <small>{c.code || 'Campus'} {c.city ? `• ${c.city}` : ''}</small>
                    </div>
                    {isSelected && <Check size={16} color="var(--brand-primary, #715ee8)" />}
                  </button>
                );
              })}

              {['organisation_admin', 'school_admin'].includes(user.role) && (
                <>
                  <div className="campus-dropdown-divider" />
                  <button
                    className="campus-dropdown-add-btn"
                    onClick={() => {
                      setCampusDropdownOpen(false);
                      switchPage('Campuses');
                    }}
                  >
                    <Plus size={15} /> <span>+ Register / Manage Campuses</span>
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {user.role === 'teacher' ? (
          <>
            <div className="nav-label">MY TEACHING WORKSPACE</div>
            <nav>
              <div className="nav-sublabel">CLASSROOM & INSTRUCTION</div>
              <button
                type="button"
                onClick={() => switchPage('Overview')}
                className={'nav-item ' + (page === 'Overview' ? 'selected' : '')}
              >
                <LayoutDashboard size={19} strokeWidth={1.9} />
                <span>My Home</span>
              </button>

              {teacherScope?.can_view_my_class && (
                <button
                  type="button"
                  onClick={() => switchPage('My Class')}
                  className={'nav-item ' + (page === 'My Class' ? 'selected' : '')}
                >
                  <Users size={19} strokeWidth={1.9} />
                  <span>My Class</span>
                </button>
              )}

              {teacherScope?.can_view_my_subjects && (
                <button
                  type="button"
                  onClick={() => switchPage('My Subjects')}
                  className={'nav-item ' + (page === 'My Subjects' ? 'selected' : '')}
                >
                  <BookOpen size={19} strokeWidth={1.9} />
                  <span>My Subjects</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => switchPage('Students')}
                className={'nav-item ' + (page === 'Students' ? 'selected' : '')}
              >
                <GraduationCap size={19} strokeWidth={1.9} />
                <span>My Students</span>
              </button>

              <button
                type="button"
                onClick={() => switchPage('Attendance')}
                className={'nav-item ' + (page === 'Attendance' ? 'selected' : '')}
              >
                <ClipboardCheck size={19} strokeWidth={1.9} />
                <span>Attendance</span>
              </button>

              <button
                type="button"
                onClick={() => switchPage('Homework')}
                className={'nav-item ' + (page === 'Homework' ? 'selected' : '')}
              >
                <ClipboardList size={19} strokeWidth={1.9} />
                <span>Homework</span>
              </button>

              <button
                type="button"
                onClick={() => switchPage('Examinations')}
                className={'nav-item ' + (page === 'Examinations' ? 'selected' : '')}
              >
                <Award size={19} strokeWidth={1.9} />
                <span>Academics / Exams</span>
              </button>

              <button
                type="button"
                onClick={() => switchPage('Academic Quality Index')}
                className={'nav-item ' + (page === 'Academic Quality Index' ? 'selected' : '')}
              >
                <TrendingUp size={19} strokeWidth={1.9} />
                <span>Academic Quality (AQI)</span>
              </button>

              <button
                type="button"
                onClick={() => switchPage('Study materials')}
                className={'nav-item ' + (page === 'Study materials' ? 'selected' : '')}
              >
                <BookOpen size={19} strokeWidth={1.9} />
                <span>Study Materials</span>
              </button>

              <button
                type="button"
                onClick={() => switchPage('Timetable')}
                className={'nav-item ' + (page === 'Timetable' ? 'selected' : '')}
              >
                <CalendarDays size={19} strokeWidth={1.9} />
                <span>Timetable</span>
              </button>

              {teacherScope?.can_view_my_class && (
                <button
                  type="button"
                  onClick={() => switchPage('Review cases')}
                  className={'nav-item ' + (page === 'Review cases' ? 'selected' : '')}
                >
                  <ShieldAlert size={19} strokeWidth={1.9} />
                  <span>Review Cases</span>
                </button>
              )}

              <div className="nav-sublabel" style={{ marginTop: 14 }}>COMMUNICATION</div>
              <button
                type="button"
                onClick={() => switchPage('Communication')}
                className={'nav-item ' + (page === 'Communication' ? 'selected' : '')}
              >
                <MessageSquare size={19} strokeWidth={1.9} />
                <span>Communication</span>
              </button>
              <button
                type="button"
                onClick={() => switchPage('Announcements')}
                className={'nav-item ' + (page === 'Announcements' ? 'selected' : '')}
              >
                <Megaphone size={19} strokeWidth={1.9} />
                <span>Announcements</span>
              </button>
            </nav>

            <div className="nav-label nav-lower">ACCOUNT & SYSTEM</div>
            <nav>
              <button
                type="button"
                onClick={() => switchPage('Notifications')}
                className={'nav-item ' + (page === 'Notifications' ? 'selected' : '')}
              >
                <Bell size={19} strokeWidth={1.9} />
                <span>Notifications</span>
              </button>
              <button
                type="button"
                onClick={() => switchPage('Settings')}
                className={'nav-item ' + (page === 'Settings' ? 'selected' : '')}
              >
                <Settings2 size={19} strokeWidth={1.9} />
                <span>My Profile</span>
              </button>
            </nav>
          </>
        ) : (
          <>
            <div className="nav-label">WORKSPACE</div>
            <nav>
              {NAV_GROUPS.map(group => {
                const isAdmin = group.adminLabel;
                if (isAdmin && !['organisation_admin', 'school_admin'].includes(user.role)) return null;
                const navItems = WORKSPACE_NAV.filter(item => group.items.includes(item.name) && ((item as any).roles ? (item as any).roles.includes(user.role) : (!item.adminOnly || ['organisation_admin', 'school_admin'].includes(user.role))));
                if (!navItems.length) return null;
                return (
                  <React.Fragment key={group.sublabel}>
                    <div className={'nav-sublabel' + (isAdmin ? ' nav-sublabel-admin' : '')}>{group.sublabel}</div>
                    {navItems.map((item: any) => {
                      const { name, icon: Icon, childOf } = item;
                      if (childOf) return null; // rendered inside parent dropdown

                      const children = navItems.filter((c: any) => c.childOf === name);
                      const isDropdown = children.length > 0;
                      const isChildActive = isDropdown && children.some((c: any) => c.name === page);
                      const isSelfActive = page === name || (name === 'Student fees' && ['Fees', 'Student Fees'].includes(page));
                      const isOpen = openDropdowns[name] !== undefined ? openDropdowns[name] : isChildActive;

                      if (isDropdown) {
                        return (
                          <div key={name} className="nav-dropdown-group">
                            <button
                              type="button"
                              onClick={() => {
                                if (isSelfActive) {
                                  toggleDropdown(name);
                                } else {
                                  setOpenDropdowns(prev => ({ ...prev, [name]: true }));
                                  switchPage(name);
                                }
                              }}
                              className={'nav-item nav-dropdown-btn ' + (isSelfActive || isChildActive ? 'selected ' : '') + (isOpen ? 'dropdown-open' : '')}
                            >
                              <Icon size={19} strokeWidth={1.9} />
                              <span className="nav-item-title">{name}</span>
                              <span
                                className={'nav-chevron-wrap' + (isOpen ? ' open' : '')}
                                onClick={(e) => toggleDropdown(name, e)}
                                title={isOpen ? 'Collapse' : 'Expand'}
                              >
                                <ChevronDown size={15} strokeWidth={2.2} />
                              </span>
                            </button>
                            {isOpen && (
                              <div className="nav-dropdown-children">
                                {children.map((child: any) => {
                                  const ChildIcon = child.icon;
                                  const isChildSelected = page === child.name;
                                  return (
                                    <button
                                      key={child.name}
                                      type="button"
                                      onClick={() => switchPage(child.name)}
                                      className={'nav-item nav-child ' + (isChildSelected ? 'selected' : '')}
                                    >
                                      <ChildIcon size={14} strokeWidth={1.8} />
                                      <span>{child.name}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      }

                      return (
                        <button
                          key={name}
                          onClick={() => switchPage(name)}
                          className={'nav-item ' + (page === name ? 'selected' : '')}
                        >
                          <Icon size={19} strokeWidth={1.9} />
                          <span>{name}</span>
                          {name === 'Interventions' && !!dash?.counts.open_cases && <em>{dash.counts.open_cases}</em>}
                        </button>
                      );
                    })}
                  </React.Fragment>
                );
              })}
            </nav>

            <div className="nav-label nav-lower">INSIGHTS & SYSTEM</div>
            <nav>
              {SYSTEM_NAV.filter(item => {
                if ((item as any).superuserOnly && !user.is_superuser) return false;
                if ((item as any).roles) return (item as any).roles.includes(user.role);
                return !item.adminOnly || ['organisation_admin', 'school_admin', 'principal'].includes(user.role);
              }).map(({ name, icon: Icon }) => (
                <button key={name} onClick={() => switchPage(name)} className={'nav-item ' + (page === name ? 'selected' : '')}>
                  <Icon size={19} strokeWidth={1.9} />
                  <span>{name}</span>
                </button>
              ))}
            </nav>
          </>
        )}

        <div className="sidebar-bottom">
          <div className="help-card">
            <div className="help-icon"><Sparkles size={17} /></div>
            <b>More clarity. Better outcomes.</b>
            <p>Use insights to make every campus day count.</p>
            {user.role === 'teacher' ? (
              <button onClick={() => switchPage('Examinations')}>Explore exams & marks <ArrowRight size={14} /></button>
            ) : (
              <button onClick={() => switchPage('Reports')}>Explore reports <ArrowRight size={14} /></button>
            )}
            <a className="public-sidebar-link" href="/">Public homepage <ArrowUpRight size={13} /></a>
          </div>

          <div className="account">
            <div className="avatar" style={{ overflow: 'hidden', background: user.avatar_color ? `${user.avatar_color}22` : '#e9e1ff', color: user.avatar_color || '#7862d7' }}>
              {user.avatar_image ? (
                <img src={user.avatar_image} alt={user.name} className="avatar-img-round" />
              ) : (
                initials(user.name)
              )}
            </div>
            <div>
              <b>{user.name}</b>
              <small>{user.role === 'organisation_admin' ? 'Super Owner' : nice(user.role)}</small>
            </div>
            <button aria-label="Sign out" title="Sign out" onClick={async () => { await logout(); setUser(null); }}>
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          <div className="topbar-left">
            <button className="mobile-menu" onClick={() => setSidebar(true)} aria-label="Open menu"><Menu size={21} /></button>
            <div className="breadcrumb">
              Workspace <ChevronRight size={14} /> <strong>{page === 'Overview' && user.role === 'teacher' ? 'My Home' : page}</strong>
              {activeCampus && <span style={{ marginLeft: 8, padding: '2px 8px', background: '#eeeaff', color: '#6353d8', borderRadius: 6, fontSize: 11, fontWeight: 700 }}>{activeCampus.name}</span>}
              {user.role === 'teacher' && teacherScope?.badges && teacherScope.badges.map((b: any, idx: number) => (
                <span key={idx} style={{
                  marginLeft: 6,
                  padding: '2px 8px',
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 600,
                  background: b.type === 'class_teacher' ? '#ecfdf5' : '#eff6ff',
                  color: b.type === 'class_teacher' ? '#047857' : '#1d4ed8',
                  border: `1px solid ${b.type === 'class_teacher' ? '#a7f3d0' : '#bfdbfe'}`
                }}>
                  {b.label}
                </span>
              ))}
            </div>
          </div>
          <div className="topbar-right">
            <span className="today">
              <CalendarDays size={16} />
              {new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date())}
            </span>
            <button className="icon-button" title="Toggle theme" onClick={changeTheme}>
              {dark ? <Sun size={19} /> : <Moon size={19} />}
            </button>

            {/* Notifications Menu */}
            <div className="notif-wrap">
              <button className="icon-button notification-trigger" title="Notifications" onClick={() => setShowNotifications(v => !v)}>
                <Bell size={19} /><i />
              </button>
              {showNotifications && (
                <div className="notification-menu">
                  <b>Recent notifications</b>
                  {(dash?.recent_notifications || []).length ? (
                    (dash?.recent_notifications || []).map(n => (
                      <div key={n.id} className="notification-row">
                        <Bell size={15} />
                        <span><strong>{n.title}</strong><small>{n.body}</small></span>
                      </div>
                    ))
                  ) : (
                    <p>Your workspace is up to date.</p>
                  )}
                  <button onClick={() => { setShowNotifications(false); switchPage('Notifications'); }}>
                    View all notifications <ArrowRight size={14} />
                  </button>
                </div>
              )}
            </div>

            {/* Clickable Profile Avatar with Dropdown */}
            <div className="profile-wrap" ref={profileMenuRef}>
              <button
                className="profile-btn"
                title="User profile & options"
                aria-label="User profile"
                onClick={() => setProfileMenuOpen(v => !v)}
              >
                <div className="avatar small" style={{ background: user.avatar_color ? `${user.avatar_color}22` : '#e9e1ff', color: user.avatar_color || '#7862d7', overflow: 'hidden' }}>
                  {user.avatar_image ? (
                    <img src={user.avatar_image} alt={user.name} className="avatar-img-round" />
                  ) : (
                    initials(user.name)
                  )}
                </div>
                <ChevronDown size={14} color="#8890a4" />
              </button>

              {profileMenuOpen && (
                <div className="profile-dropdown-menu">
                  <div className="profile-dropdown-header">
                    <div className="profile-large-avatar" style={{ background: user.avatar_color || '#715ee8' }}>
                      {user.avatar_image ? (
                        <img src={user.avatar_image} alt={user.name} className="avatar-img-round" />
                      ) : (
                        initials(user.name)
                      )}
                      <label className="profile-upload-overlay" title="Upload profile picture">
                        <Camera size={20} />
                        <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleProfilePicUpload} />
                      </label>
                    </div>
                    <div className="profile-name">{user.name}</div>
                    <span className="profile-role-badge">{user.role === 'organisation_admin' ? 'Super Owner' : nice(user.role)}</span>
                    <div className="profile-email">{user.email || `@${user.username}`}</div>
                    <div className="profile-photo-buttons">
                      <label className="profile-photo-btn">
                        <Upload size={12} /> {user.avatar_image ? 'Change photo' : 'Add photo'}
                        <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleProfilePicUpload} />
                      </label>
                      {user.avatar_image && (
                        <button className="profile-photo-btn" style={{ color: '#ef4444' }} onClick={handleRemovePhoto}>
                          <Trash2 size={12} /> Remove
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="profile-menu-items">
                    <button className="profile-menu-item" onClick={() => { switchPage('Settings'); setProfileMenuOpen(false); }}>
                      <Settings2 size={16} /> <span>Settings & Preferences</span>
                    </button>
                    {campuses.length > 1 && (
                      <button className="profile-menu-item" onClick={() => { switchPage('Campuses'); setProfileMenuOpen(false); }}>
                        <Building2 size={16} /> <span>Manage Campuses ({campuses.length})</span>
                      </button>
                    )}
                    <button className="profile-menu-item" onClick={() => { changeTheme(); }}>
                      {dark ? <Sun size={16} /> : <Moon size={16} />} <span>{dark ? 'Switch to Light mode' : 'Switch to Dark mode'}</span>
                    </button>
                    <div className="campus-dropdown-divider" />
                    <button className="profile-menu-item danger" onClick={async () => { await logout(); setUser(null); }}>
                      <LogOut size={16} /> <span>Sign out</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="content">
          {/* Teacher Route Guard */}
          {user.role === 'teacher' && (
            FORBIDDEN_TEACHER_PAGES.includes(page) ||
            (page === 'My Class' && !teacherScope?.can_view_my_class) ||
            (page === 'My Subjects' && !teacherScope?.can_view_my_subjects)
          ) ? (
            <div className="panel" style={{ maxWidth: 560, margin: '48px auto', padding: '40px 24px', textAlign: 'center' }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#fee2e2', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <ShieldAlert size={32} />
              </div>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1e293b', marginBottom: 8 }}>Access Restricted</h2>
              <p style={{ fontSize: 14, color: '#64748b', lineHeight: 1.5, marginBottom: 24 }}>
                You don't have access to this page. As a teacher, your portal is restricted to your assigned classes and student learning.
              </p>
              <button className="primary-btn" onClick={() => switchPage('Overview')}>
                Return to My Home
              </button>
            </div>
          ) : (
            <>
              {page === 'Campus setup' && <SchoolSetup user={user} initialSchool={setupSchool} onBack={() => switchPage('Campuses')} />}
              {error && <div className="error-bar"><AlertCircle size={18} />{error}<button onClick={() => load()}><RefreshCw size={15} /> Retry</button></div>}

              {page === 'Overview' && (
                user.role === 'principal' ? (
                  <PrincipalHome user={user} onNavigate={switchPage} notify={notify} />
                ) : user.role === 'teacher' ? (
                  <TeacherHome user={user} onNavigate={switchPage} notify={notify} />
                ) : (
              <>
                <div className="welcome-row">
                <div>
                  <div className="eyebrow"><span className="eyebrow-dot" /> YOUR COMMAND CENTER</div>
                  <h1>Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, {user.name.split(' ')[0]} <span className="wave">✳</span></h1>
                  <p>Here's what's happening across your learning community today.</p>
                </div>
                <button className="primary-btn" onClick={() => switchPage('Reports')}><FileBarChart size={17} /> View insights <ArrowUpRight size={16} /></button>
              </div>

              <section className="hero-banner">
                <div className="hero-copy">
                  <span className="hero-kicker"><Sparkles size={15} /> THE BIGGER PICTURE</span>
                  <h2>Better insights.<br /><span>Brighter futures.</span></h2>
                  <p>Turn everyday campus data into meaningful actions that help every learner thrive.</p>
                  <button onClick={() => switchPage('Interventions')}>Explore student support <ArrowRight size={17} /></button>
                </div>
                <div className="hero-art">
                  <div className="orbit orbit-one" />
                  <div className="orbit orbit-two" />
                  <div className="glass glass-a">
                    <div className="mini-orb">↗</div>
                    <span>Academic growth</span>
                    <strong>{fmt(dash?.stats.academic_average)}</strong>
                    <div className="mini-bars"><i /><i /><i /><i /><i /></div>
                  </div>
                  <div className="glass glass-b"><CheckCircle2 size={18} /><span>Stronger together</span></div>
                  <div className="floating-star star-one">✦</div>
                  <div className="floating-star star-two">✧</div>
                </div>
              </section>

              <div className="section-heading">
                <div><h3>At a glance</h3><p>Your education ecosystem, in numbers</p></div>
                <span className="live-tag"><span /> Live workspace data</span>
              </div>

              <div className="stats-grid">
                <Stat icon={GraduationCap} label="Total students" value={dash?.counts.students ?? 0} foot="Across authorised campuses" tone="lavender" />
                <Stat icon={Building2} label="Active campuses" value={dash?.counts.schools ?? campuses.length} foot="In your organisation" tone="mint" />
                <Stat icon={TrendingUp} label="Academic average" value={fmt(dash?.stats.academic_average)} foot={`${dash?.stats.grade_records ?? 0} recorded grades`} tone="peach" />
                <Stat icon={ClipboardCheck} label="Attendance rate" value={fmt(dash?.stats.attendance_rate)} foot={`${dash?.stats.attendance_records ?? 0} recorded sessions`} tone="blue" />
              </div>

              <div className="dashboard-grid">
                <section className="panel chart-panel">
                  <div className="panel-head">
                    <div><h3>Campus performance</h3><p>Academic results across your campuses</p></div>
                    <div className="head-chip"><Activity size={15} /> Academic overview</div>
                  </div>
                  <div className="chart-wrap">
                    {!(dash?.schools || []).some(s => Number(s.academic_average) > 0) ? (
                      <div className="chart-empty">
                        <BarChart3 size={32} />
                        <strong>No published assessment data yet</strong>
                        <p>Publish assessment results in Academics to view performance trends and analytics.</p>
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={(dash?.schools || []).map((s, i) => ({ name: s.name.length > 13 ? s.name.slice(0, 13) + '…' : s.name, value: s.academic_average || 0, index: i }))} margin={{ top: 20, right: 15, left: -18, bottom: 0 }}>
                          <defs>
                            <linearGradient id="chartfill" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor={accentHex} stopOpacity={0.24} />
                              <stop offset="95%" stopColor={accentHex} stopOpacity={0.005} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid vertical={false} stroke="#edf0f6" strokeDasharray="4 6" />
                          <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#929bad', fontSize: 11 }} dy={13} />
                          <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fill: '#929bad', fontSize: 11 }} />
                          <Tooltip contentStyle={{ borderRadius: 15, border: '1px solid #eee', boxShadow: '0 12px 35px #28336b18' }} formatter={(v) => `${v}%`} />
                          <Area dataKey="value" stroke={accentHex} strokeWidth={3} fill="url(#chartfill)" type="monotone" dot={{ r: 5, fill: accentHex, strokeWidth: 3, stroke: '#fff' }} activeDot={{ r: 7 }} />
                        </AreaChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                  <div className="chart-footer"><span className="legend-dot" /> Published assessment averages <span className="foot-note">Based on available records</span></div>
                </section>

                <section className="panel attention-panel">
                  <div className="panel-head">
                    <div><h3>Needs your attention</h3><p>Student support follow-ups</p></div>
                    <span className="attention-count">{dash?.counts.open_cases ?? 0} open</span>
                  </div>
                  <div className="case-list">
                    {dash?.recent_cases.length ? dash.recent_cases.slice(0, 4).map((c, i) => (
                      <div className="case-item" key={c.id}>
                        <div className={'case-badge c' + i}>{c.priority === 'high' ? <AlertCircle size={18} /> : <HeartHandshake size={18} />}</div>
                        <div className="case-text"><strong>{c.title}</strong><span>{c.student_name || `Student #${c.student_id}`}</span></div>
                        <Pill value={c.priority} />
                      </div>
                    )) : <Empty small text="No outstanding support cases." />}
                  </div>
                  <button className="view-link" onClick={() => switchPage('Interventions')}>Manage support cases <ArrowRight size={17} /></button>
                </section>
              </div>

              {/* Operating Income vs Expense Chart (Dashboard Requirement) */}
              {['organisation_admin', 'school_admin', 'principal'].includes(user.role) && (
                <DashboardFinanceChart user={user} notify={notify} campuses={campuses} onNavigate={switchPage} />
              )}

              {/* Operational Action Cards: Defaulters & Students at Risk */}
              <div className="dashboard-grid lower" style={{ marginBottom: 20 }}>
                {/* Fee Defaulters Summary Card */}
                {['organisation_admin', 'school_admin', 'principal'].includes(user.role) && (
                  <section className="panel attention-panel" style={{ borderLeft: '4px solid #f59e0b' }}>
                    <div className="panel-head">
                      <div>
                        <h3>Fee Collection & Defaulters</h3>
                        <p>Overdue student balances monitoring</p>
                      </div>
                      <span className="attention-count" style={{ background: '#fef3c7', color: '#b45309' }}>
                        Overdue Ledger
                      </span>
                    </div>
                    <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{
                          width: 44, height: 44, borderRadius: 10, background: '#fee2e2',
                          color: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>
                          <Receipt size={22} />
                        </div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>
                            Students with Overdue Balances
                          </div>
                          <div style={{ fontSize: 12, color: '#64748b' }}>
                            Ranked descending by total outstanding balance (1-30, 31-60, 61-90, 90+ days)
                          </div>
                        </div>
                      </div>
                      <div style={{ fontSize: 12, color: '#475569', background: '#f8fafc', padding: '8px 12px', borderRadius: 6 }}>
                        Automated balance reminders with non-restrictive policy for student examinations and materials.
                      </div>
                    </div>
                    <button className="view-link" onClick={() => switchPage('Defaulters')}>
                      Inspect Fee Defaulters <ArrowRight size={17} />
                    </button>
                  </section>
                )}

                {/* Students at Risk Summary Card */}
                {['organisation_admin', 'school_admin', 'principal', 'teacher'].includes(user.role) && (
                  <section className="panel attention-panel" style={{ borderLeft: '4px solid #ef4444' }}>
                    <div className="panel-head">
                      <div>
                        <h3>Students at Risk</h3>
                        <p>Objective academic & attendance indicators</p>
                      </div>
                      <span className="attention-count" style={{ background: '#fee2e2', color: '#b91c1c' }}>
                        Active Monitoring
                      </span>
                    </div>
                    <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{
                          width: 44, height: 44, borderRadius: 10, background: '#fee2e2',
                          color: '#b91c1c', display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>
                          <AlertCircle size={22} />
                        </div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>
                            Evidence-Based Early Support
                          </div>
                          <div style={{ fontSize: 12, color: '#64748b' }}>
                            Identified via objective criteria (grades, attendance, consecutive absences, homework)
                          </div>
                        </div>
                      </div>
                      <div style={{ fontSize: 12, color: '#475569', background: '#f8fafc', padding: '8px 12px', borderRadius: 6 }}>
                        Minimum 3 recorded assessments required for active risk evaluation.
                      </div>
                    </div>
                    <button className="view-link" onClick={() => switchPage('Students at Risk')}>
                      Inspect At-Risk Students <ArrowRight size={17} />
                    </button>
                  </section>
                )}
              </div>

              <div className="dashboard-grid lower">
                <section className="panel students-panel">
                  <div className="panel-head">
                    <div><h3>Recently added students</h3><p>Latest learners in your workspace</p></div>
                    <button className="text-link" onClick={() => switchPage('Students')}>View all <ArrowRight size={16} /></button>
                  </div>
                  <div className="simple-table">
                    <div className="simple-tr table-title"><span>STUDENT</span><span>ADMISSION ID</span><span>CAMPUS</span></div>
                    {dash?.recent_students && dash.recent_students.length > 0 ? (
                      dash.recent_students.map((s, i) => (
                        <div className="simple-tr" key={s.id}>
                          <span className="student-label">
                            <span className="student-avatar" style={{ background: dynColor[i % dynColor.length] + '1b', color: dynColor[i % dynColor.length] }}>
                              {initials(s.first_name + ' ' + s.last_name)}
                            </span>
                            <b>{s.first_name} {s.last_name}</b>
                          </span>
                          <span>{s.admission_number}</span>
                          <span>{s.school__name}</span>
                        </div>
                      ))
                    ) : (
                      <div className="simple-tr">
                        <span style={{ gridColumn: '1 / -1', color: '#9ba2b4', padding: '16px 0', textAlign: 'center' }}>
                          No learners registered yet. Go to Students to enroll your first student.
                        </span>
                      </div>
                    )}
                  </div>
                </section>

                <section className="panel pulse-panel">
                  <div className="panel-head">
                    <div><h3>Workspace pulse</h3><p>The numbers behind your progress</p></div>
                    <MoreHorizontal size={20} color="#a6adbb" />
                  </div>
                  <div className="pulse-feature">
                    <div className="pulse-ring">
                      <strong>{fmt(dash?.stats.attendance_rate)}</strong>
                      <small>Attendance</small>
                    </div>
                    <div className="pulse-copy">
                      <span className="pulse-chip"><Activity size={14} /> Key indicator</span>
                      <h4>Every day counts.</h4>
                      <p>Attendance reflects recorded eligible sessions, not unrecorded days.</p>
                    </div>
                  </div>
                  <div className="pulse-bottom">
                    <div><strong>{dash?.counts.classes ?? 0}</strong><span>Classes</span></div>
                    <div><strong>{dash?.counts.teachers ?? 0}</strong><span>Teachers</span></div>
                    <div><strong>{dash?.counts.open_cases ?? 0}</strong><span>Review cases</span></div>
                  </div>
                </section>
              </div>
            </>
            )
          )}

          {config && (
            <>
              <div className="page-header">
                <div>
                  <div className="eyebrow">WORKSPACE / {page.toUpperCase()}</div>
                  <h1>{config.title}</h1>
                  <p>{config.desc}</p>
                </div>
                {config.fields.length > 0 && !['student', 'parent', 'teacher'].includes(user.role) && (
                  <button className="primary-btn" onClick={openCreateModal}>
                    <Plus size={17} /> Add {page === 'Students' ? 'student' : page === 'Interventions' ? 'case' : page === 'Academic years' ? 'academic year' : page === 'Classes' ? 'class' : page === 'Subjects' ? 'subject' : 'record'}
                  </button>
                )}
              </div>

              <div className="resource-summary">
                <div className="resource-icon"><LayersIcon page={page} /></div>
                <div><strong>{records.length}</strong><span>Total {page.toLowerCase()} records</span></div>
                <div className="resource-side"><CheckCircle2 size={17} /> Synced with your workspace</div>
              </div>

              <section className="panel resource-panel">
                <FilterBar
                  searchPlaceholder={`Search ${page.toLowerCase()} (name, section, keyword)...`}
                  filters={getResourceFilterConfigs(page, user, teacherScope, refData.classes)}
                  values={resourceFilters}
                  onChange={setResourceFilters}
                  onClear={() => setResourceFilters({})}
                  rightActions={
                    <>
                      <span className="result-count">{filtered.length} records found</span>
                      <button className="outline-btn" onClick={() => load()}><RefreshCw size={15} /> Refresh</button>
                      {!(user?.role === 'teacher' && teacherScope?.can_export === false) && (
                        <ExportMenu
                          title={`${page} Directory`}
                          filename={`${page.toLowerCase().replace(/\s+/g, '-')}-list`}
                          columns={effectiveColumns.map(c => ({ key: c.key, label: c.label }))}
                          rows={() => filtered.map(r => {
                            const obj: Record<string, any> = {};
                            for (const col of effectiveColumns) {
                              if (col.key === 'name') obj[col.key] = r.full_name || `${r.first_name || ''} ${r.last_name || ''}`.trim() || r.name;
                              else if (col.key === 'gender') obj[col.key] = r.gender === 'male' ? 'Boy' : r.gender === 'female' ? 'Girl' : (r.gender || '—');
                              else obj[col.key] = r[col.key] ?? '—';
                            }
                            return obj;
                          })}
                          notify={notify}
                        />
                      )}
                    </>
                  }
                />

                <div className="table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        {effectiveColumns.map(c => <th key={c.key}>{c.label}</th>)}
                        <th style={{ textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((r, i) => (
                        <tr key={r.id}>
                          {effectiveColumns.map((c, j) => (
                            <td key={c.key}>
                              {j === 0 ? (
                                <div className="student-label">
                                  <span className="student-avatar" style={{ background: dynColor[i % dynColor.length] + '18', color: dynColor[i % dynColor.length] }}>
                                    {initials(String(c.key === 'name' ? r.full_name || `${r.first_name || ''} ${r.last_name || ''}` : r[c.key] || 'OO'))}
                                  </span>
                                  <strong>{c.key === 'name' ? String(r.full_name || `${r.first_name} ${r.last_name}`) : String(r[c.key] || '—')}</strong>
                                </div>
                              ) : typeof r[c.key] === 'boolean' || ['status', 'priority'].includes(c.key) ? (
                                <Pill value={r[c.key] as string | boolean} />
                              ) : (
                                <span>{c.key === 'gender' ? (r.gender === 'male' ? 'Boy' : r.gender === 'female' ? 'Girl' : '—') : String(r[c.key] ?? '—')}</span>
                              )}
                            </td>
                          ))}
                          <td>
                            <div className="table-actions">
                              {['organisation_admin', 'school_admin', 'principal'].includes(user.role) && (
                                <>
                                  <button className="action-btn-sm edit-btn" title="Edit record" onClick={() => openEditModal(r)}>
                                    <Pencil size={13} /> <span>Edit</span>
                                  </button>
                                  <button className="action-btn-sm delete-btn" title="Delete record" onClick={() => handleDeleteRecord(r)}>
                                    <Trash2 size={13} /> <span>Delete</span>
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!filtered.length && <Empty text={search ? 'No matching records. Try a different search.' : 'No records yet. Add your first entry to get started.'} />}
                </div>

                <div className="table-footer">
                  <span>Showing {filtered.length} of {records.length} records</span>
                  <span>All authorised records <ShieldCheck size={15} /></span>
                </div>
              </section>
            </>
          )}

          {page === 'My Class' && <TeacherMyClass user={user} onNavigate={switchPage} notify={notify} />}
          {page === 'My Subjects' && <TeacherMySubjects user={user} onNavigate={switchPage} notify={notify} />}
          {page === 'Campuses' && <CampusesPage user={user} notify={notify} onSetupSchool={(id) => { setSetupSchool(id); switchPage('Campus setup'); }} onCampusesChanged={() => { load(); }} />}
          {page === 'Audit log' && <AuditLogView notify={notify} />}
          {page === 'Reports' && <Reports user={user} />}
          {page === 'Staff' && <Staff user={user} notify={notify} />}
          {page === 'Finance' && <Finance user={user} notify={notify} />}
          {page === 'Attendance' && <AttendanceModule user={user} notify={notify} campuses={campuses} />}
          {['Student fees', 'Student Fees', 'Fees', 'Fee overview', 'Fee structure', 'Collect fee', 'Vouchers', 'Defaulters', 'Concessions', 'Receipts'].includes(page) && (
            <Fees user={user} notify={notify} initialTab={page} />
          )}
          {page === 'Study materials' && <StudyMaterials user={user} notify={notify} />}
          {page === 'Staff Salaries' && <Salaries user={user} notify={notify} />}
          {page === 'Examinations' && (
            <ErrorBoundary fallbackTitle="Examination & Academic Performance">
              <Examinations
                user={user}
                notify={notify}
                activeCampusId={activeCampusId}
                onSelectCampus={(newId) => {
                  setActiveCampusId(newId);
                  if (newId) {
                    localStorage.setItem('optimus_active_campus_id', String(newId));
                  } else {
                    localStorage.removeItem('optimus_active_campus_id');
                  }
                }}
                campuses={campuses}
              />
            </ErrorBoundary>
          )}
          {page === 'Academic Quality Index' && (
            <ErrorBoundary fallbackTitle="Academic Quality Index">
              <AcademicQualityIndex
                user={user}
                notify={notify}
                activeCampusId={activeCampusId}
                onSelectCampus={(newId) => {
                  setActiveCampusId(newId);
                  if (newId) {
                    localStorage.setItem('optimus_active_campus_id', String(newId));
                  } else {
                    localStorage.removeItem('optimus_active_campus_id');
                  }
                }}
              />
            </ErrorBoundary>
          )}
          {page === 'Timetable' && <Timetable user={user} notify={notify} />}
          {page === 'Platform owner' && <PlatformOwner user={user} notify={notify} />}
          {page === 'Data import' && <DataImport user={user} notify={notify} />}
          {page === 'My performance' && <MyPerformance />}
          {page === 'Communication' && <Communication user={user} notify={notify} />}
          {page === 'Announcements' && <Announcements user={user} notify={notify} />}
          {page === 'Settings' && <Settings user={user} onUserUpdated={u => setUser(u)} notify={notify} />}
          {page === 'Permissions' && <Permissions user={user} notify={notify} />}
          {['Students at Risk', 'At-risk list', 'Risk criteria', 'Review cases'].includes(page) && (
            <StudentsAtRisk user={user} notify={notify} initialTab={page} onNavigate={switchPage} />
          )}

            </>
          )}
        </main>
        <footer className="footer">
          <span>© {new Date().getFullYear()} Optimus Orien. Made for better education.</span>
          <span><span className="online-indicator" /> Secure school intelligence platform</span>
        </footer>
      </div>

      {/* Create Modal */}
      {modal && config && (
        <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setModal(false); }}>
          <div className="modal-card">
            <div className="modal-head">
              <div className="modal-icon"><Plus size={20} /></div>
              <div>
                <h3>Create {page === 'Interventions' ? 'support case' : page === 'Academic years' ? 'academic year' : page === 'Classes' ? 'class' : page === 'Subjects' ? 'subject' : page.slice(0, -1).toLowerCase()}</h3>
                <p>Complete the details below to add a new entry.</p>
              </div>
              <button onClick={() => setModal(false)}><X size={20} /></button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="modal-fields">
                {page === 'Students' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16, gridColumn: '1 / -1' }}>
                    {/* 1. Campus Selection */}
                    {!isSingleCampusRole ? (
                      <label>
                        Campus <span className="required">*</span>
                        <select
                          required
                          value={form.school || ''}
                          onChange={e => {
                            const sc = e.target.value;
                            setForm(s => ({ ...s, school: sc, school_class: '' }));
                          }}
                        >
                          <option value="">Select campus…</option>
                          {refData.schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                      </label>
                    ) : (
                      <div style={{ padding: '10px 14px', background: '#f8fafc', borderRadius: 8, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, border: '1px solid #e2e8f0' }}>
                        <Building2 size={16} color="var(--brand-primary, #6366f1)" />
                        <span>Assigned Campus: <strong>{activeCampus ? activeCampus.name : (campuses[0]?.name || 'Assigned Campus')}</strong></span>
                      </div>
                    )}

                    {/* 2. Class Selection (MANDATORY & AT TOP) */}
                    <label>
                      Class <span className="required">*</span>
                      <select
                        required
                        disabled={!form.school && !isSingleCampusRole}
                        value={form.school_class || ''}
                        onChange={e => setForm(s => ({ ...s, school_class: e.target.value }))}
                      >
                        <option value="">{form.school || isSingleCampusRole ? 'Select class…' : 'Select campus first'}</option>
                        {refData.classes
                          .filter(c => !form.school || !c.school || String(c.school) === form.school)
                          .map(c => (
                            <option key={c.id} value={c.id}>
                              {(c as any).display_name || ((c as any).section ? `${c.name} – ${(c as any).section}` : c.name)}
                            </option>
                          ))}
                      </select>
                    </label>

                    {/* 3. Student Personal Details */}
                    <div style={{ fontSize: 11, fontWeight: 800, color: '#6366f1', textTransform: 'uppercase', letterSpacing: 0.8, borderTop: '1px solid #f1f5f9', paddingTop: 12 }}>
                      Student Details
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                      <label>
                        First Name <span className="required">*</span>
                        <input
                          required
                          type="text"
                          placeholder="First name"
                          value={form.first_name || ''}
                          onChange={e => setForm(s => ({ ...s, first_name: e.target.value }))}
                        />
                      </label>
                      <label>
                        Last Name <span className="required">*</span>
                        <input
                          required
                          type="text"
                          placeholder="Last name"
                          value={form.last_name || ''}
                          onChange={e => setForm(s => ({ ...s, last_name: e.target.value }))}
                        />
                      </label>
                      <label>
                        Admission Number <span className="required">*</span>
                        <input
                          required
                          type="text"
                          placeholder="e.g. ADM-2026-001"
                          value={form.admission_number || ''}
                          onChange={e => setForm(s => ({ ...s, admission_number: e.target.value }))}
                        />
                      </label>
                      <label>
                        Gender <span className="required">*</span>
                        <select
                          required
                          value={form.gender || ''}
                          onChange={e => setForm(s => ({ ...s, gender: e.target.value }))}
                        >
                          <option value="">Select gender *</option>
                          <option value="male">Boy (Male)</option>
                          <option value="female">Girl (Female)</option>
                        </select>
                      </label>
                      <label>
                        Father Name <span className="required">*</span>
                        <input
                          required
                          type="text"
                          placeholder="Father name"
                          value={form.father_name || ''}
                          onChange={e => setForm(s => ({ ...s, father_name: e.target.value }))}
                        />
                      </label>
                      <label>
                        Mother Name
                        <input
                          type="text"
                          placeholder="Mother name (optional)"
                          value={form.mother_name || ''}
                          onChange={e => setForm(s => ({ ...s, mother_name: e.target.value }))}
                        />
                      </label>
                      <label>
                        Date of Birth
                        <input
                          type="date"
                          value={form.dob || ''}
                          onChange={e => setForm(s => ({ ...s, dob: e.target.value }))}
                        />
                      </label>
                      <label>
                        Enrolment Date <span className="required">*</span>
                        <input
                          required
                          type="date"
                          value={form.enrolled_on || ''}
                          onChange={e => setForm(s => ({ ...s, enrolled_on: e.target.value }))}
                        />
                      </label>
                    </div>

                    {/* 4. Guardian Details */}
                    <div style={{ fontSize: 11, fontWeight: 800, color: '#6366f1', textTransform: 'uppercase', letterSpacing: 0.8, borderTop: '1px solid #f1f5f9', paddingTop: 12 }}>
                      Guardian Contact
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                      <label>
                        Guardian Phone
                        <input
                          type="tel"
                          placeholder="e.g. +92 300 1234567"
                          value={form.guardian_phone || ''}
                          onChange={e => setForm(s => ({ ...s, guardian_phone: e.target.value }))}
                        />
                      </label>
                    </div>

                    {/* 5. Fees Section */}
                    <div style={{ borderTop: '1px solid #edf0f8', paddingTop: 14 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 6 }}>
                        <div style={{ fontSize: 11, fontWeight: 800, color: '#6366f1', textTransform: 'uppercase', letterSpacing: 0.8 }}>
                          Student Fees & Billing Challan (Registration)
                        </div>
                        <div style={{ fontSize: 10, color: '#8892a5', fontWeight: 600 }}>
                          Monthly fee is required (&gt; 0) · Admission fee accepts 0 (for free admission)
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <label>
                          Monthly Tuition Fee (Rs) <span className="required">*</span>
                          <input
                            type="number"
                            step="0.01"
                            min="1"
                            required
                            placeholder="e.g. 5000 (Mandatory > 0)"
                            value={form.monthly_fee || ''}
                            onChange={e => setForm(s => ({ ...s, monthly_fee: e.target.value }))}
                          />
                        </label>

                        <label>
                          New Admission Fee (Rs) <span className="required">*</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            required
                            placeholder="e.g. 5000 (0 if free / waived)"
                            value={form.admission_fee !== undefined ? form.admission_fee : ''}
                            onChange={e => setForm(s => ({ ...s, admission_fee: e.target.value }))}
                          />
                        </label>

                        <label>
                          Annual Fee (Rs) <span style={{ fontSize: 11, color: '#9ba2b4', fontWeight: 400 }}>(Optional)</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="e.g. 2500 (Optional)"
                            value={form.annual_fee || ''}
                            onChange={e => setForm(s => ({ ...s, annual_fee: e.target.value }))}
                          />
                        </label>

                        <div style={{ gridColumn: '1 / -1', background: '#f8fafc', padding: '12px 14px', borderRadius: 10, border: '1px solid #e2e8f0', marginTop: 4 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: '#334155', marginBottom: 8 }}>
                            Extra Charges & Miscellaneous (Optional)
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr', gap: 10 }}>
                            <label style={{ margin: 0 }}>
                              Extra Amount (Rs)
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                placeholder="e.g. 1500"
                                value={form.extra_charges || ''}
                                onChange={e => setForm(s => ({ ...s, extra_charges: e.target.value }))}
                              />
                            </label>
                            <label style={{ margin: 0 }}>
                              Reason for Extra Charges {Number(form.extra_charges) > 0 && <span className="required">*</span>}
                              <input
                                type="text"
                                placeholder="e.g. Uniform, Lab Security, Registration Books…"
                                value={form.extra_charges_reason || ''}
                                onChange={e => setForm(s => ({ ...s, extra_charges_reason: e.target.value }))}
                                required={Number(form.extra_charges) > 0}
                              />
                            </label>
                          </div>
                        </div>

                        {/* Due Date Options */}
                        <div style={{ gridColumn: '1 / -1', background: '#f8fafc', padding: '12px 14px', borderRadius: 10, border: '1px solid #e2e8f0', marginTop: 4 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: '#334155', marginBottom: 8 }}>
                            Fee Due Date Option
                          </div>
                          <div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap', marginBottom: dueDateMode === 'custom' ? 10 : 0 }}>
                            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, margin: 0, cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
                              <input
                                type="radio"
                                name="due_date_mode"
                                value="standard"
                                checked={dueDateMode === 'standard'}
                                onChange={() => setDueDateMode('standard')}
                              />
                              Standard / Same date for all (Default 10 days)
                            </label>
                            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, margin: 0, cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
                              <input
                                type="radio"
                                name="due_date_mode"
                                value="custom"
                                checked={dueDateMode === 'custom'}
                                onChange={() => setDueDateMode('custom')}
                              />
                              Custom due date for this student
                            </label>
                          </div>
                          {dueDateMode === 'custom' && (
                            <div style={{ marginTop: 8 }}>
                              <label style={{ margin: 0, maxWidth: 220 }}>
                                Custom Due Date <span className="required">*</span>
                                <input
                                  type="date"
                                  required={dueDateMode === 'custom'}
                                  value={customDueDate}
                                  onChange={e => setCustomDueDate(e.target.value)}
                                />
                              </label>
                            </div>
                          )}
                        </div>

                        {/* Dynamic Custom Charges */}
                        <div style={{ gridColumn: '1 / -1', marginTop: 4 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>
                              New Categories of Charges
                            </div>
                            <button
                              type="button"
                              className="outline-btn"
                              style={{ fontSize: 12, padding: '4px 10px', height: 'auto', gap: 4 }}
                              onClick={() => setDynamicCharges(prev => [...prev, { id: Math.random().toString(36).slice(2), name: '', amount: '' }])}
                            >
                              <Plus size={13} /> To make a new category of Charges
                            </button>
                          </div>

                          {dynamicCharges.length > 0 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              {dynamicCharges.map((dc, idx) => (
                                <div key={dc.id} className="custom-charge-row">
                                  <input
                                    type="text"
                                    placeholder="Charges Name (e.g. Science Lab, Sports Kit, ID Card)"
                                    value={dc.name}
                                    onChange={e => {
                                      const val = e.target.value;
                                      setDynamicCharges(prev => prev.map((item, i) => i === idx ? { ...item, name: val } : item));
                                    }}
                                  />
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    placeholder="Amount (Rs)"
                                    value={dc.amount}
                                    onChange={e => {
                                      const val = e.target.value;
                                      setDynamicCharges(prev => prev.map((item, i) => i === idx ? { ...item, amount: val } : item));
                                    }}
                                  />
                                  <button
                                    type="button"
                                    className="icon-btn"
                                    style={{ color: '#ef4444', padding: 6 }}
                                    title="Remove charge"
                                    onClick={() => setDynamicCharges(prev => prev.filter((_, i) => i !== idx))}
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <div style={{ gridColumn: '1 / -1', background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', padding: '10px 14px', borderRadius: 8, fontSize: 11, lineHeight: 1.5 }}>
                          <strong>Challan Workflow:</strong> Saving this student registers them in the chosen class and generates their fee voucher. When admission fee is Rs 0, a waived voucher (Rs 0.00) is recorded without marking them as a defaulter.
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  config.fields.map(f => {
                    if (f.key === 'school') return (
                      <label key={f.key}>
                        {f.label}{f.required && <span className="required"> *</span>}
                        <select
                          required={f.required}
                          value={form.school || String(activeCampusId || refData.schools[0]?.id || '')}
                          onChange={e => setForm(s => ({ ...s, school: e.target.value }))}
                        >
                          <option value="">Select campus…</option>
                          {refData.schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                      </label>
                    );
                    if (f.key === 'academic_year') {
                      const currentCampus = form.school || String(activeCampusId || '');
                      const yrs = currentCampus ? refData.years.filter(y => !y.school || String(y.school) === currentCampus) : refData.years;
                      return (
                        <label key={f.key}>
                          {f.label}{f.required && <span className="required"> *</span>}
                          <select required={f.required} value={form.academic_year || ''} onChange={e => setForm(s => ({ ...s, academic_year: e.target.value }))}>
                            <option value="">Select academic year…</option>
                            {yrs.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}
                          </select>
                        </label>
                      );
                    }
                    if (f.key === 'teacher') {
                      const currentCampus = form.school || String(activeCampusId || '');
                      const tchs = currentCampus ? refData.teachers.filter(t => !t.school_id || String(t.school_id) === currentCampus) : refData.teachers;
                      return (
                        <label key={f.key}>
                          {f.label}{f.required && <span className="required"> *</span>}
                          <select value={form.teacher || ''} onChange={e => setForm(s => ({ ...s, teacher: e.target.value }))}>
                            <option value="">Unassigned (optional)</option>
                            {tchs.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                          </select>
                        </label>
                      );
                    }
                    if (f.key === 'school_class') {
                      const currentCampus = form.school || String(activeCampusId || '');
                      const cls = currentCampus ? refData.classes.filter(c => !c.school || String(c.school) === currentCampus) : refData.classes;
                      return (
                        <label key={f.key}>
                          {f.label}{f.required && <span className="required"> *</span>}
                          <select required={f.required} value={form.school_class || ''} onChange={e => setForm(s => ({ ...s, school_class: e.target.value }))}>
                            <option value="">Select class…</option>
                            {cls.map(c => <option key={c.id} value={c.id}>{(c as any).display_name || ((c as any).section ? `${c.name} – ${(c as any).section}` : c.name)}</option>)}
                          </select>
                        </label>
                      );
                    }
                    if (f.key === 'subject') {
                      const currentCampus = form.school || String(activeCampusId || '');
                      const subs = currentCampus ? refData.subjects.filter(s => !s.school || String(s.school) === currentCampus) : refData.subjects;
                      return (
                        <label key={f.key}>
                          {f.label}{f.required && <span className="required"> *</span>}
                          <select required={f.required} value={form.subject || ''} onChange={e => setForm(s => ({ ...s, subject: e.target.value }))}>
                            <option value="">Select subject…</option>
                            {subs.map(sub => <option key={sub.id} value={sub.id}>{sub.name} {sub.code ? `(${sub.code})` : ''}</option>)}
                          </select>
                        </label>
                      );
                    }
                    if (f.key === 'gender') return (
                      <label key={f.key}>
                        {f.label}<span className="required"> *</span>
                        <select required value={form.gender || ''} onChange={e => setForm(s => ({ ...s, gender: e.target.value }))}>
                          <option value="">Select gender *</option>
                          <option value="male">Boy (Male)</option>
                          <option value="female">Girl (Female)</option>
                        </select>
                      </label>
                    );
                    if (f.key === 'status' && page === 'Attendance') return (
                      <label key={f.key}>
                        {f.label}{f.required && <span className="required"> *</span>}
                        <select required={f.required} value={form.status || 'present'} onChange={e => setForm(s => ({ ...s, status: e.target.value }))}>
                          <option value="present">Present</option>
                          <option value="absent">Absent</option>
                          <option value="late">Late</option>
                          <option value="excused">Excused</option>
                        </select>
                      </label>
                    );
                    if (f.key === 'priority' && page === 'Interventions') return (
                      <label key={f.key}>
                        {f.label}{f.required && <span className="required"> *</span>}
                        <select value={form.priority || 'medium'} onChange={e => setForm(s => ({ ...s, priority: e.target.value }))}>
                          <option value="low">Low</option>
                          <option value="medium">Medium</option>
                          <option value="high">High</option>
                        </select>
                      </label>
                    );
                    if (f.key === 'status' && page === 'Interventions') return (
                      <label key={f.key}>
                        {f.label}{f.required && <span className="required"> *</span>}
                        <select value={form.status || 'open'} onChange={e => setForm(s => ({ ...s, status: e.target.value }))}>
                          <option value="open">Open</option>
                          <option value="in_progress">In progress</option>
                          <option value="monitoring">Monitoring</option>
                          <option value="resolved">Resolved</option>
                        </select>
                      </label>
                    );
                    return (
                      <label key={f.key}>
                        {f.label}{f.required && <span className="required"> *</span>}
                        <input required={f.required} type={f.type || 'text'} value={form[f.key] || ''} onChange={e => setForm(s => ({ ...s, [f.key]: e.target.value }))} placeholder={f.label} />
                      </label>
                    );
                  })
                )}
              </div>
              <div className="modal-footer">
                <button type="button" className="outline-btn" onClick={() => setModal(false)}>Cancel</button>
                <button className="primary-btn" disabled={saving}>{saving ? 'Saving…' : 'Create record'} <ArrowRight size={16} /></button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editModal && config && editingRecord && (
        <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setEditModal(false); }}>
          <div className="modal-card">
            <div className="modal-head">
              <div className="modal-icon"><Pencil size={20} /></div>
              <div>
                <h3>Edit {page === 'Interventions' ? 'support case' : page === 'Academic years' ? 'academic year' : page === 'Classes' ? 'class' : page === 'Subjects' ? 'subject' : page.slice(0, -1).toLowerCase()}</h3>
                <p>Modify record fields and save changes.</p>
              </div>
              <button onClick={() => setEditModal(false)}><X size={20} /></button>
            </div>
            <form onSubmit={handleEditSave}>
              <div className="modal-fields">
                {config.fields.map(f => {
                  if (f.key === 'school') return (
                    <label key={f.key}>
                      {f.label}{f.required && <span className="required"> *</span>}
                      <select
                        required={f.required}
                        value={editForm.school || ''}
                        onChange={e => setEditForm(s => ({ ...s, school: e.target.value }))}
                      >
                        <option value="">Select campus…</option>
                        {campuses.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </label>
                  );
                  if (f.key === 'gender') return (
                    <label key={f.key}>
                      {f.label}<span className="required"> *</span>
                      <select required value={editForm.gender || ''} onChange={e => setEditForm(s => ({ ...s, gender: e.target.value }))}>
                        <option value="">Select gender *</option>
                        <option value="male">Boy (Male)</option>
                        <option value="female">Girl (Female)</option>
                      </select>
                    </label>
                  );
                  if (f.key === 'status' && page === 'Attendance') return (
                    <label key={f.key}>
                      {f.label}{f.required && <span className="required"> *</span>}
                      <select required={f.required} value={editForm.status || 'present'} onChange={e => setEditForm(s => ({ ...s, status: e.target.value }))}>
                        <option value="present">Present</option>
                        <option value="absent">Absent</option>
                        <option value="late">Late</option>
                        <option value="excused">Excused</option>
                      </select>
                    </label>
                  );
                  if (f.key === 'priority' && page === 'Interventions') return (
                    <label key={f.key}>
                      {f.label}{f.required && <span className="required"> *</span>}
                      <select value={editForm.priority || 'medium'} onChange={e => setEditForm(s => ({ ...s, priority: e.target.value }))}>
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                      </select>
                    </label>
                  );
                  if (f.key === 'status' && page === 'Interventions') return (
                    <label key={f.key}>
                      {f.label}{f.required && <span className="required"> *</span>}
                      <select value={editForm.status || 'open'} onChange={e => setEditForm(s => ({ ...s, status: e.target.value }))}>
                        <option value="open">Open</option>
                        <option value="in_progress">In progress</option>
                        <option value="monitoring">Monitoring</option>
                        <option value="resolved">Resolved</option>
                      </select>
                    </label>
                  );
                  return (
                    <label key={f.key}>
                      {f.label}{f.required && <span className="required"> *</span>}
                      <input required={f.required} type={f.type || 'text'} value={editForm[f.key] || ''} onChange={e => setEditForm(s => ({ ...s, [f.key]: e.target.value }))} placeholder={f.label} />
                    </label>
                  );
                })}
              </div>
              <div className="modal-footer">
                <button type="button" className="outline-btn" onClick={() => setEditModal(false)}>Cancel</button>
                <button className="primary-btn" disabled={saving}>{saving ? 'Saving…' : 'Save changes'} <ArrowRight size={16} /></button>
              </div>
            </form>
          </div>
        </div>
      )}

      {toast && (
        <div className="toast"><CheckCircle2 size={18} />{toast}<button onClick={() => setToast('')}><X size={16} /></button></div>
      )}
    </div>
  );
}

function LayersIcon({ page }: { page: string }) {
  return page === 'Students' ? <GraduationCap size={23} /> : page === 'Timetable' ? <CalendarDays size={23} /> : page === 'Attendance' ? <ClipboardCheck size={23} /> : page === 'Interventions' ? <HeartHandshake size={23} /> : page === 'Academic years' ? <CalendarDays size={23} /> : page === 'Subjects' ? <BookOpen size={23} /> : page === 'Classes' ? <Users size={23} /> : <FileBarChart size={23} />;
}

function Stat({ icon: Icon, label, value, foot, tone }: { icon: typeof Users; label: string; value: string | number; foot: string; tone: string }) {
  return (
    <div className="stat-card">
      <div className={'stat-icon ' + tone}><Icon size={21} /></div>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      <div className="stat-foot"><span className="tiny-dot" /> {foot}</div>
      <div className={'stat-decor ' + tone} />
    </div>
  );
}

function Empty({ text, small = false }: { text: string; small?: boolean }) {
  return (
    <div className={'empty ' + (small ? 'empty-small' : '')}>
      <span><ClipboardList size={25} /></span>
      <strong>Nothing to show yet</strong>
      <p>{text}</p>
    </div>
  );
}

function Login({ onLogin }: { onLogin: (user: User) => void }) {
  const [tab, setTab] = useState<'signin' | 'register' | 'forgot'>(() =>
    window.location.search.includes('tab=register') || window.location.pathname === '/register' ? 'register' : 'signin'
  );
  const [name, setName] = useState(''), [pass, setPass] = useState('');
  const [forgotIdentifier, setForgotIdentifier] = useState('');
  const [forgotUid, setForgotUid] = useState('');
  const [forgotToken, setForgotToken] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [forgotStep, setForgotStep] = useState<1 | 2>(1);
  const [forgotMsg, setForgotMsg] = useState('');
  const [regForm, setRegForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    username: '',
    password: '',
    organisation_name: '',
    school_name: '',
    city: '',
    role: 'organisation_admin'
  });
  const [pending, setPending] = useState(false), [error, setError] = useState('');

  async function submitLogin(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError('');
    try {
      onLogin(await login(name, pass));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign in failed');
    } finally {
      setPending(false);
    }
  }

  async function submitRegister(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError('');
    try {
      onLogin(await register(regForm));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Registration failed');
    } finally {
      setPending(false);
    }
  }

  async function handleRequestForgot(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError('');
    setForgotMsg('');
    try {
      const res = await forgotPassword(forgotIdentifier.trim());
      setForgotUid(res.uid);
      setForgotToken(res.token);
      setForgotStep(2);
      setForgotMsg(`Reset token generated for ${res.email || forgotIdentifier}. Set your new password below.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not request password reset');
    } finally {
      setPending(false);
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPass.length < 8) {
      setError('New password must be at least 8 characters long');
      return;
    }
    if (newPass !== confirmPass) {
      setError('New password and confirmation do not match');
      return;
    }
    setPending(true);
    setError('');
    setForgotMsg('');
    try {
      const res = await resetPassword({
        uid: forgotUid,
        token: forgotToken.trim(),
        password: newPass
      });
      setForgotMsg(res.detail || 'Password reset successfully! You can now sign in.');
      setTimeout(() => {
        setTab('signin');
        setName(forgotIdentifier);
        setPass('');
        setError('');
      }, 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reset password');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-left">
        <div className="login-brand">
          <span className="brand-symbol">◈</span>
          <strong>optimus<span>orien</span></strong>
        </div>
        <div className="login-art">
          <div className="login-circle one" />
          <div className="login-circle two" />
          <div className="login-glass">
            <div className="login-insight-icon"><TrendingUp size={23} /></div>
            <span>Student performance</span>
            <strong>Growing together</strong>
            <div className="login-line"><i /><i /><i /><i /><i /><i /></div>
          </div>
          <div className="login-glass second"><CheckCircle2 size={20} /> Meaningful progress, every day</div>
        </div>
        <div className="login-left-copy">
          <div className="hero-kicker"><Sparkles size={15} /> INTELLIGENCE WITH EMPATHY</div>
          <h1>Every learner has<br />a story. <em>See the full picture.</em></h1>
          <p>Multi-campus management, analytics, attendance, assessments, and communication in one unified workspace.</p>
        </div>
        <span className="login-copyright">© {new Date().getFullYear()} Optimus Orien. All rights reserved.</span>
      </div>
      <div className="login-right">
        <div className="login-form-wrap login-card">
          <div className="login-welcome-icon"><GraduationCap size={26} /></div>

          <div className="login-tabs">
            <button
              type="button"
              className={`login-tab ${tab === 'signin' ? 'active' : ''}`}
              onClick={() => { setTab('signin'); setError(''); setForgotMsg(''); }}
            >
              Sign In
            </button>
            <button
              type="button"
              className={`login-tab ${tab === 'register' ? 'active' : ''}`}
              onClick={() => { setTab('register'); setError(''); setForgotMsg(''); }}
            >
              Create Account
            </button>
          </div>

          {tab === 'forgot' ? (
            <>
              <span className="eyebrow">ACCOUNT RECOVERY</span>
              <h2>Reset password</h2>
              <p className="login-subtitle">Recover access to your Optimus Orien workspace</p>

              {forgotMsg && (
                <div style={{ background: '#dcfce7', border: '1px solid #86efac', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#166534', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <CheckCircle2 size={16} /> {forgotMsg}
                </div>
              )}
              {error && <div className="login-error"><AlertCircle size={16} />{error}</div>}

              {forgotStep === 1 ? (
                <form onSubmit={handleRequestForgot}>
                  <label>
                    Username or Email
                    <input
                      required
                      autoComplete="username"
                      value={forgotIdentifier}
                      onChange={e => setForgotIdentifier(e.target.value)}
                      placeholder="Enter your registered email or username"
                    />
                  </label>
                  <button type="submit" className="login-submit" disabled={pending} style={{ marginTop: 8 }}>
                    {pending ? 'Verifying…' : 'Generate reset token'} <ArrowRight size={18} />
                  </button>
                </form>
              ) : (
                <form onSubmit={handleResetPassword}>
                  <label>
                    Reset Token
                    <input
                      required
                      value={forgotToken}
                      onChange={e => setForgotToken(e.target.value)}
                      placeholder="Paste reset token"
                    />
                  </label>
                  <label>
                    New Password
                    <PasswordField
                      required
                      minLength={8}
                      value={newPass}
                      onChange={e => setNewPass(e.target.value)}
                      placeholder="Min 8 characters"
                    />
                  </label>
                  <label>
                    Confirm New Password
                    <PasswordField
                      required
                      minLength={8}
                      value={confirmPass}
                      onChange={e => setConfirmPass(e.target.value)}
                      placeholder="Confirm new password"
                    />
                  </label>
                  <button type="submit" className="login-submit" disabled={pending} style={{ marginTop: 8 }}>
                    {pending ? 'Resetting password…' : 'Save new password'} <ArrowRight size={18} />
                  </button>
                </form>
              )}

              <div className="login-switch-row" style={{ marginTop: 20 }}>
                <span>Remembered your password?</span>
                <button type="button" className="text-link-btn" onClick={() => { setTab('signin'); setError(''); setForgotMsg(''); }}>
                  ← Back to Sign In
                </button>
              </div>
            </>
          ) : tab === 'signin' ? (
            <>
              <span className="eyebrow">WELCOME BACK</span>
              <h2>Your workspace awaits.</h2>
              <p className="login-subtitle">Sign in to your education workspace</p>
              <form onSubmit={submitLogin}>
                <label>
                  Username or Email
                  <input
                    autoComplete="username"
                    required
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Enter your username or email"
                  />
                </label>
                <label>
                  Password
                  <PasswordField
                    autoComplete="current-password"
                    required
                    value={pass}
                    onChange={e => setPass(e.target.value)}
                    placeholder="Enter your password"
                  />
                </label>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: -6, marginBottom: 12 }}>
                  <button
                    type="button"
                    className="text-link-btn"
                    style={{ fontSize: 12, color: 'var(--brand-primary, #6366f1)', border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}
                    onClick={() => { setTab('forgot'); setError(''); setForgotMsg(''); setForgotStep(1); }}
                  >
                    Forgot password?
                  </button>
                </div>
                {error && <div className="login-error"><AlertCircle size={16} />{error}</div>}
                <button type="submit" className="login-submit" disabled={pending}>
                  {pending ? 'Signing in…' : 'Sign in to workspace'} <ArrowRight size={18} />
                </button>
              </form>
              <div className="login-switch-row">
                <span>New educational institution?</span>
                <button type="button" className="text-link-btn" onClick={() => { setTab('register'); setError(''); }}>
                  Create account & register campus →
                </button>
              </div>
              <div className="demo-credentials">
                <div><ShieldCheck size={16} /><strong>Authorised Workspace Access</strong></div>
                <p>Sign in with your educational credentials. For account recovery or access requests, contact your school administrator.</p>
              </div>
            </>
          ) : (
            <>
              <span className="eyebrow">INSTITUTION SETUP</span>
              <h2>Register your institution</h2>
              <p className="login-subtitle">Set up your organisation, initial campus, and administrator</p>
              <form onSubmit={submitRegister}>
                <div className="login-grid-2">
                  <label>
                    First name
                    <input
                      required
                      value={regForm.first_name}
                      onChange={e => setRegForm({ ...regForm, first_name: e.target.value })}
                      placeholder="Eleanor"
                    />
                  </label>
                  <label>
                    Last name
                    <input
                      required
                      value={regForm.last_name}
                      onChange={e => setRegForm({ ...regForm, last_name: e.target.value })}
                      placeholder="Vance"
                    />
                  </label>
                </div>
                <label>
                  Official email
                  <input
                    required
                    type="email"
                    autoComplete="email"
                    value={regForm.email}
                    onChange={e => setRegForm({ ...regForm, email: e.target.value })}
                    placeholder="admin@school.org"
                  />
                </label>
                <div className="login-grid-2">
                  <label>
                    Username
                    <input
                      required
                      autoComplete="username"
                      value={regForm.username}
                      onChange={e => setRegForm({ ...regForm, username: e.target.value })}
                      placeholder="admin_eleanor"
                    />
                  </label>
                  <label>
                    Password (min 8 chars)
                    <PasswordField
                      required
                      autoComplete="new-password"
                      value={regForm.password}
                      onChange={e => setRegForm({ ...regForm, password: e.target.value })}
                      placeholder="Password"
                    />
                  </label>
                </div>
                <label>
                  Organisation / Trust Name
                  <input
                    required
                    value={regForm.organisation_name}
                    onChange={e => setRegForm({ ...regForm, organisation_name: e.target.value })}
                    placeholder="St. Jude Educational Trust"
                  />
                </label>
                <div className="login-grid-2">
                  <label>
                    Initial Campus Name
                    <input
                      value={regForm.school_name}
                      onChange={e => setRegForm({ ...regForm, school_name: e.target.value })}
                      placeholder="Main City Campus"
                    />
                  </label>
                  <label>
                    City
                    <input
                      value={regForm.city}
                      onChange={e => setRegForm({ ...regForm, city: e.target.value })}
                      placeholder="Lahore, London"
                    />
                  </label>
                </div>
                <label>
                  Administrative Role
                  <select value={regForm.role} onChange={e => setRegForm({ ...regForm, role: e.target.value })}>
                    <option value="organisation_admin">Organisation Administrator (Full trust & multi-campus control)</option>
                    <option value="school_admin">Campus Administrator (Single school management)</option>
                    <option value="teacher">Educator / Academic Lead</option>
                  </select>
                </label>
                {error && <div className="login-error"><AlertCircle size={16} />{error}</div>}
                <button type="submit" className="login-submit" disabled={pending}>
                  {pending ? 'Creating workspace…' : 'Create workspace & sign in'} <ArrowRight size={18} />
                </button>
              </form>
              <div className="login-switch-row">
                <span>Already registered?</span>
                <button type="button" className="text-link-btn" onClick={() => { setTab('signin'); setError(''); }}>
                  Sign in to existing account →
                </button>
              </div>
            </>
          )}

          <div className="login-security"><ShieldCheck size={16} /> Your data belongs to your school community.</div>
          <a className="login-home-link" href="/"><ChevronLeft size={16} /> Back to public homepage</a>
        </div>
      </div>
    </div>
  );
}

function CampusesPage({ user, notify, onSetupSchool, onCampusesChanged }: { user: User; notify: (m: string) => void; onSetupSchool: (id: number) => void; onCampusesChanged?: () => void }) {
  const [schools, setSchools] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [addModal, setAddModal] = useState(false);
  const [editModal, setEditModal] = useState(false);
  const [editCampus, setEditCampus] = useState<Resource | null>(null);
  const [addForm, setAddForm] = useState<Record<string, string>>({ campus_type: 'Branch Campus', country: 'PK', timezone: 'Asia/Karachi', attendance_alert_threshold: '80', grade_alert_threshold: '60' });
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [expandedSchool, setExpandedSchool] = useState<number | null>(null);
  const [schoolUserMap, setSchoolUserMap] = useState<Record<number, Array<{ id: number; name: string; username: string; email?: string; role: string; date_joined?: string; admission_number?: string }>>>({});
  const [schoolClassMap, setSchoolClassMap] = useState<Record<number, Array<{ id: number; name: string }>>>({});
  const [schoolStudentMap, setSchoolStudentMap] = useState<Record<number, Array<{ id: number; name: string }>>>({});
  const [accountForm, setAccountForm] = useState<Record<number, Record<string, string>>>({});
  const [accountSaving, setAccountSaving] = useState<Record<number, boolean>>({});

  const isOrgAdmin = user.role === 'organisation_admin' || user.is_superuser;
  const isSchoolAdmin = ['organisation_admin', 'school_admin', 'principal'].includes(user.role);

  const load = async () => {
    setLoading(true);
    try {
      const s = await list<Resource>('schools');
      setSchools(s);
      onCampusesChanged?.();
    } catch {} finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const toggleAccounts = async (id: number) => {
    if (expandedSchool === id) { setExpandedSchool(null); return; }
    setExpandedSchool(id);
    if (!schoolUserMap[id]) {
      try {
        const [uRes, cRes, sRes] = await Promise.all([
          schoolUsers(id).catch(() => ({ results: [] })),
          list<{ id: number; name: string; school?: number }>(`classes/?school=${id}`).catch(() => []),
          list<{ id: number; first_name?: string; last_name?: string; full_name?: string; school?: number }>(`students/?school=${id}`).catch(() => [])
        ]);
        setSchoolUserMap(m => ({ ...m, [id]: uRes.results }));
        setSchoolClassMap(m => ({ ...m, [id]: cRes }));
        setSchoolStudentMap(m => ({ ...m, [id]: sRes.map(st => ({ id: st.id, name: st.full_name || `${st.first_name || ''} ${st.last_name || ''}` })) }));
      } catch {}
    }
  };

  const handleRegisterCampus = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await registerCampus(addForm);
      setAddModal(false);
      setAddForm({ campus_type: 'Branch Campus', country: 'PK', timezone: 'Asia/Karachi', attendance_alert_threshold: '80', grade_alert_threshold: '60' });
      notify('Campus registered successfully with initialised configuration');
      await load();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not register campus');
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (s: Resource) => {
    setEditCampus(s);
    setEditForm({
      name: String(s.name || ''),
      code: String(s.code || ''),
      city: String(s.city || ''),
      attendance_alert_threshold: String(s.attendance_alert_threshold ?? 80),
      grade_alert_threshold: String(s.grade_alert_threshold ?? 60),
    });
    setEditModal(true);
  };

  const handleSaveEditCampus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editCampus) return;
    setSaving(true);
    try {
      await update('schools', editCampus.id, {
        name: editForm.name,
        code: editForm.code,
        city: editForm.city,
        attendance_alert_threshold: Number(editForm.attendance_alert_threshold),
        grade_alert_threshold: Number(editForm.grade_alert_threshold),
      });
      setEditModal(false);
      setEditCampus(null);
      notify('Campus details updated successfully');
      await load();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not update campus');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCampus = async (sid: number, campusName: string) => {
    if (schools.length <= 1) {
      notify('You cannot delete the only campus in your organisation.');
      return;
    }
    if (!window.confirm(`Permanently delete campus "${campusName}" and all associated classes, learners and records? This cannot be undone.`)) {
      return;
    }
    try {
      await destroy('schools', sid);
      notify('Campus deleted successfully');
      await load();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not delete campus');
    }
  };

  const handleCreateAccount = async (e: React.FormEvent, schoolId: number) => {
    e.preventDefault();
    setAccountSaving(s => ({ ...s, [schoolId]: true }));
    const f = accountForm[schoolId] || {};
    try {
      const payload: Record<string, unknown> = {
        first_name: f.first_name,
        last_name: f.last_name,
        email: f.email,
        username: f.username,
        password: f.password,
        role: f.role,
        school: schoolId
      };
      if (f.admission_number) payload.admission_number = f.admission_number;
      if (f.gender) payload.gender = f.gender;
      if (f.class_id) payload.class_id = Number(f.class_id);
      if (f.student_id) payload.student_id = Number(f.student_id);

      await createAccount(payload);
      notify(`Account created for ${f.first_name} ${f.last_name} (${f.role.replace('_', ' ')}). You can now sign in using email "${f.email}" and the chosen password.`);
      setAccountForm(m => ({ ...m, [schoolId]: {} }));
      const r = await schoolUsers(schoolId);
      setSchoolUserMap(m => ({ ...m, [schoolId]: r.results }));
    } catch (ex) {
      notify(ex instanceof Error ? ex.message : 'Could not create account');
    } finally {
      setAccountSaving(s => ({ ...s, [schoolId]: false }));
    }
  };

  const setAccountField = (schoolId: number, key: string, val: string) => setAccountForm(m => ({ ...m, [schoolId]: { ...(m[schoolId] || {}), [key]: val } }));
  const setAddField = (key: string, val: string) => setAddForm(f => ({ ...f, [key]: val }));
  const setEditField = (key: string, val: string) => setEditForm(f => ({ ...f, [key]: val }));
  const COLOR2 = [getStoredTheme().colorHex, '#23b7a0', '#f29d50', '#6c9eff', '#e477a1', '#8b5cf6'];

  return (
    <>
      <div className="page-header">
        <div>
          <div className="eyebrow">WORKSPACE / CAMPUSES</div>
          <h1>Campus & institutional management</h1>
          <p>Authorised multi-campus network directory, educational setup readiness, and institutional account provisioning.</p>
        </div>
        {isOrgAdmin && (
          <button className="primary-btn" onClick={() => { setAddForm({ campus_type: 'Branch Campus', country: 'PK', timezone: 'Asia/Karachi', attendance_alert_threshold: '80', grade_alert_threshold: '60' }); setAddModal(true); }}>
            <Plus size={17} /> Register campus
          </button>
        )}
      </div>

      {loading ? (
        <div className="empty"><span><Building2 size={25} /></span><strong>Loading campuses…</strong></div>
      ) : schools.length === 0 ? (
        <div className="empty"><span><Building2 size={25} /></span><strong>Nothing to show yet</strong><p>No campuses found. Register your first campus to get started.</p></div>
      ) : (
        <div className="campus-grid">
          {schools.map((s, i) => {
            const sid = Number(s.id);
            const expanded = expandedSchool === sid;
            const users = schoolUserMap[sid] || [];
            const classes = schoolClassMap[sid] || [];
            const students = schoolStudentMap[sid] || [];
            const af = accountForm[sid] || {};
            const as2 = accountSaving[sid] || false;
            const cfg = (s.school_settings as Record<string, unknown>) || {};
            const cType = String(cfg.campus_type || 'Branch Campus');
            const cEmail = String(cfg.contact_email || '');
            const cPhone = String(cfg.contact_phone || '');
            const cTz = String(s.timezone || '');

            return (
              <div className="campus-card" key={sid}>
                <div className="campus-card-header">
                  <div className="campus-icon" style={{ background: COLOR2[i % COLOR2.length] + '1a', color: COLOR2[i % COLOR2.length] }}>
                    <Building2 size={21} />
                  </div>
                  <div className="campus-card-info">
                    <h3>{String(s.name || '—')}</h3>
                    <div className="campus-badge-row">
                      <span className="campus-code">{String(s.code || '')}</span>
                      <span className="campus-tag">{cType}</span>
                      {Boolean(s.country) && <span className="campus-tag">{String(s.country)}</span>}
                    </div>
                  </div>
                </div>

                <div className="campus-card-meta">
                  <div><span>Location</span><strong>{s.city ? `${String(s.city)}${s.jurisdiction ? `, ${String(s.jurisdiction)}` : ''}` : '—'}</strong></div>
                  <div><span>Attendance alert</span><strong>{s.attendance_alert_threshold != null ? s.attendance_alert_threshold + '%' : '80%'}</strong></div>
                  <div><span>Academic alert</span><strong>{s.grade_alert_threshold != null ? s.grade_alert_threshold + '%' : '60%'}</strong></div>
                  {Boolean(cTz) && <div><span>Timezone</span><strong>{cTz}</strong></div>}
                  {Boolean(cEmail) && <div><span>Contact email</span><strong>{cEmail}</strong></div>}
                  {Boolean(cPhone) && <div><span>Phone</span><strong>{cPhone}</strong></div>}
                </div>

                <div className="campus-card-actions">
                  {isSchoolAdmin && <button className="outline-btn" onClick={() => onSetupSchool(sid)}><Settings2 size={14} /> Configure setup</button>}
                  {isOrgAdmin && <button className="action-btn-sm edit-btn" onClick={() => openEdit(s)}><Pencil size={13} /> Edit</button>}
                  <button className={'outline-btn' + (expanded ? ' active-btn' : '')} onClick={() => toggleAccounts(sid)}><Users size={14} /> Accounts ({users.length || 'View'})</button>
                  {isOrgAdmin && schools.length > 1 && (
                    <button className="action-btn-sm delete-btn" title="Delete campus" onClick={() => handleDeleteCampus(sid, String(s.name))}>
                      <Trash2 size={13} /> Delete
                    </button>
                  )}
                </div>

                {expanded && (
                  <div className="accounts-panel">
                    <div className="accounts-panel-head"><strong>Campus user directory • {String(s.name)}</strong></div>
                    {users.length > 0 ? (
                      <div className="accounts-list">
                        {users.map(u => {
                          const rClass = u.role === 'organisation_admin' || u.role === 'school_admin' ? 'role-admin' : u.role === 'principal' ? 'role-principal' : u.role === 'teacher' ? 'role-teacher' : u.role === 'student' ? 'role-student' : 'role-parent';
                          return (
                            <div className="account-row" key={u.id}>
                              <div className="account-avatar" style={{ background: COLOR2[u.id % COLOR2.length] + '22', color: COLOR2[u.id % COLOR2.length] }}>
                                {(u.name || u.username).slice(0, 2).toUpperCase()}
                              </div>
                              <div>
                                <div className="account-meta">
                                  <b>{u.name}</b>
                                  <span className={'account-role-pill ' + rClass}>{u.role.replace('_', ' ')}</span>
                                </div>
                                <small>@{u.username}{u.email ? ` • ${u.email}` : ''}{u.admission_number ? ` • ID: ${u.admission_number}` : ''}{u.date_joined ? ` • Joined ${u.date_joined}` : ''}</small>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="accounts-empty">No institutional accounts provisioned for this campus yet.</p>
                    )}

                    {isSchoolAdmin && (
                      <>
                        <div className="accounts-divider">Provision new campus account</div>
                        <form className="account-create-form" onSubmit={e => handleCreateAccount(e, sid)}>
                          <div className="acf-row">
                            <label>First name <span className="required">*</span><input required value={af.first_name || ''} onChange={e => setAccountField(sid, 'first_name', e.target.value)} placeholder="Legal first name" /></label>
                            <label>Last name <span className="required">*</span><input required value={af.last_name || ''} onChange={e => setAccountField(sid, 'last_name', e.target.value)} placeholder="Legal last name" /></label>
                          </div>
                          <div className="acf-row">
                            <label>Email address <span className="required">*</span>
                              <input
                                required
                                type="email"
                                value={af.email || ''}
                                onChange={e => {
                                  const val = e.target.value;
                                  setAccountField(sid, 'email', val);
                                  if (!af.username || af.username === (af.email || '').split('@')[0]) {
                                    setAccountField(sid, 'username', val.split('@')[0]);
                                  }
                                }}
                                placeholder="name@institution.edu"
                              />
                            </label>
                            <label>Username <span className="required">*</span><input required value={af.username || ''} onChange={e => setAccountField(sid, 'username', e.target.value)} placeholder="Unique username" /></label>
                          </div>
                          <div className="acf-row">
                            <label>Password <span className="required">*</span><PasswordField required value={af.password || ''} onChange={e => setAccountField(sid, 'password', e.target.value)} placeholder="Min 8 characters" /></label>
                            <label>Institutional role <span className="required">*</span>
                              <select required value={af.role || ''} onChange={e => setAccountField(sid, 'role', e.target.value)}>
                                <option value="">Select role…</option>
                                {isOrgAdmin && <option value="school_admin">Campus Administrator</option>}
                                {(isOrgAdmin || user.role === 'school_admin') && <option value="principal">Campus Principal / Head</option>}
                                <option value="teacher">Educator / Teacher</option>
                                <option value="student">Student / Learner</option>
                                <option value="parent">Parent / Guardian</option>
                                {isOrgAdmin && <option value="organisation_admin">Organisation Administrator</option>}
                              </select>
                            </label>
                          </div>

                          {af.role === 'principal' && (
                            <div style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#5b21b6', marginBottom: 12 }}>
                              <strong>Campus Principal Account:</strong> Provisions the official campus principal, links staff HR records, and unlocks the dedicated Principal Portal. The principal can log in using their email and chosen password, and can change or reset it anytime.
                            </div>
                          )}

                          {af.role === 'student' && (
                            <div className="acf-row">
                              <label>Gender<select value={af.gender || ''} onChange={e => setAccountField(sid, 'gender', e.target.value)}><option value="">Not specified</option><option value="male">Boy</option><option value="female">Girl</option></select></label>
                              <label>Admission number<input value={af.admission_number || ''} onChange={e => setAccountField(sid, 'admission_number', e.target.value)} placeholder="e.g. ADM-2026-001" /></label>
                              <label>Assign to class
                                <select value={af.class_id || ''} onChange={e => setAccountField(sid, 'class_id', e.target.value)}>
                                  <option value="">Unassigned</option>
                                  {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                              </label>
                            </div>
                          )}

                          {af.role === 'parent' && (
                            <div className="acf-row">
                              <label>Link to student / ward
                                <select value={af.student_id || ''} onChange={e => setAccountField(sid, 'student_id', e.target.value)}>
                                  <option value="">Select student…</option>
                                  {students.map(st => <option key={st.id} value={st.id}>{st.name}</option>)}
                                </select>
                              </label>
                              <label>Assigned campus<input readOnly value={String(s.name)} className="readonly-input" /></label>
                            </div>
                          )}

                          {af.role === 'teacher' && (
                            <div className="acf-row">
                              <label>Lead classroom assignment
                                <select value={af.class_id || ''} onChange={e => setAccountField(sid, 'class_id', e.target.value)}>
                                  <option value="">No class assigned yet</option>
                                  {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                              </label>
                              <label>Assigned campus<input readOnly value={String(s.name)} className="readonly-input" /></label>
                            </div>
                          )}

                          <div className="acf-actions">
                            <button type="submit" className="primary-btn" disabled={as2}>{as2 ? 'Provisioning account…' : 'Provision account'} <ArrowRight size={15} /></button>
                          </div>
                        </form>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Edit Campus Modal */}
      {editModal && editCampus && (
        <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setEditModal(false); }}>
          <div className="modal-card">
            <div className="modal-head">
              <div className="modal-icon"><Pencil size={20} /></div>
              <div>
                <h3>Edit Campus: {String(editCampus.name || '')}</h3>
                <p>Update campus identity and alert thresholds.</p>
              </div>
              <button onClick={() => setEditModal(false)}><X size={20} /></button>
            </div>
            <form onSubmit={handleSaveEditCampus}>
              <div className="modal-fields">
                <label>Campus name <span className="required">*</span><input required value={editForm.name || ''} onChange={e => setEditField('name', e.target.value)} /></label>
                <label>Campus code <span className="required">*</span><input required value={editForm.code || ''} onChange={e => setEditField('code', e.target.value)} /></label>
                <label>City<input value={editForm.city || ''} onChange={e => setEditField('city', e.target.value)} /></label>
                <label>Attendance alert threshold (%)<input type="number" min="0" max="100" value={editForm.attendance_alert_threshold || '80'} onChange={e => setEditField('attendance_alert_threshold', e.target.value)} /></label>
                <label>Academic alert threshold (%)<input type="number" min="0" max="100" value={editForm.grade_alert_threshold || '60'} onChange={e => setEditField('grade_alert_threshold', e.target.value)} /></label>
              </div>
              <div className="modal-footer">
                <button type="button" className="outline-btn" onClick={() => setEditModal(false)}>Cancel</button>
                <button className="primary-btn" disabled={saving}>{saving ? 'Saving…' : 'Save changes'} <ArrowRight size={16} /></button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Register Campus Modal */}
      {addModal && (
        <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setAddModal(false); }}>
          <div className="modal-card modal-card-wide">
            <div className="modal-head">
              <div className="modal-icon"><Plus size={20} /></div>
              <div>
                <h3>Register institutional campus</h3>
                <p>Configure complete campus identity, location, time zone, and alert thresholds.</p>
              </div>
              <button onClick={() => setAddModal(false)}><X size={20} /></button>
            </div>
            <form onSubmit={handleRegisterCampus}>
              <div className="modal-fields modal-fields-2col">
                <div className="modal-section-title">1. Campus Identity</div>
                <label>Campus name <span className="required">*</span><input required value={addForm.name || ''} onChange={e => setAddField('name', e.target.value)} placeholder="e.g. Northstar Academy — City Campus" /></label>
                <label>Campus code <span className="required">*</span><input required value={addForm.code || ''} onChange={e => setAddField('code', e.target.value)} placeholder="e.g. NSA-CITY" /></label>
                <label>Campus type
                  <select value={addForm.campus_type || 'Branch Campus'} onChange={e => setAddField('campus_type', e.target.value)}>
                    <option value="Main Campus">Main Campus</option>
                    <option value="Branch Campus">Branch Campus</option>
                    <option value="Junior Campus">Junior Campus</option>
                    <option value="Senior Campus">Senior Campus</option>
                    <option value="Preparatory Campus">Preparatory Campus</option>
                  </select>
                </label>
                <label>Primary educational programme<input value={addForm.programmes || ''} onChange={e => setAddField('programmes', e.target.value)} placeholder="e.g. Cambridge IGCSE, Matriculation" /></label>

                <div className="modal-section-title">2. Location & Jurisdiction</div>
                <label>Country
                  <select value={addForm.country || 'PK'} onChange={e => setAddField('country', e.target.value)}>
                    <option value="PK">PK — Pakistan</option>
                    <option value="AE">AE — United Arab Emirates</option>
                    <option value="GB">GB — United Kingdom</option>
                    <option value="US">US — United States</option>
                    <option value="SA">SA — Saudi Arabia</option>
                    <option value="QA">QA — Qatar</option>
                    <option value="MY">MY — Malaysia</option>
                    <option value="CA">CA — Canada</option>
                  </select>
                </label>
                <label>Jurisdiction / Province<input value={addForm.jurisdiction || ''} onChange={e => setAddField('jurisdiction', e.target.value)} placeholder="e.g. Sindh, Punjab, Federal" /></label>
                <label>City<input value={addForm.city || ''} onChange={e => setAddField('city', e.target.value)} placeholder="City / Municipality" /></label>
                <label>Official time zone
                  <select value={addForm.timezone || 'Asia/Karachi'} onChange={e => setAddField('timezone', e.target.value)}>
                    <option value="Asia/Karachi">Asia/Karachi (PKT UTC+5)</option>
                    <option value="Asia/Dubai">Asia/Dubai (GST UTC+4)</option>
                    <option value="Europe/London">Europe/London (GMT/BST)</option>
                    <option value="America/New_York">America/New_York (EST/EDT)</option>
                    <option value="UTC">UTC Universal</option>
                  </select>
                </label>
                <label style={{ gridColumn: '1 / -1' }}>Campus street address<input value={addForm.address || ''} onChange={e => setAddField('address', e.target.value)} placeholder="Full physical street address" /></label>

                <div className="modal-section-title">3. Official Communications & Thresholds</div>
                <label>Official campus email<input type="email" value={addForm.contact_email || ''} onChange={e => setAddField('contact_email', e.target.value)} placeholder="admin.campus@institution.edu" /></label>
                <label>Contact phone<input value={addForm.contact_phone || ''} onChange={e => setAddField('contact_phone', e.target.value)} placeholder="+92 21 34567890" /></label>
                <label>Attendance alert threshold (%)<input type="number" min="0" max="100" value={addForm.attendance_alert_threshold || '80'} onChange={e => setAddField('attendance_alert_threshold', e.target.value)} /></label>
                <label>Academic alert threshold (%)<input type="number" min="0" max="100" value={addForm.grade_alert_threshold || '60'} onChange={e => setAddField('grade_alert_threshold', e.target.value)} /></label>
              </div>
              <div className="modal-footer">
                <button type="button" className="outline-btn" onClick={() => setAddModal(false)}>Cancel</button>
                <button className="primary-btn" disabled={saving}>{saving ? 'Registering campus…' : 'Register campus'} <ArrowRight size={16} /></button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}


function formatFieldName(name: string): string {
  if (!name) return '';
  const special: Record<string, string> = {
    end_date: 'End Date',
    start_date: 'Start Date',
    school: 'Campus',
    school_class: 'Class',
    academic_year: 'Academic Year',
    attendance_alert_threshold: 'Attendance Threshold',
    grade_alert_threshold: 'Grade Threshold',
    first_name: 'First Name',
    last_name: 'Last Name',
    admission_number: 'Admission #',
    enrolled_on: 'Enrolled On',
    role: 'User Role',
    status: 'Status',
    priority: 'Priority',
    active: 'Active Status',
  };
  if (special[name]) return special[name];
  return name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

function parseAuditChanges(raw: any): { fieldsChanged: string[]; diffs: Record<string, { from: any; to: any }>; extra: Record<string, any> } {
  if (!raw) return { fieldsChanged: [], diffs: {}, extra: {} };
  let obj = raw;
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw);
    } catch {
      return { fieldsChanged: [], diffs: {}, extra: { info: raw } };
    }
  }
  if (typeof obj !== 'object' || obj === null) {
    return { fieldsChanged: [], diffs: {}, extra: { value: String(obj) } };
  }

  const fieldsChanged: string[] = Array.isArray(obj.fields_changed) ? obj.fields_changed : [];
  const diffs: Record<string, { from: any; to: any }> = {};
  const extra: Record<string, any> = {};

  Object.entries(obj).forEach(([key, val]) => {
    if (key === 'fields_changed') return;
    if (val && typeof val === 'object' && ('from' in val || 'to' in val)) {
      diffs[key] = { from: (val as any).from, to: (val as any).to };
    } else {
      extra[key] = val;
    }
  });

  return { fieldsChanged, diffs, extra };
}

function formatChangesSummary(raw: any, action?: any): string {
  const { fieldsChanged, diffs, extra } = parseAuditChanges(raw);
  const act = String(action || '').toLowerCase();

  const diffParts: string[] = [];
  Object.entries(diffs).forEach(([k, d]) => {
    const fromStr = d.from === null || d.from === undefined ? 'none' : String(d.from);
    const toStr = d.to === null || d.to === undefined ? 'none' : String(d.to);
    diffParts.push(`${formatFieldName(k)}: ${fromStr} → ${toStr}`);
  });

  const otherFields = fieldsChanged.filter(f => !(f in diffs));
  const otherParts = otherFields.length > 0 ? [`Modified: ${otherFields.map(formatFieldName).join(', ')}`] : [];
  const extraParts = Object.entries(extra).map(([k, v]) => `${formatFieldName(k)}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`);

  const all = [...diffParts, ...otherParts, ...extraParts];
  if (all.length > 0) return all.join('; ');

  if (act.includes('create')) return 'Initial record created';
  if (act.includes('delete')) return 'Record deleted';
  if (act.includes('terminate')) return 'Staff status set to terminated';
  if (act.includes('promote')) return 'Staff promotion recorded';
  if (act.includes('import')) return 'Batch record import';
  if (act.includes('setup')) return 'Initial configuration saved';
  return 'No field modifications';
}

function AuditChangesCell({ changes, action }: { changes: any; action?: any }) {
  const [showRaw, setShowRaw] = useState(false);
  const { fieldsChanged, diffs, extra } = parseAuditChanges(changes);
  const act = String(action || '').toLowerCase();

  const diffEntries = Object.entries(diffs);
  const otherFields = fieldsChanged.filter(f => !(f in diffs));
  const extraEntries = Object.entries(extra);

  const hasContent = diffEntries.length > 0 || otherFields.length > 0 || extraEntries.length > 0;

  return (
    <div style={{ fontSize: 12, lineHeight: 1.4 }}>
      {diffEntries.map(([k, d]) => (
        <div
          key={k}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            margin: '2px 6px 2px 0',
            background: 'var(--bg-subtle, #f1f5f9)',
            padding: '3px 8px',
            borderRadius: 6,
            border: '1px solid var(--border-color, #e2e8f0)',
            fontSize: 11
          }}
        >
          <span style={{ fontWeight: 600, color: 'var(--text-primary, #334155)' }}>{formatFieldName(k)}:</span>
          <span style={{ color: '#94a3b8', textDecoration: d.from ? 'line-through' : 'none' }}>
            {d.from === null || d.from === undefined ? '—' : String(d.from)}
          </span>
          <span style={{ color: '#cbd5e1' }}>→</span>
          <span style={{ fontWeight: 600, color: 'var(--brand-primary, #715ee8)' }}>
            {d.to === null || d.to === undefined ? '—' : String(d.to)}
          </span>
        </div>
      ))}

      {otherFields.length > 0 && (
        <div style={{ marginTop: diffEntries.length > 0 ? 4 : 0, display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
          <span style={{ color: '#64748b', fontSize: 11 }}>Updated:</span>
          {otherFields.map(f => (
            <span
              key={f}
              style={{
                background: '#e0e7ff',
                color: '#3730a3',
                padding: '1px 7px',
                borderRadius: 4,
                fontSize: 11,
                fontWeight: 600
              }}
            >
              {formatFieldName(f)}
            </span>
          ))}
        </div>
      )}

      {extraEntries.map(([k, v]) => (
        <div key={k} style={{ margin: '2px 0', fontSize: 11, color: '#475569' }}>
          <span style={{ fontWeight: 600 }}>{formatFieldName(k)}: </span>
          <span>{typeof v === 'object' ? JSON.stringify(v) : String(v)}</span>
        </div>
      ))}

      {!hasContent && (
        <span style={{ color: '#94a3b8', fontStyle: 'italic', fontSize: 11 }}>
          {act.includes('create') ? 'Initial record created' :
           act.includes('delete') ? 'Record deleted' :
           act.includes('terminate') ? 'Staff terminated' :
           act.includes('promote') ? 'Staff promoted' :
           act.includes('import') ? 'Import processed' :
           act.includes('setup') ? 'Configuration saved' : 'No field modifications'}
        </span>
      )}

      {changes && typeof changes === 'object' && Object.keys(changes).length > 0 && (
        <div style={{ marginTop: 4 }}>
          <button
            type="button"
            onClick={() => setShowRaw(!showRaw)}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              fontSize: 10,
              color: 'var(--brand-primary, #715ee8)',
              cursor: 'pointer',
              textDecoration: 'underline'
            }}
          >
            {showRaw ? 'Hide JSON payload' : 'View JSON payload'}
          </button>
          {showRaw && (
            <pre style={{
              margin: '4px 0 0',
              padding: 8,
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: 6,
              fontSize: 10,
              fontFamily: 'monospace',
              overflowX: 'auto',
              whiteSpace: 'pre-wrap',
              maxHeight: 140
            }}>
              {JSON.stringify(changes, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

function AuditLogView({ notify }: { notify: (m: string) => void }) {
  const [logs, setLogs] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Record<string, any>>({});

  const loadAudit = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
    });
    const qs = params.toString() ? `?${params.toString()}` : '';
    try {
      const data = await list<Resource>(`audit/${qs}`);
      setLogs(data);
    } catch {
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    loadAudit();
  }, [loadAudit]);

  const filtered = logs;
  return (
    <>
      <div className="page-header">
        <div>
          <div className="eyebrow">SYSTEM & SECURITY / AUDIT TRAIL</div>
          <h1>Immutable audit log</h1>
          <p>Complete traceability of administrative modifications, account provisioning, transfers, and configuration activations.</p>
        </div>
      </div>
      <div className="resource-summary">
        <div className="resource-icon"><ShieldCheck size={23} /></div>
        <div><strong>{logs.length}</strong><span>Total recorded security events</span></div>
        <div className="resource-side"><CheckCircle2 size={17} /> Verified Activity Trail</div>
      </div>
      <section className="panel audit-panel">
        <FilterBar
          searchPlaceholder="Search audit events by actor, action, resource, or changes..."
          filters={[
            {
              key: 'action',
              label: 'Action',
              options: [
                { label: 'Create', value: 'create' },
                { label: 'Update', value: 'update' },
                { label: 'Transfer', value: 'transfer' },
                { label: 'Role Change', value: 'role_change' },
                { label: 'Setup', value: 'setup' },
                { label: 'Void', value: 'void' },
              ]
            }
          ]}
          values={filters}
          onChange={setFilters}
          onClear={() => setFilters({})}
          rightActions={
            <>
              <span className="result-count">{filtered.length} events</span>
              <button className="outline-btn" onClick={loadAudit}><RefreshCw size={15} /> Refresh</button>
              <ExportMenu
                title="Security Audit Trail"
                filename="security-audit-trail"
                columns={[
                  { key: 'created_at', label: 'Timestamp' },
                  { key: 'action', label: 'Action' },
                  { key: 'resource', label: 'Resource' },
                  { key: 'resource_id', label: 'Target ID' },
                  { key: 'changes', label: 'Changes Summary' },
                ]}
                rows={() => filtered.map(l => ({
                  created_at: l.created_at ? new Date(String(l.created_at)).toLocaleString() : '—',
                  action: String(l.action || '—'),
                  resource: String(l.resource || '—'),
                  resource_id: String(l.resource_id || '—'),
                  changes: formatChangesSummary(l.changes, l.action),
                }))}
                notify={notify}
              />
            </>
          }
        />
        <div className="table-scroll">
          <table className="audit-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Action</th>
                <th>Resource</th>
                <th>Target ID</th>
                <th>Changes summary</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(l => {
                const act = String(l.action || '');
                const aClass = act.includes('create') ? 'act-create' : act.includes('update') ? 'act-update' : act.includes('transfer') ? 'act-transfer' : 'act-setup';

                return (
                  <tr key={l.id}>
                    <td><Clock size={12} style={{ marginRight: 5, verticalAlign: 'middle' }} />{l.created_at ? new Date(String(l.created_at)).toLocaleString() : '—'}</td>
                    <td><span className={'action-pill ' + aClass}>{act.replace('_', ' ')}</span></td>
                    <td><strong>{String(l.resource || '—')}</strong></td>
                    <td>#{String(l.resource_id || '—')}</td>
                    <td style={{ minWidth: 260, maxWidth: 450 }}><AuditChangesCell changes={l.changes} action={l.action} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!filtered.length && <Empty text={filters.q ? 'No matching audit events found.' : 'No audit events recorded yet.'} />}
        </div>
      </section>
    </>
  );
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
