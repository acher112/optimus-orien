import React, { useState, useEffect, useMemo } from 'react';
import {
  Award, TrendingUp, TrendingDown, Users, BookOpen, Layers, CheckCircle2,
  AlertCircle, HelpCircle, Download, ChevronRight, ArrowLeft, Plus, Settings,
  X, RefreshCw, BarChart2, ShieldCheck, FileSpreadsheet, FileText, UserCheck
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid, Legend
} from 'recharts';
import { User, request } from './api';

interface AcademicQualityIndexProps {
  user: User;
  notify: (msg: string, type?: 'success' | 'error' | 'info') => void;
  activeCampusId?: number | null;
  onSelectCampus?: (id: number | null) => void;
  campuses?: { id: number; name: string }[];
}

// ---------------------------------------------------------------------------
// Type Definitions
// ---------------------------------------------------------------------------
interface CampusComparisonRow {
  campus_id: number;
  campus_name: string;
  class_weighted_average: number | null;
  student_weighted_average: number | null;
  active_classes: number;
  total_students: number;
  difference_from_school_avg: number | null;
  difference_from_school_display: string | null;
  gender_gap_pp: number | null;
}

interface SchoolWideOverviewData {
  class_weighted_average: number | null;
  student_weighted_average: number | null;
  total_campuses: number;
  total_classes: number;
  total_students: number;
  boys_average: number | null;
  boys_count: number;
  girls_average: number | null;
  girls_count: number;
  gender_gap_pp: number | null;
  campuses: CampusComparisonRow[];
}

interface ClassComparisonRow {
  class_id: number;
  class_name: string;
  sections: string;
  total_students: number;
  class_average: number | null;
  difference_from_campus_avg: number | null;
  difference_from_campus_display: string | null;
  coverage: number | null;
  gender_gap_pp: number | null;
}

interface CampusDashboardData {
  campus_id: number;
  campus_name: string;
  class_weighted_average: number | null;
  student_weighted_average: number | null;
  total_classes: number;
  eligible_classes_count: number;
  total_students: number;
  boys_average: number | null;
  boys_count: number;
  girls_average: number | null;
  girls_count: number;
  gender_gap_pp: number | null;
  classes: ClassComparisonRow[];
}

interface SubjectPerformanceRow {
  subject_id: number;
  subject_name: string;
  subject_code: string;
  average_percentage: number | null;
  average_scaled_marks: number | null;
  boys_average: number | null;
  girls_average: number | null;
  gender_gap_pp: number | null;
  eligible_students_count: number;
  total_enrolled: number;
  status: string;
}

interface StudentRosterRow {
  student_id: number;
  student_name: string;
  admission_number: string;
  gender: string;
  section_name: string;
  overall_percentage: number | null;
  status: string;
  difference_pp: number | null;
  difference_display: string | null;
}

interface ClassDashboardData {
  class_id: number;
  class_name: string;
  raw_name: string;
  section: string;
  campus_id: number;
  campus_name: string;
  academic_year: string;
  class_average: number | null;
  coverage: number | null;
  included_subjects_count: number;
  total_required_subjects: number;
  total_students: number;
  difference_from_campus_avg: number | null;
  difference_from_campus_display: string | null;
  boys_average: number | null;
  boys_count: number;
  girls_average: number | null;
  girls_count: number;
  gender_gap_pp: number | null;
  subjects: SubjectPerformanceRow[];
  students: StudentRosterRow[];
}

interface TermTraceItem {
  term?: string;
  term_name?: string;
  status?: string;
  obtained?: number | null;
  max?: number | null;
  contribution?: number | null;
  term_percentage?: number | null;
  points_earned?: number | null;
}

interface SubjectStudentRow {
  student_id: number;
  student_name: string;
  admission_number: string;
  gender: string;
  section_name: string;
  terms_trace: TermTraceItem[];
  final_percentage: number | null;
  scaled_marks: number | null;
  difference_from_subject_avg: number | null;
  difference_display: string | null;
  status: string;
  accumulated_points: number | null;
  current_performance: number | null;
}

interface SubjectDashboardData {
  class_id: number;
  class_name: string;
  subject_id: number;
  subject_name: string;
  subject_code: string;
  campus_name: string;
  reporting_scale: number;
  subject_average: number | null;
  average_scaled_marks: number | null;
  eligible_students_count: number;
  total_enrolled: number;
  boys_average: number | null;
  boys_count: number;
  girls_average: number | null;
  girls_count: number;
  gender_gap_pp: number | null;
  distribution: { bin: string; count: number }[];
  students: SubjectStudentRow[];
}

interface StudentSubjectResult {
  subject_id: number;
  subject_name: string;
  subject_code: string;
  final_percentage: number | null;
  scaled_marks: number | null;
  class_subject_average: number | null;
  difference: number | null;
  difference_display: string | null;
  status: string;
  accumulated_points: number | null;
  assessed_weight: number | null;
  remaining_weight: number | null;
  current_performance: number | null;
  terms_trace: TermTraceItem[];
}

interface StudentProfileData {
  student_id: number;
  student_name: string;
  admission_number: string;
  gender: string;
  campus_name: string;
  class_id: number;
  class_name: string;
  academic_year: string;
  overall_percentage: number | null;
  class_average: number | null;
  difference: number | null;
  difference_text: string | null;
  status: string;
  subjects: StudentSubjectResult[];
  boys_class_average: number | null;
  boys_count: number;
  boys_privacy_notice: string | null;
  girls_class_average: number | null;
  girls_count: number;
  girls_privacy_notice: string | null;
  eligible_class_students: number;
  class_privacy_notice: string | null;
  gender_gap_pp: number | null;
  all_wards?: { id: number; name: string; admission_number: string }[];
}

interface TraceData {
  title: string;
  metric: string;
  formula: string;
  steps: {
    term?: string;
    item?: string;
    description?: string;
    calculation?: string;
    points?: string;
    percentage?: string;
    status?: string;
    eligible_students?: number;
    average?: string;
  }[];
  accumulated_points?: string;
  assessed_weight?: string;
  remaining_weight?: string;
  current_performance?: string | null;
  final_result: string;
}

export default function AcademicQualityIndex({
  user,
  notify,
  activeCampusId,
  onSelectCampus,
  campuses
}: AcademicQualityIndexProps) {
  // ---------------------------------------------------------------------------
  // Navigation & Hierarchy State
  // ---------------------------------------------------------------------------
  const isOrgAdmin = user.is_superuser || user.role === 'organisation_admin';
  const isPrincipal = user.role === 'principal' || user.role === 'school_admin';
  const isTeacher = user.role === 'teacher';
  const isStudentOrParent = user.role === 'student' || user.role === 'parent';

  // Initial Level:
  // Org Admin -> 1 (School-wide)
  // Principal -> 2 (Campus)
  // Teacher -> 3 (Class) or 4 (Subject)
  // Student/Parent -> 5 (Profile)
  const initialLevel = useMemo(() => {
    if (isOrgAdmin) return 1;
    if (isPrincipal) return 2;
    if (isTeacher) return 3;
    return 5;
  }, [isOrgAdmin, isPrincipal, isTeacher]);

  const [currentLevel, setCurrentLevel] = useState<number>(initialLevel);

  // Selected hierarchy node IDs
  const [selectedSchoolId, setSelectedSchoolId] = useState<number | null>(
    user.school || (activeCampusId || null)
  );
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
  const [selectedSubjectId, setSelectedSubjectId] = useState<number | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null);

  // History path stack for smooth breadcrumbs
  const [breadcrumbs, setBreadcrumbs] = useState<{ label: string; level: number }[]>([
    { label: isOrgAdmin ? 'School-wide Overview' : 'Campus Dashboard', level: initialLevel }
  ]);

  // Loading & Data State
  const [loading, setLoading] = useState(false);
  const [level1Data, setLevel1Data] = useState<SchoolWideOverviewData | null>(null);
  const [level2Data, setLevel2Data] = useState<CampusDashboardData | null>(null);
  const [level3Data, setLevel3Data] = useState<ClassDashboardData | null>(null);
  const [level4Data, setLevel4Data] = useState<SubjectDashboardData | null>(null);
  const [level5Data, setLevel5Data] = useState<StudentProfileData | null>(null);

  // Class dashboard active tab: 'subjects' | 'students'
  const [classActiveTab, setClassActiveTab] = useState<'subjects' | 'students'>('subjects');

  // Modals & Drawers
  const [explainDrawerOpen, setExplainDrawerOpen] = useState(false);
  const [explainTrace, setExplainTrace] = useState<TraceData | null>(null);
  const [explainLoading, setExplainLoading] = useState(false);

  const [structuresModalOpen, setStructuresModalOpen] = useState(false);
  const [marksGridModalOpen, setMarksGridModalOpen] = useState(false);

  // Available campuses for global selector (Org admin only)
  const [campusList, setCampusList] = useState<{ id: number; name: string }[]>(() => {
    if (campuses && Array.isArray(campuses) && campuses.length > 0) return campuses;
    return [];
  });

  // ---------------------------------------------------------------------------
  // Load Campus List for Org Admin
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (campuses && Array.isArray(campuses) && campuses.length > 0) {
      setCampusList(campuses);
    } else if (isOrgAdmin) {
      request<any>('schools/')
        .then(res => {
          const list = Array.isArray(res) ? res : (Array.isArray(res?.results) ? res.results : []);
          setCampusList(list);
        })
        .catch(() => setCampusList([]));
    }
  }, [isOrgAdmin, campuses]);

  // ---------------------------------------------------------------------------
  // Data Fetching Dispatcher
  // ---------------------------------------------------------------------------
  const fetchData = async () => {
    setLoading(true);
    try {
      if (currentLevel === 1) {
        const data = await request<SchoolWideOverviewData>('aqi/overview/');
        setLevel1Data(data);
      } else if (currentLevel === 2) {
        const sid = selectedSchoolId || user.school;
        if (!sid) throw new Error('No campus selected.');
        const data = await request<CampusDashboardData>(`aqi/campus/${sid}/`);
        setLevel2Data(data);
      } else if (currentLevel === 3) {
        if (!selectedClassId) throw new Error('No class selected.');
        const data = await request<ClassDashboardData>(`aqi/class/${selectedClassId}/`);
        setLevel3Data(data);
      } else if (currentLevel === 4) {
        if (!selectedClassId || !selectedSubjectId) throw new Error('Class or subject not selected.');
        const data = await request<SubjectDashboardData>(
          `aqi/class/${selectedClassId}/subject/${selectedSubjectId}/`
        );
        setLevel4Data(data);
      } else if (currentLevel === 5) {
        if (isStudentOrParent) {
          const qs = selectedStudentId ? `?student_id=${selectedStudentId}` : '';
          const data = await request<StudentProfileData>(`aqi/my-profile/${qs}`);
          setLevel5Data(data);
        } else {
          if (!selectedStudentId) throw new Error('No student selected.');
          const data = await request<StudentProfileData>(`aqi/student/${selectedStudentId}/`);
          setLevel5Data(data);
        }
      }
    } catch (err: any) {
      notify(err?.detail || err?.message || 'Failed to load AQI data', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [currentLevel, selectedSchoolId, selectedClassId, selectedSubjectId, selectedStudentId]);

  // ---------------------------------------------------------------------------
  // Navigation Drill-Down Handlers
  // ---------------------------------------------------------------------------
  const drillToLevel2 = (schoolId: number, campusName: string) => {
    setSelectedSchoolId(schoolId);
    if (onSelectCampus) onSelectCampus(schoolId);
    setCurrentLevel(2);
    setBreadcrumbs([
      { label: 'School-wide Overview', level: 1 },
      { label: campusName, level: 2 }
    ]);
  };

  const drillToLevel3 = (classId: number, className: string) => {
    setSelectedClassId(classId);
    setCurrentLevel(3);
    const prevCrumbs = breadcrumbs.filter(b => b.level < 3);
    setBreadcrumbs([...prevCrumbs, { label: className, level: 3 }]);
  };

  const drillToLevel4 = (subjectId: number, subjectName: string) => {
    setSelectedSubjectId(subjectId);
    setCurrentLevel(4);
    const prevCrumbs = breadcrumbs.filter(b => b.level < 4);
    setBreadcrumbs([...prevCrumbs, { label: subjectName, level: 4 }]);
  };

  const drillToLevel5 = (studentId: number, studentName: string) => {
    setSelectedStudentId(studentId);
    setCurrentLevel(5);
    const prevCrumbs = breadcrumbs.filter(b => b.level < 5);
    setBreadcrumbs([...prevCrumbs, { label: studentName, level: 5 }]);
  };

  const navigateBreadcrumb = (level: number) => {
    if (level === currentLevel) return;
    setCurrentLevel(level);
    setBreadcrumbs(prev => prev.filter(b => b.level <= level));
  };

  // ---------------------------------------------------------------------------
  // Explain Drawer Opener
  // ---------------------------------------------------------------------------
  const openExplainDrawer = async (type: string, params: { class_id?: number; subject_id?: number; student_id?: number }) => {
    setExplainLoading(true);
    setExplainDrawerOpen(true);
    try {
      const q = new URLSearchParams({ type });
      if (params.class_id) q.set('class_id', String(params.class_id));
      if (params.subject_id) q.set('subject_id', String(params.subject_id));
      if (params.student_id) q.set('student_id', String(params.student_id));
      const trace = await request<TraceData>(`aqi/explain/?${q.toString()}`);
      setExplainTrace(trace);
    } catch (err: any) {
      notify(err?.detail || 'Failed to load arithmetic explanation', 'error');
      setExplainDrawerOpen(false);
    } finally {
      setExplainLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Export Handler
  // ---------------------------------------------------------------------------
  const triggerExport = (fmt: 'csv' | 'xlsx') => {
    const q = new URLSearchParams({ level: String(currentLevel), format: fmt });
    if (selectedSchoolId) q.set('school_id', String(selectedSchoolId));
    if (selectedClassId) q.set('class_id', String(selectedClassId));
    if (selectedSubjectId) q.set('subject_id', String(selectedSubjectId));
    if (selectedStudentId) q.set('student_id', String(selectedStudentId));

    window.open(`/api/v1/aqi/export/?${q.toString()}`, '_blank');
  };

  return (
    <div className="aqi-container" style={{ padding: '24px', maxWidth: '1440px', margin: '0 auto' }}>
      {/* --------------------------------------------------------------------- */}
      {/* Top Header & Global Campus Filter                                      */}
      {/* --------------------------------------------------------------------- */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ background: '#3b82f6', color: '#fff', borderRadius: 8, padding: 8, display: 'flex' }}>
              <Award size={22} />
            </div>
            <div>
              <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: '#0f172a' }}>
                Academic Quality Index (AQI)
              </h1>
              <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>
                Authoritative Examination & Quality Analytics Engine
              </p>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Admin Global Campus Filter */}
          {isOrgAdmin && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, color: '#475569', fontWeight: 500 }}>Campus:</span>
              <select
                value={currentLevel === 1 ? 'all' : (selectedSchoolId || '')}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === 'all') {
                    setCurrentLevel(1);
                    setSelectedSchoolId(null);
                    setBreadcrumbs([{ label: 'School-wide Overview', level: 1 }]);
                  } else {
                    const sid = parseInt(val, 10);
                    const matched = (Array.isArray(campusList) ? campusList : []).find(c => c.id === sid);
                    drillToLevel2(sid, matched?.name || `Campus ${sid}`);
                  }
                }}
                style={{
                  padding: '7px 12px',
                  borderRadius: 6,
                  border: '1px solid #cbd5e1',
                  background: '#fff',
                  fontSize: 13,
                  fontWeight: 500,
                  color: '#1e293b'
                }}
              >
                <option value="all">🌐 All Campuses (Consolidated)</option>
                {(Array.isArray(campusList) ? campusList : []).map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Exam Structure Setup Button for Leadership */}
          {(isOrgAdmin || isPrincipal) && (
            <button
              onClick={() => setStructuresModalOpen(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '7px 14px',
                borderRadius: 6,
                border: '1px solid #cbd5e1',
                background: '#fff',
                fontSize: 13,
                fontWeight: 600,
                color: '#334155',
                cursor: 'pointer'
              }}
            >
              <Settings size={15} />
              Exam Structures
            </button>
          )}

          {/* Export Dropdown */}
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => triggerExport('csv')}
              title="Download CSV"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '7px 12px',
                borderRadius: 6,
                border: '1px solid #cbd5e1',
                background: '#fff',
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer'
              }}
            >
              <FileSpreadsheet size={15} color="#16a34a" />
              CSV
            </button>
            <button
              onClick={() => triggerExport('xlsx')}
              title="Download Excel"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '7px 12px',
                borderRadius: 6,
                border: '1px solid #cbd5e1',
                background: '#fff',
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer'
              }}
            >
              <Download size={15} color="#2563eb" />
              Excel
            </button>
          </div>

          <button
            onClick={fetchData}
            title="Refresh Data"
            style={{
              padding: '7px',
              borderRadius: 6,
              border: '1px solid #cbd5e1',
              background: '#fff',
              cursor: 'pointer'
            }}
          >
            <RefreshCw size={15} />
          </button>
        </div>
      </div>

      {/* --------------------------------------------------------------------- */}
      {/* Breadcrumb Trail                                                       */}
      {/* --------------------------------------------------------------------- */}
      {!isStudentOrParent && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, fontSize: 13, color: '#64748b' }}>
          {(Array.isArray(breadcrumbs) ? breadcrumbs : []).map((crumb, idx) => (
            <React.Fragment key={crumb.level}>
              {idx > 0 && <ChevronRight size={14} color="#94a3b8" />}
              <span
                onClick={() => navigateBreadcrumb(crumb.level)}
                style={{
                  cursor: idx < breadcrumbs.length - 1 ? 'pointer' : 'default',
                  fontWeight: idx === breadcrumbs.length - 1 ? 600 : 400,
                  color: idx === breadcrumbs.length - 1 ? '#0f172a' : '#2563eb'
                }}
              >
                {crumb.label}
              </span>
            </React.Fragment>
          ))}
        </div>
      )}

      {/* Loading state indicator */}
      {loading && (
        <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
          <RefreshCw className="animate-spin" size={24} style={{ margin: '0 auto 8px' }} />
          Calculating Academic Quality Metrics...
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* LEVEL 1: School-wide Consolidated Overview                            */}
      {/* --------------------------------------------------------------------- */}
      {!loading && currentLevel === 1 && level1Data && (
        <div>
          {/* Top Metric Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 18, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Class-Weighted Avg</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#0f172a', marginTop: 4 }}>
                {level1Data.class_weighted_average !== null ? `${level1Data.class_weighted_average.toFixed(2)}%` : '—'}
              </div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>Mean across all classes directly</div>
            </div>

            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 18, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Student-Weighted Avg</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#0f172a', marginTop: 4 }}>
                {level1Data.student_weighted_average !== null ? `${level1Data.student_weighted_average.toFixed(2)}%` : '—'}
              </div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>Mean across all students directly</div>
            </div>

            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 18, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Network Scale</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#0f172a', marginTop: 4 }}>
                {level1Data.total_campuses} <span style={{ fontSize: 14, fontWeight: 500, color: '#64748b' }}>Campuses</span>
              </div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>{level1Data.total_classes} Classes • {level1Data.total_students} Students</div>
            </div>

            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 18, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Gender Performance</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
                <div>
                  <span style={{ fontSize: 11, color: '#2563eb', fontWeight: 600 }}>BOYS: </span>
                  <span style={{ fontSize: 16, fontWeight: 700 }}>{level1Data.boys_average !== null ? `${level1Data.boys_average.toFixed(1)}%` : '—'}</span>
                </div>
                <div>
                  <span style={{ fontSize: 11, color: '#ec4899', fontWeight: 600 }}>GIRLS: </span>
                  <span style={{ fontSize: 16, fontWeight: 700 }}>{level1Data.girls_average !== null ? `${level1Data.girls_average.toFixed(1)}%` : '—'}</span>
                </div>
              </div>
              <div style={{ fontSize: 12, marginTop: 4 }}>
                Gender Gap: <span style={{ fontWeight: 600, color: level1Data.gender_gap_pp && level1Data.gender_gap_pp >= 0 ? '#16a34a' : '#dc2626' }}>
                  {level1Data.gender_gap_pp !== null ? `${level1Data.gender_gap_pp > 0 ? '+' : ''}${level1Data.gender_gap_pp.toFixed(2)} pp` : '—'}
                </span>
              </div>
            </div>
          </div>

          {/* Campus Comparison Table */}
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0f172a' }}>Campus Performance Comparison</h3>
              <span style={{ fontSize: 12, color: '#64748b' }}>Sorted descending by Class-Weighted Average</span>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', fontWeight: 600 }}>
                  <th style={{ padding: '12px 16px' }}>Campus Name</th>
                  <th style={{ padding: '12px 16px' }}>Class-Weighted Avg %</th>
                  <th style={{ padding: '12px 16px' }}>Student-Weighted Avg %</th>
                  <th style={{ padding: '12px 16px' }}>Diff from School Avg</th>
                  <th style={{ padding: '12px 16px' }}>Active Classes</th>
                  <th style={{ padding: '12px 16px' }}>Students</th>
                  <th style={{ padding: '12px 16px' }}>Gender Gap (pp)</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {(Array.isArray(level1Data?.campuses) ? level1Data.campuses : []).map(c => (
                  <tr
                    key={c.campus_id}
                    onClick={() => drillToLevel2(c.campus_id, c.campus_name)}
                    style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer', transition: 'background 0.15s' }}
                    className="hover:bg-slate-50"
                  >
                    <td style={{ padding: '14px 16px', fontWeight: 600, color: '#2563eb' }}>{c.campus_name}</td>
                    <td style={{ padding: '14px 16px', fontWeight: 700 }}>
                      {c.class_weighted_average !== null ? `${c.class_weighted_average.toFixed(2)}%` : '—'}
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      {c.student_weighted_average !== null ? `${c.student_weighted_average.toFixed(2)}%` : '—'}
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      {c.difference_from_school_display ? (
                        <span style={{
                          padding: '3px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                          background: (c.difference_from_school_avg || 0) >= 0 ? '#dcfce7' : '#fee2e2',
                          color: (c.difference_from_school_avg || 0) >= 0 ? '#15803d' : '#b91c1c'
                        }}>
                          {c.difference_from_school_display}
                        </span>
                      ) : '—'}
                    </td>
                    <td style={{ padding: '14px 16px' }}>{c.active_classes}</td>
                    <td style={{ padding: '14px 16px' }}>{c.total_students}</td>
                    <td style={{ padding: '14px 16px' }}>
                      {c.gender_gap_pp !== null ? `${c.gender_gap_pp > 0 ? '+' : ''}${c.gender_gap_pp.toFixed(2)} pp` : '—'}
                    </td>
                    <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                      <span style={{ color: '#2563eb', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        View <ChevronRight size={14} />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* LEVEL 2: Campus Dashboard                                              */}
      {/* --------------------------------------------------------------------- */}
      {!loading && currentLevel === 2 && level2Data && (
        <div>
          {/* Campus Header & Key Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 18 }}>
              <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Campus Class-Weighted Avg</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#0f172a', marginTop: 4 }}>
                {level2Data.class_weighted_average !== null ? `${level2Data.class_weighted_average.toFixed(2)}%` : '—'}
              </div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>Mean of eligible class averages</div>
            </div>

            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 18 }}>
              <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Campus Student-Weighted Avg</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#0f172a', marginTop: 4 }}>
                {level2Data.student_weighted_average !== null ? `${level2Data.student_weighted_average.toFixed(2)}%` : '—'}
              </div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>Mean of student overalls</div>
            </div>

            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 18 }}>
              <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Campus Reach</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#0f172a', marginTop: 4 }}>
                {level2Data.total_classes} <span style={{ fontSize: 14, fontWeight: 500, color: '#64748b' }}>Classes</span>
              </div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>{level2Data.total_students} Enrolled Students</div>
            </div>

            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 18 }}>
              <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Gender Performance</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
                <div>
                  <span style={{ fontSize: 11, color: '#2563eb', fontWeight: 600 }}>BOYS: </span>
                  <span style={{ fontSize: 16, fontWeight: 700 }}>{level2Data.boys_average !== null ? `${level2Data.boys_average.toFixed(1)}%` : '—'}</span>
                </div>
                <div>
                  <span style={{ fontSize: 11, color: '#ec4899', fontWeight: 600 }}>GIRLS: </span>
                  <span style={{ fontSize: 16, fontWeight: 700 }}>{level2Data.girls_average !== null ? `${level2Data.girls_average.toFixed(1)}%` : '—'}</span>
                </div>
              </div>
              <div style={{ fontSize: 12, marginTop: 4 }}>
                Gender Gap: <span style={{ fontWeight: 600, color: level2Data.gender_gap_pp && level2Data.gender_gap_pp >= 0 ? '#16a34a' : '#dc2626' }}>
                  {level2Data.gender_gap_pp !== null ? `${level2Data.gender_gap_pp > 0 ? '+' : ''}${level2Data.gender_gap_pp.toFixed(2)} pp` : '—'}
                </span>
              </div>
            </div>
          </div>

          {/* Classes Table */}
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0f172a' }}>Classes Inside Campus</h3>
              <span style={{ fontSize: 12, color: '#64748b' }}>Sorted descending by Class Average</span>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', fontWeight: 600 }}>
                  <th style={{ padding: '12px 16px' }}>Class Name</th>
                  <th style={{ padding: '12px 16px' }}>Sections</th>
                  <th style={{ padding: '12px 16px' }}>Students</th>
                  <th style={{ padding: '12px 16px' }}>Class Average %</th>
                  <th style={{ padding: '12px 16px' }}>Diff from Campus Avg</th>
                  <th style={{ padding: '12px 16px' }}>Coverage %</th>
                  <th style={{ padding: '12px 16px' }}>Gender Gap (pp)</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {(Array.isArray(level2Data?.classes) ? level2Data.classes : []).map(cls => (
                  <tr
                    key={cls.class_id}
                    onClick={() => drillToLevel3(cls.class_id, cls.class_name)}
                    style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer', transition: 'background 0.15s' }}
                    className="hover:bg-slate-50"
                  >
                    <td style={{ padding: '14px 16px', fontWeight: 600, color: '#2563eb' }}>{cls.class_name}</td>
                    <td style={{ padding: '14px 16px', color: '#64748b' }}>{cls.sections}</td>
                    <td style={{ padding: '14px 16px' }}>{cls.total_students}</td>
                    <td style={{ padding: '14px 16px', fontWeight: 700 }}>
                      {cls.class_average !== null ? `${cls.class_average.toFixed(2)}%` : '—'}
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      {cls.difference_from_campus_display ? (
                        <span style={{
                          padding: '3px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                          background: (cls.difference_from_campus_avg || 0) >= 0 ? '#dcfce7' : '#fee2e2',
                          color: (cls.difference_from_campus_avg || 0) >= 0 ? '#15803d' : '#b91c1c'
                        }}>
                          {cls.difference_from_campus_display}
                        </span>
                      ) : '—'}
                    </td>
                    <td style={{ padding: '14px 16px' }}>{cls.coverage !== null ? `${cls.coverage.toFixed(0)}%` : '—'}</td>
                    <td style={{ padding: '14px 16px' }}>
                      {cls.gender_gap_pp !== null ? `${cls.gender_gap_pp > 0 ? '+' : ''}${cls.gender_gap_pp.toFixed(2)} pp` : '—'}
                    </td>
                    <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                      <span style={{ color: '#2563eb', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        View Class <ChevronRight size={14} />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* LEVEL 3: Class Dashboard                                               */}
      {/* --------------------------------------------------------------------- */}
      {!loading && currentLevel === 3 && level3Data && (
        <div>
          {/* Metric Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 18 }}>
              <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Class Average</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#0f172a', marginTop: 4 }}>
                {level3Data.class_average !== null ? `${level3Data.class_average.toFixed(2)}%` : '—'}
              </div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                Mean of {level3Data.included_subjects_count} included subjects
              </div>
            </div>

            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 18 }}>
              <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Subject Coverage</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#0f172a', marginTop: 4 }}>
                {level3Data.coverage !== null ? `${level3Data.coverage.toFixed(0)}%` : '—'}
              </div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                {level3Data.included_subjects_count} of {level3Data.total_required_subjects} required subjects assessed
              </div>
            </div>

            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 18 }}>
              <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Enrolled Students</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#0f172a', marginTop: 4 }}>
                {level3Data.total_students}
              </div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                {level3Data.boys_count} Boys • {level3Data.girls_count} Girls
              </div>
            </div>

            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 18 }}>
              <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Gender Gap</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: level3Data.gender_gap_pp && level3Data.gender_gap_pp >= 0 ? '#16a34a' : '#dc2626', marginTop: 4 }}>
                {level3Data.gender_gap_pp !== null ? `${level3Data.gender_gap_pp > 0 ? '+' : ''}${level3Data.gender_gap_pp.toFixed(2)} pp` : '—'}
              </div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                Boys: {level3Data.boys_average ? `${level3Data.boys_average.toFixed(1)}%` : '—'} • Girls: {level3Data.girls_average ? `${level3Data.girls_average.toFixed(1)}%` : '—'}
              </div>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div style={{ display: 'flex', gap: 12, borderBottom: '1px solid #e2e8f0', marginBottom: 16 }}>
            <button
              onClick={() => setClassActiveTab('subjects')}
              style={{
                padding: '10px 16px',
                border: 'none',
                background: 'none',
                fontSize: 14,
                fontWeight: 600,
                color: classActiveTab === 'subjects' ? '#2563eb' : '#64748b',
                borderBottom: classActiveTab === 'subjects' ? '2px solid #2563eb' : '2px solid transparent',
                cursor: 'pointer'
              }}
            >
              Subject Performance ({level3Data.subjects.length})
            </button>
            {level3Data.students.length > 0 && (
              <button
                onClick={() => setClassActiveTab('students')}
                style={{
                  padding: '10px 16px',
                  border: 'none',
                  background: 'none',
                  fontSize: 14,
                  fontWeight: 600,
                  color: classActiveTab === 'students' ? '#2563eb' : '#64748b',
                  borderBottom: classActiveTab === 'students' ? '2px solid #2563eb' : '2px solid transparent',
                  cursor: 'pointer'
                }}
              >
                Student Roster ({level3Data.students.length})
              </button>
            )}
          </div>

          {/* Subjects Table */}
          {classActiveTab === 'subjects' && (
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', fontWeight: 600 }}>
                    <th style={{ padding: '12px 16px' }}>Subject</th>
                    <th style={{ padding: '12px 16px' }}>Average %</th>
                    <th style={{ padding: '12px 16px' }}>Scaled Marks</th>
                    <th style={{ padding: '12px 16px' }}>Boys Avg %</th>
                    <th style={{ padding: '12px 16px' }}>Girls Avg %</th>
                    <th style={{ padding: '12px 16px' }}>Gender Gap (pp)</th>
                    <th style={{ padding: '12px 16px' }}>Assessed</th>
                    <th style={{ padding: '12px 16px' }}>Status</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {(Array.isArray(level3Data?.subjects) ? level3Data.subjects : []).map(s => (
                    <tr
                      key={s.subject_id}
                      onClick={() => drillToLevel4(s.subject_id, s.subject_name)}
                      style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }}
                      className="hover:bg-slate-50"
                    >
                      <td style={{ padding: '14px 16px', fontWeight: 600, color: '#2563eb' }}>{s.subject_name}</td>
                      <td style={{ padding: '14px 16px', fontWeight: 700 }}>
                        {s.average_percentage !== null ? `${s.average_percentage.toFixed(2)}%` : '—'}
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        {s.average_scaled_marks !== null ? s.average_scaled_marks.toFixed(1) : '—'}
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        {s.boys_average !== null ? `${s.boys_average.toFixed(1)}%` : '—'}
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        {s.girls_average !== null ? `${s.girls_average.toFixed(1)}%` : '—'}
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        {s.gender_gap_pp !== null ? `${s.gender_gap_pp > 0 ? '+' : ''}${s.gender_gap_pp.toFixed(2)} pp` : '—'}
                      </td>
                      <td style={{ padding: '14px 16px' }}>{s.eligible_students_count} / {s.total_enrolled}</td>
                      <td style={{ padding: '14px 16px' }}>
                        <span style={{
                          padding: '3px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                          background: s.status === 'complete' ? '#dcfce7' : '#fef3c7',
                          color: s.status === 'complete' ? '#15803d' : '#b45309'
                        }}>
                          {s.status.toUpperCase()}
                        </span>
                      </td>
                      <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                        <span style={{ color: '#2563eb', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          Inspect <ChevronRight size={14} />
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Students Roster Table */}
          {classActiveTab === 'students' && (
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', fontWeight: 600 }}>
                    <th style={{ padding: '12px 16px' }}>Student Name</th>
                    <th style={{ padding: '12px 16px' }}>Admission #</th>
                    <th style={{ padding: '12px 16px' }}>Gender</th>
                    <th style={{ padding: '12px 16px' }}>Section</th>
                    <th style={{ padding: '12px 16px' }}>Overall %</th>
                    <th style={{ padding: '12px 16px' }}>Diff from Class Avg</th>
                    <th style={{ padding: '12px 16px' }}>Status</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {(Array.isArray(level3Data?.students) ? level3Data.students : []).map(st => (
                    <tr
                      key={st.student_id}
                      onClick={() => drillToLevel5(st.student_id, st.student_name)}
                      style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }}
                      className="hover:bg-slate-50"
                    >
                      <td style={{ padding: '14px 16px', fontWeight: 600, color: '#2563eb' }}>{st.student_name}</td>
                      <td style={{ padding: '14px 16px', color: '#64748b' }}>{st.admission_number}</td>
                      <td style={{ padding: '14px 16px', textTransform: 'capitalize' }}>{st.gender}</td>
                      <td style={{ padding: '14px 16px' }}>{st.section_name || '—'}</td>
                      <td style={{ padding: '14px 16px', fontWeight: 700 }}>
                        {st.overall_percentage !== null ? `${st.overall_percentage.toFixed(2)}%` : '—'}
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        {st.difference_display ? (
                          <span style={{
                            padding: '3px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                            background: (st.difference_pp || 0) >= 0 ? '#dcfce7' : '#fee2e2',
                            color: (st.difference_pp || 0) >= 0 ? '#15803d' : '#b91c1c'
                          }}>
                            {st.difference_display}
                          </span>
                        ) : '—'}
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <span style={{
                          padding: '3px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                          background: st.status === 'complete' ? '#dcfce7' : '#fef3c7',
                          color: st.status === 'complete' ? '#15803d' : '#b45309'
                        }}>
                          {st.status.toUpperCase()}
                        </span>
                      </td>
                      <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                        <span style={{ color: '#2563eb', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          Profile <ChevronRight size={14} />
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* LEVEL 4: Subject Dashboard                                             */}
      {/* --------------------------------------------------------------------- */}
      {!loading && currentLevel === 4 && level4Data && (
        <div>
          {/* Header Action: Quick Marks Entry */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: '#0f172a' }}>
                {level4Data.subject_name} — {level4Data.class_name}
              </h2>
              <span style={{ fontSize: 13, color: '#64748b' }}>Reporting Scale: {level4Data.reporting_scale} marks</span>
            </div>
            <button
              onClick={() => setMarksGridModalOpen(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '9px 16px',
                borderRadius: 6,
                background: '#2563eb',
                color: '#fff',
                fontSize: 13,
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer'
              }}
            >
              <UserCheck size={16} />
              Quick Marks Entry
            </button>
          </div>

          {/* Metric Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 18 }}>
              <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Subject Average</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#0f172a', marginTop: 4 }}>
                {level4Data.subject_average !== null ? `${level4Data.subject_average.toFixed(2)}%` : '—'}
              </div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                Scaled: {level4Data.average_scaled_marks !== null ? `${level4Data.average_scaled_marks.toFixed(1)} / ${level4Data.reporting_scale}` : '—'}
              </div>
            </div>

            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 18 }}>
              <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Students Assessed</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#0f172a', marginTop: 4 }}>
                {level4Data.eligible_students_count} / {level4Data.total_enrolled}
              </div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                {((level4Data.eligible_students_count / Math.max(1, level4Data.total_enrolled)) * 100).toFixed(0)}% Completion rate
              </div>
            </div>

            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 18 }}>
              <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Boys Average</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#2563eb', marginTop: 4 }}>
                {level4Data.boys_average !== null ? `${level4Data.boys_average.toFixed(1)}%` : '—'}
              </div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>{level4Data.boys_count} Boys assessed</div>
            </div>

            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 18 }}>
              <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Girls Average</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#ec4899', marginTop: 4 }}>
                {level4Data.girls_average !== null ? `${level4Data.girls_average.toFixed(1)}%` : '—'}
              </div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                Gap: {level4Data.gender_gap_pp !== null ? `${level4Data.gender_gap_pp > 0 ? '+' : ''}${level4Data.gender_gap_pp.toFixed(2)} pp` : '—'}
              </div>
            </div>
          </div>

          {/* Score Distribution Chart */}
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 20, marginBottom: 24 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 16px', color: '#0f172a' }}>Score Distribution</h3>
            <div style={{ height: 220, width: '100%' }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={level4Data.distribution}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="bin" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={{ stroke: '#cbd5e1' }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#64748b' }} axisLine={{ stroke: '#cbd5e1' }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Student Marks Table */}
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0' }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0f172a' }}>Student Results in {level4Data.subject_name}</h3>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', fontWeight: 600 }}>
                  <th style={{ padding: '12px 16px' }}>Student Name</th>
                  <th style={{ padding: '12px 16px' }}>Admission #</th>
                  <th style={{ padding: '12px 16px' }}>Gender</th>
                  <th style={{ padding: '12px 16px' }}>Final %</th>
                  <th style={{ padding: '12px 16px' }}>Scaled Marks</th>
                  <th style={{ padding: '12px 16px' }}>Diff from Subj Avg</th>
                  <th style={{ padding: '12px 16px' }}>Status</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {(Array.isArray(level4Data?.students) ? level4Data.students : []).map(st => (
                  <tr key={st.student_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td
                      onClick={() => drillToLevel5(st.student_id, st.student_name)}
                      style={{ padding: '14px 16px', fontWeight: 600, color: '#2563eb', cursor: 'pointer' }}
                    >
                      {st.student_name}
                    </td>
                    <td style={{ padding: '14px 16px', color: '#64748b' }}>{st.admission_number}</td>
                    <td style={{ padding: '14px 16px', textTransform: 'capitalize' }}>{st.gender}</td>
                    <td style={{ padding: '14px 16px', fontWeight: 700 }}>
                      {st.final_percentage !== null ? `${st.final_percentage.toFixed(2)}%` : '—'}
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      {st.scaled_marks !== null ? st.scaled_marks.toFixed(1) : '—'}
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      {st.difference_display ? (
                        <span style={{
                          padding: '3px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                          background: (st.difference_from_subject_avg || 0) >= 0 ? '#dcfce7' : '#fee2e2',
                          color: (st.difference_from_subject_avg || 0) >= 0 ? '#15803d' : '#b91c1c'
                        }}>
                          {st.difference_display}
                        </span>
                      ) : '—'}
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <span style={{
                        padding: '3px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                        background: st.status === 'complete' ? '#dcfce7' : '#fef3c7',
                        color: st.status === 'complete' ? '#15803d' : '#b45309'
                      }}>
                        {st.status.toUpperCase()}
                      </span>
                    </td>
                    <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                      <button
                        onClick={() => openExplainDrawer('student_subject', { student_id: st.student_id, subject_id: level4Data.subject_id })}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          padding: '5px 10px',
                          borderRadius: 4,
                          border: '1px solid #cbd5e1',
                          background: '#fff',
                          fontSize: 12,
                          fontWeight: 500,
                          cursor: 'pointer'
                        }}
                      >
                        <HelpCircle size={13} color="#2563eb" />
                        Explain
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* LEVEL 5: Student Academic Profile                                      */}
      {/* --------------------------------------------------------------------- */}
      {!loading && currentLevel === 5 && level5Data && (
        <div>
          {/* Parent Wards Tabs (if parent has multiple children) */}
          {level5Data.all_wards && level5Data.all_wards.length > 1 && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
              {(Array.isArray(level5Data?.all_wards) ? level5Data.all_wards : []).map(ward => (
                <button
                  key={ward.id}
                  onClick={() => setSelectedStudentId(ward.id)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 6,
                    border: '1px solid #cbd5e1',
                    background: ward.id === level5Data.student_id ? '#2563eb' : '#fff',
                    color: ward.id === level5Data.student_id ? '#fff' : '#334155',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  {ward.name} ({ward.admission_number})
                </button>
              ))}
            </div>
          )}

          {/* Student Header Card */}
          <div style={{
            background: 'linear-gradient(135deg, #1e293b, #0f172a)',
            color: '#fff',
            borderRadius: 10,
            padding: '24px 28px',
            marginBottom: 24,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 16
          }}>
            <div>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1 }}>
                Academic Quality Profile
              </div>
              <h2 style={{ fontSize: 24, fontWeight: 700, margin: '4px 0', color: '#fff' }}>
                {level5Data.student_name}
              </h2>
              <div style={{ fontSize: 13, color: '#cbd5e1' }}>
                Admission #: <b style={{ color: '#fff' }}>{level5Data.admission_number}</b> • Class: <b style={{ color: '#fff' }}>{level5Data.class_name}</b> • Campus: <b style={{ color: '#fff' }}>{level5Data.campus_name}</b>
              </div>
            </div>

            {level5Data.overall_percentage !== null && (
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>Overall Average</div>
                <div style={{ fontSize: 36, fontWeight: 800, color: '#38bdf8' }}>
                  {level5Data.overall_percentage.toFixed(2)}%
                </div>
                {level5Data.difference_text && (
                  <div style={{ fontSize: 12, color: '#a7f3d0' }}>
                    {level5Data.difference_text}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Visual Benchmark Comparison Chart */}
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 20, marginBottom: 24 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 16px', color: '#0f172a' }}>
              Performance Relative to Class Benchmarks
            </h3>
            <div style={{ height: 260, width: '100%' }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={[
                    ...(level5Data.overall_percentage !== null ? [{
                      name: "Student's Result",
                      percentage: level5Data.overall_percentage,
                      fill: '#64748b' // Student's own result = Gray (#64748b)
                    }] : []),
                    ...(level5Data.class_average !== null ? [{
                      name: "Class Average",
                      percentage: level5Data.class_average,
                      fill: '#0284c7'
                    }] : []),
                    ...(level5Data.boys_class_average !== null ? [{
                      name: "Boys Average",
                      percentage: level5Data.boys_class_average,
                      fill: '#2563eb' // Boys = Blue (#2563eb)
                    }] : []),
                    ...(level5Data.girls_class_average !== null ? [{
                      name: "Girls Average",
                      percentage: level5Data.girls_class_average,
                      fill: '#ec4899' // Girls = Pink (#ec4899)
                    }] : []),
                  ]}
                  margin={{ top: 10, right: 30, left: 0, bottom: 20 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#475569' }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: '#64748b' }} unit="%" />
                  <Tooltip formatter={(value: any) => [`${Number(value).toFixed(2)}%`, 'Performance']} />
                  <Bar dataKey="percentage" radius={[4, 4, 0, 0]}>
                    {/* Dynamic fill by cell */}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Privacy Notices for small groups */}
            {(level5Data.boys_privacy_notice || level5Data.girls_privacy_notice || level5Data.class_privacy_notice) && (
              <div style={{ fontSize: 12, color: '#64748b', fontStyle: 'italic', marginTop: 8 }}>
                * Note: Some group averages are masked ("Not enough students to show") to protect student privacy when group size is under 5.
              </div>
            )}
          </div>

          {/* Subject Breakdown Table */}
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0' }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0f172a' }}>Subject-wise Examination Performance</h3>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', fontWeight: 600 }}>
                  <th style={{ padding: '12px 16px' }}>Subject</th>
                  <th style={{ padding: '12px 16px' }}>Final Subject %</th>
                  <th style={{ padding: '12px 16px' }}>Scaled Marks</th>
                  <th style={{ padding: '12px 16px' }}>Class Benchmark %</th>
                  <th style={{ padding: '12px 16px' }}>Relative to Class</th>
                  <th style={{ padding: '12px 16px' }}>Current Ongoing %</th>
                  <th style={{ padding: '12px 16px' }}>Status</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {(Array.isArray(level5Data?.subjects) ? level5Data.subjects : []).map(s => (
                  <tr key={s.subject_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '14px 16px', fontWeight: 600, color: '#0f172a' }}>{s.subject_name}</td>
                    <td style={{ padding: '14px 16px', fontWeight: 700, color: '#2563eb' }}>
                      {s.final_percentage !== null ? `${s.final_percentage.toFixed(2)}%` : '—'}
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      {s.scaled_marks !== null ? s.scaled_marks.toFixed(1) : '—'}
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      {s.class_subject_average !== null ? `${s.class_subject_average.toFixed(2)}%` : '—'}
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      {s.difference_display ? (
                        <span style={{
                          padding: '3px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                          background: (s.difference || 0) >= 0 ? '#dcfce7' : '#fee2e2',
                          color: (s.difference || 0) >= 0 ? '#15803d' : '#b91c1c'
                        }}>
                          {s.difference_display}
                        </span>
                      ) : '—'}
                    </td>
                    <td style={{ padding: '14px 16px', color: '#64748b' }}>
                      {s.current_performance !== null ? `${s.current_performance.toFixed(1)}%` : '—'}
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <span style={{
                        padding: '3px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                        background: s.status === 'complete' ? '#dcfce7' : '#fef3c7',
                        color: s.status === 'complete' ? '#15803d' : '#b45309'
                      }}>
                        {s.status.toUpperCase()}
                      </span>
                    </td>
                    <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                      <button
                        onClick={() => openExplainDrawer('student_subject', { student_id: level5Data.student_id, subject_id: s.subject_id })}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          padding: '5px 10px',
                          borderRadius: 4,
                          border: '1px solid #cbd5e1',
                          background: '#fff',
                          fontSize: 12,
                          fontWeight: 500,
                          cursor: 'pointer'
                        }}
                      >
                        <HelpCircle size={13} color="#2563eb" />
                        Explain
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* EXPLAIN THIS NUMBER DRAWER                                             */}
      {/* --------------------------------------------------------------------- */}
      {explainDrawerOpen && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.4)', zIndex: 1000,
          display: 'flex', justifyContent: 'flex-end'
        }}>
          <div style={{
            background: '#fff', width: '100%', maxWidth: 520, height: '100%',
            boxShadow: '-4px 0 20px rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column'
          }}>
            {/* Header */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#0f172a' }}>Explain This Number</h3>
                <span style={{ fontSize: 12, color: '#64748b' }}>Transparent Mathematical Audit Trace</span>
              </div>
              <button
                onClick={() => setExplainDrawerOpen(false)}
                style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 4 }}
              >
                <X size={20} color="#64748b" />
              </button>
            </div>

            {/* Content */}
            <div style={{ padding: 24, overflowY: 'auto', flex: 1 }}>
              {explainLoading && (
                <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>
                  <RefreshCw className="animate-spin" size={24} style={{ margin: '0 auto 8px' }} />
                  Compiling arithmetic steps...
                </div>
              )}

              {!explainLoading && explainTrace && (
                <div>
                  <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16, marginBottom: 20 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Metric</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', margin: '4px 0' }}>{explainTrace.title}</div>
                    <div style={{ fontSize: 12, color: '#2563eb', fontWeight: 600, marginTop: 6, padding: '4px 8px', background: '#eff6ff', borderRadius: 4 }}>
                      Formula: {explainTrace.formula}
                    </div>
                  </div>

                  <h4 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 12px', color: '#0f172a' }}>Calculation Steps</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
                    {(Array.isArray(explainTrace?.steps) ? explainTrace.steps : []).map((st, idx) => (
                      <div key={idx} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, padding: 14 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: 600, fontSize: 13, color: '#0f172a' }}>{st.term || st.item}</span>
                          <span style={{ fontWeight: 700, fontSize: 13, color: '#2563eb' }}>{st.points || st.percentage || st.average}</span>
                        </div>
                        {st.description && <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>{st.description}</div>}
                        {st.calculation && <div style={{ fontSize: 12, color: '#475569', fontFamily: 'monospace', marginTop: 2 }}>{st.calculation}</div>}
                      </div>
                    ))}
                  </div>

                  {/* Summary Block */}
                  <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontSize: 13, color: '#166534', fontWeight: 600 }}>Final Result:</span>
                      <span style={{ fontSize: 20, fontWeight: 800, color: '#15803d' }}>{explainTrace.final_result}</span>
                    </div>
                    {explainTrace.accumulated_points && (
                      <div style={{ fontSize: 12, color: '#15803d' }}>
                        Accumulated Points: {explainTrace.accumulated_points} • Assessed Weight: {explainTrace.assessed_weight}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{ padding: '16px 24px', borderTop: '1px solid #e2e8f0', textAlign: 'right' }}>
              <button
                onClick={() => setExplainDrawerOpen(false)}
                style={{
                  padding: '8px 16px', borderRadius: 6, border: '1px solid #cbd5e1',
                  background: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer'
                }}
              >
                Close Drawer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* EXAM STRUCTURE SETUP MODAL                                             */}
      {/* --------------------------------------------------------------------- */}
      {structuresModalOpen && (
        <ExamStructureModal
          user={user}
          campusId={selectedSchoolId || user.school}
          notify={notify}
          onClose={() => {
            setStructuresModalOpen(false);
            fetchData();
          }}
        />
      )}

      {/* --------------------------------------------------------------------- */}
      {/* QUICK MARKS ENTRY MODAL                                                */}
      {/* --------------------------------------------------------------------- */}
      {marksGridModalOpen && level4Data && (
        <MarksGridModal
          classId={level4Data.class_id}
          className={level4Data.class_name}
          subjectId={level4Data.subject_id}
          subjectName={level4Data.subject_name}
          notify={notify}
          onClose={() => {
            setMarksGridModalOpen(false);
            fetchData();
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-Component: Exam Structure Setup Modal
// ---------------------------------------------------------------------------
interface ExamStructureModalProps {
  user: User;
  campusId: number | null;
  notify: (msg: string, type?: 'success' | 'error' | 'info') => void;
  onClose: () => void;
}

function ExamStructureModal({ user, campusId, notify, onClose }: ExamStructureModalProps) {
  const [structures, setStructures] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // New Structure Form State
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newScale, setNewScale] = useState('100');
  const [newPass, setNewPass] = useState('40');
  const [terms, setTerms] = useState<{ name: string; order: number; contribution: string }[]>([
    { name: 'Midterm', order: 1, contribution: '40' },
    { name: 'Final Exam', order: 2, contribution: '60' }
  ]);

  const loadStructures = async () => {
    setLoading(true);
    try {
      const res = await request<any[]>(`aqi/structures/?campus=${campusId || ''}`);
      setStructures(res || []);
    } catch {
      notify('Failed to load exam structures', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStructures();
  }, [campusId]);

  const totalContribution = useMemo(() => {
    return terms.reduce((acc, t) => acc + (parseFloat(t.contribution) || 0), 0);
  }, [terms]);

  const handleCreate = async () => {
    if (!newName.trim()) {
      notify('Please enter a structure name', 'error');
      return;
    }
    if (Math.abs(totalContribution - 100) > 0.01) {
      notify(`Term contributions must sum exactly to 100% (Current: ${totalContribution}%)`, 'error');
      return;
    }

    try {
      await request('aqi/structures/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          school_id: campusId || user.school,
          name: newName,
          reporting_scale: newScale,
          pass_percentage: newPass,
          terms: (Array.isArray(terms) ? terms : []).map(t => ({
            name: t.name,
            order: t.order,
            contribution: t.contribution
          }))
        })
      });
      notify('Exam structure created successfully', 'success');
      setCreating(false);
      setNewName('');
      loadStructures();
    } catch (err: any) {
      notify(err?.detail || 'Failed to create exam structure', 'error');
    }
  };

  const handlePublish = async (id: number) => {
    try {
      const res = await request<{ message: string }>(`aqi/structures/${id}/publish/`, {
        method: 'POST'
      });
      notify(res?.message || 'Exam structure published!', 'success');
      loadStructures();
    } catch (err: any) {
      notify(err?.detail || err?.message || 'Failed to publish exam structure', 'error');
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.5)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: '#fff', borderRadius: 10, width: '100%', maxWidth: 760, maxHeight: '90vh', overflowY: 'auto', padding: 24, boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: 16, marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#0f172a' }}>Examination Structures & Terms</h3>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer' }}><X size={20} /></button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 30 }}>Loading structures...</div>
        ) : (
          <div>
            {!creating ? (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <span style={{ fontSize: 13, color: '#64748b' }}>Configured annual examination schemes</span>
                  <button
                    onClick={() => setCreating(true)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px',
                      borderRadius: 6, background: '#2563eb', color: '#fff', fontSize: 13,
                      fontWeight: 600, border: 'none', cursor: 'pointer'
                    }}
                  >
                    <Plus size={15} /> Add Structure
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {structures.length === 0 ? (
                    <div style={{ padding: 30, textAlign: 'center', color: '#64748b', background: '#f8fafc', borderRadius: 8 }}>
                      No examination structures configured yet. Click "Add Structure" to set up your terms.
                    </div>
                  ) : (
                    (Array.isArray(structures) ? structures : []).map(st => (
                      <div key={st.id} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 16, background: '#fff' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div>
                            <h4 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: '#0f172a' }}>{st.name}</h4>
                            <div style={{ fontSize: 12, color: '#64748b' }}>
                              Scale: {st.reporting_scale} marks • Pass %: {st.pass_percentage}% • Version: v{st.version}
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{
                              padding: '4px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                              background: st.status === 'published' ? '#dcfce7' : '#fef3c7',
                              color: st.status === 'published' ? '#15803d' : '#b45309'
                            }}>
                              {st.status.toUpperCase()}
                            </span>
                            {st.status !== 'published' && (
                              <button
                                onClick={() => handlePublish(st.id)}
                                style={{
                                  padding: '5px 12px', borderRadius: 4, background: '#16a34a',
                                  color: '#fff', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer'
                                }}
                              >
                                Publish & Lock Snapshot
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Terms list */}
                        <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {((st.terms as any[]) || []).map((t: any) => (
                            <span key={t.id} style={{ fontSize: 12, background: '#f1f5f9', padding: '4px 10px', borderRadius: 4, color: '#334155' }}>
                              <b>{t.name}</b> ({t.contribution}%)
                            </span>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : (
              /* Create Form */
              <div>
                <h4 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 16px' }}>Configure New Examination Structure</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Structure Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Annual Term Plan 2025-26"
                      value={newName}
                      onChange={e => setNewName(e.target.value)}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Scale (Max)</label>
                    <input
                      type="number"
                      value={newScale}
                      onChange={e => setNewScale(e.target.value)}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Pass %</label>
                    <input
                      type="number"
                      value={newPass}
                      onChange={e => setNewPass(e.target.value)}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }}
                    />
                  </div>
                </div>

                <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 16, marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>Examination Terms & Contributions</span>
                    <span style={{
                      fontSize: 12, fontWeight: 700,
                      color: Math.abs(totalContribution - 100) < 0.01 ? '#16a34a' : '#dc2626'
                    }}>
                      Total: {totalContribution}% {Math.abs(totalContribution - 100) < 0.01 ? '✓' : '(Must equal 100%)'}
                    </span>
                  </div>

                  {(Array.isArray(terms) ? terms : []).map((t, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: 10, marginBottom: 8, alignItems: 'center' }}>
                      <input
                        type="text"
                        value={t.name}
                        onChange={e => {
                          const updated = [...terms];
                          updated[idx].name = e.target.value;
                          setTerms(updated);
                        }}
                        style={{ flex: 2, padding: '7px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }}
                      />
                      <input
                        type="number"
                        placeholder="Contribution %"
                        value={t.contribution}
                        onChange={e => {
                          const updated = [...terms];
                          updated[idx].contribution = e.target.value;
                          setTerms(updated);
                        }}
                        style={{ width: 100, padding: '7px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }}
                      />
                      <span style={{ fontSize: 13, color: '#64748b' }}>%</span>
                      {terms.length > 1 && (
                        <button
                          onClick={() => setTerms(terms.filter((_, i) => i !== idx))}
                          style={{ border: 'none', background: 'none', color: '#ef4444', cursor: 'pointer', padding: 4 }}
                        >
                          <X size={16} />
                        </button>
                      )}
                    </div>
                  ))}

                  <button
                    onClick={() => setTerms([...terms, { name: `Term ${terms.length + 1}`, order: terms.length + 1, contribution: '0' }])}
                    style={{
                      background: 'none', border: 'none', color: '#2563eb', fontSize: 12,
                      fontWeight: 600, cursor: 'pointer', padding: 0, marginTop: 6
                    }}
                  >
                    + Add Another Term
                  </button>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                  <button
                    onClick={() => setCreating(false)}
                    style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', fontSize: 13 }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreate}
                    disabled={Math.abs(totalContribution - 100) > 0.01}
                    style={{
                      padding: '8px 16px', borderRadius: 6, background: Math.abs(totalContribution - 100) < 0.01 ? '#2563eb' : '#94a3b8',
                      color: '#fff', fontSize: 13, fontWeight: 600, border: 'none', cursor: Math.abs(totalContribution - 100) < 0.01 ? 'pointer' : 'not-allowed'
                    }}
                  >
                    Save Structure
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-Component: Quick Marks Entry Modal
// ---------------------------------------------------------------------------
interface MarksGridModalProps {
  classId: number;
  className: string;
  subjectId: number;
  subjectName: string;
  notify: (msg: string, type?: 'success' | 'error' | 'info') => void;
  onClose: () => void;
}

function MarksGridModal({ classId, className, subjectId, subjectName, notify, onClose }: MarksGridModalProps) {
  const [structures, setStructures] = useState<any[]>([]);
  const [selectedTermId, setSelectedTermId] = useState<number | null>(null);
  const [maxMarks, setMaxMarks] = useState<number>(100);
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Load structures to get terms
  useEffect(() => {
    request<any[]>(`aqi/structures/`)
      .then(res => {
        setStructures(res || []);
        if (res && res.length > 0 && res[0].terms?.length > 0) {
          setSelectedTermId(res[0].terms[0].id);
        }
      })
      .catch(() => {});
  }, []);

  // Load student grid once term is selected
  useEffect(() => {
    if (!selectedTermId) return;
    setLoading(true);
    request<any>(`aqi/marks-grid/?class_id=${classId}&subject_id=${subjectId}&term_id=${selectedTermId}`)
      .then(res => {
        setMaxMarks(res?.max_marks || 100);
        setStudents(res?.students || []);
      })
      .catch((err) => notify(err?.detail || 'Failed to load marks grid', 'error'))
      .finally(() => setLoading(false));
  }, [selectedTermId, classId, subjectId]);

  const handleSave = async () => {
    if (!selectedTermId) return;
    setSaving(true);
    try {
      const payload = {
        class_id: classId,
        subject_id: subjectId,
        term_id: selectedTermId,
        entries: (Array.isArray(students) ? students : []).map(s => ({
          student_id: s.student_id,
          marks: s.marks === '' ? null : s.marks,
          result_status: s.result_status
        }))
      };
      const res = await request<{ message: string }>(`aqi/marks-grid/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      notify(res?.message || 'Marks saved successfully', 'success');
      onClose();
    } catch (err: any) {
      notify(err?.detail || err?.message || 'Failed to save marks', 'error');
    } finally {
      setSaving(false);
    }
  };

  const allTerms = useMemo(() => {
    const list: any[] = [];
    structures.forEach(s => {
      (s.terms || []).forEach((t: any) => {
        list.push({ ...t, structureName: s.name });
      });
    });
    return list;
  }, [structures]);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.5)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: '#fff', borderRadius: 10, width: '100%', maxWidth: 840, maxHeight: '90vh', overflowY: 'auto', padding: 24, boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: 16, marginBottom: 16 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#0f172a' }}>Quick Marks Entry</h3>
            <span style={{ fontSize: 12, color: '#64748b' }}>{className} • {subjectName} (Max: {maxMarks} marks)</span>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer' }}><X size={20} /></button>
        </div>

        {/* Term Selector */}
        <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
          <label style={{ fontSize: 13, fontWeight: 600 }}>Select Term:</label>
          <select
            value={selectedTermId || ''}
            onChange={e => setSelectedTermId(parseInt(e.target.value, 10))}
            style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }}
          >
            {(Array.isArray(allTerms) ? allTerms : []).map(t => (
              <option key={t.id} value={t.id}>{t.name} ({t.contribution}%) — {t.structureName}</option>
            ))}
          </select>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 30 }}>Loading students...</div>
        ) : (
          <div>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13, marginBottom: 20 }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', fontWeight: 600 }}>
                  <th style={{ padding: '10px 12px' }}>Student Name</th>
                  <th style={{ padding: '10px 12px' }}>Admission #</th>
                  <th style={{ padding: '10px 12px' }}>Marks (Max {maxMarks})</th>
                  <th style={{ padding: '10px 12px' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {(Array.isArray(students) ? students : []).map((st, idx) => (
                  <tr key={st.student_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 600 }}>{st.student_name}</td>
                    <td style={{ padding: '10px 12px', color: '#64748b' }}>{st.admission_number}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max={maxMarks}
                        value={st.marks === null || st.marks === undefined ? '' : st.marks}
                        onChange={e => {
                          const val = e.target.value;
                          const updated = [...students];
                          updated[idx].marks = val;
                          if (val !== '' && updated[idx].result_status !== 'recorded') {
                            updated[idx].result_status = 'recorded';
                          }
                          setStudents(updated);
                        }}
                        style={{
                          width: 110,
                          padding: '6px 10px',
                          borderRadius: 6,
                          border: `1px solid ${(parseFloat(st.marks) || 0) > maxMarks ? '#ef4444' : '#cbd5e1'}`,
                          fontSize: 13
                        }}
                      />
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <select
                        value={st.result_status || 'missing'}
                        onChange={e => {
                          const updated = [...students];
                          updated[idx].result_status = e.target.value;
                          setStudents(updated);
                        }}
                        style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12 }}
                      >
                        <option value="recorded">Recorded</option>
                        <option value="missing">Missing</option>
                        <option value="absent">Absent</option>
                        <option value="exempt">Exempt</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, borderTop: '1px solid #e2e8f0', paddingTop: 16 }}>
              <button
                onClick={onClose}
                style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', fontSize: 13 }}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                style={{
                  padding: '8px 20px', borderRadius: 6, background: '#2563eb', color: '#fff',
                  fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer'
                }}
              >
                {saving ? 'Saving...' : 'Save All Marks'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
