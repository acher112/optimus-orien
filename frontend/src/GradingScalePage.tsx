import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  SlidersHorizontal, Award, Check, CheckCircle2, AlertCircle, Building2,
  Sparkles, RefreshCw, Plus, Trash2, Edit3, Save, ArrowRight, ShieldCheck,
  Layers, FileText, TrendingUp, BookOpen, ClipboardCheck, ClipboardList, HelpCircle
} from 'lucide-react';
import { request, type User, type Resource } from './api';

interface GradeBandItem {
  id?: number;
  min_percent: string | number;
  max_percent: string | number;
  letter: string;
  grade_point: string | number;
  description: string;
}

interface GradingScaleItem {
  id: number;
  name: string;
  school_id: number;
  school_name: string;
  is_default: boolean;
  passing_percentage: string;
  exam_weight: string;
  homework_weight: string;
  classwork_weight: string;
  attendance_weight: string;
  description: string;
  bands: GradeBandItem[];
  updated_at?: string;
}

interface GradingScalePageProps {
  user: User;
  notify: (msg: string) => void;
  activeCampusId: number | null;
  onSelectCampus?: (id: number | null) => void;
  campuses: any[];
  onNavigate?: (page: string) => void;
}

const PRESET_TEMPLATES = [
  {
    name: 'Standard Institutional (60/20/15/5)',
    exam_weight: 60,
    homework_weight: 20,
    classwork_weight: 15,
    attendance_weight: 5,
    description: 'Comprehensive evaluation: 60% term exams, 20% homework, 15% classwork, 5% attendance.'
  },
  {
    name: 'Exam Intensive (70/20/10/0)',
    exam_weight: 70,
    homework_weight: 20,
    classwork_weight: 10,
    attendance_weight: 0,
    description: 'Focus on summative assessments with supplementary homework and class activities.'
  },
  {
    name: 'Continuous Assessment (40/30/20/10)',
    exam_weight: 40,
    homework_weight: 30,
    classwork_weight: 20,
    attendance_weight: 10,
    description: 'Progressive learning model emphasizing ongoing homework, quizzes, and class participation.'
  },
  {
    name: 'Equal Core Distribution (50/25/25/0)',
    exam_weight: 50,
    homework_weight: 25,
    classwork_weight: 25,
    attendance_weight: 0,
    description: 'Balanced split: 50% exams, 25% homework assignments, 25% continuous classroom assessments.'
  }
];

const DEFAULT_STANDARD_BANDS: GradeBandItem[] = [
  { letter: 'A+', min_percent: '90.00', max_percent: '100.00', grade_point: '4.00', description: 'Outstanding Performance' },
  { letter: 'A',  min_percent: '80.00', max_percent: '89.99',  grade_point: '3.70', description: 'Excellent Achievement' },
  { letter: 'B',  min_percent: '70.00', max_percent: '79.99',  grade_point: '3.00', description: 'Good Understanding' },
  { letter: 'C',  min_percent: '60.00', max_percent: '69.99',  grade_point: '2.00', description: 'Satisfactory Progress' },
  { letter: 'D',  min_percent: '40.00', max_percent: '59.99',  grade_point: '1.00', description: 'Passing Grade' },
  { letter: 'F',  min_percent: '0.00',  max_percent: '39.99',  grade_point: '0.00', description: 'Needs Remedial Support' },
];

export default function GradingScalePage({
  user,
  notify,
  activeCampusId,
  onSelectCampus,
  campuses,
  onNavigate
}: GradingScalePageProps) {
  const [scales, setScales] = useState<GradingScaleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'criteria' | 'scales' | 'matrix' | 'test'>('criteria');

  // Currently selected scale for editing
  const [selectedScaleId, setSelectedScaleId] = useState<number | null>(null);

  // Form state for Criteria & Scale
  const [scaleName, setScaleName] = useState('');
  const [scaleSchoolId, setScaleSchoolId] = useState<number | string>('');
  const [examWeight, setExamWeight] = useState<number>(60);
  const [hwWeight, setHwWeight] = useState<number>(20);
  const [cwWeight, setCwWeight] = useState<number>(15);
  const [attWeight, setAttWeight] = useState<number>(5);
  const [passingPercentage, setPassingPercentage] = useState<number>(40);
  const [description, setDescription] = useState('');
  const [bands, setBands] = useState<GradeBandItem[]>(DEFAULT_STANDARD_BANDS);
  const [isDefault, setIsDefault] = useState(true);

  // Composite Verification / Test State
  const [testStudents, setTestStudents] = useState<any[]>([]);
  const [selectedTestStudentId, setSelectedTestStudentId] = useState<string>('');
  const [testResult, setTestResult] = useState<any>(null);
  const [testLoading, setTestLoading] = useState(false);

  const effectiveCampusId = useMemo(() => {
    if (activeCampusId) return activeCampusId;
    if (user.school) return user.school;
    return campuses.length > 0 ? campuses[0].id : null;
  }, [activeCampusId, user.school, campuses]);

  // Compute total weight
  const totalWeight = useMemo(() => {
    return Number((Number(examWeight || 0) + Number(hwWeight || 0) + Number(cwWeight || 0) + Number(attWeight || 0)).toFixed(2));
  }, [examWeight, hwWeight, cwWeight, attWeight]);

  const isWeightValid = Math.abs(totalWeight - 100) < 0.01;

  // Load Scales
  const loadScales = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      let url = 'exams/grading-scales/';
      if (effectiveCampusId) {
        url += `?school=${effectiveCampusId}`;
      }
      const res = await request<{ results: GradingScaleItem[] }>(url);
      const list = res.results || [];
      setScales(list);

      // Select active default scale or first scale
      if (list.length > 0) {
        const def = list.find(s => s.is_default) || list[0];
        setSelectedScaleId(prev => (prev && list.some(s => s.id === prev)) ? prev : def.id);
        populateForm(def);
      } else {
        // Prepare new default form for campus
        resetFormForNew(effectiveCampusId);
      }
    } catch (err: any) {
      setError(err?.message || 'Could not load grading scales.');
    } finally {
      setLoading(false);
    }
  }, [effectiveCampusId]);

  // Populate form with scale data
  const populateForm = (scale: GradingScaleItem) => {
    setScaleName(scale.name);
    setScaleSchoolId(scale.school_id);
    setExamWeight(parseFloat(scale.exam_weight) || 60);
    setHwWeight(parseFloat(scale.homework_weight) || 20);
    setCwWeight(parseFloat(scale.classwork_weight) || 15);
    setAttWeight(parseFloat(scale.attendance_weight) || 5);
    setPassingPercentage(parseFloat(scale.passing_percentage) || 40);
    setDescription(scale.description || '');
    setIsDefault(scale.is_default);
    setBands(scale.bands && scale.bands.length > 0 ? scale.bands : DEFAULT_STANDARD_BANDS);
  };

  const resetFormForNew = (schoolId: number | null) => {
    const campusObj = campuses.find((c: any) => c.id === schoolId);
    const campusName = campusObj ? String(campusObj.name || campusObj.id) : 'Campus';
    setSelectedScaleId(null);
    setScaleName(`${campusName} Standard Criteria`);
    setScaleSchoolId(schoolId || '');
    setExamWeight(60);
    setHwWeight(20);
    setCwWeight(15);
    setAttWeight(5);
    setPassingPercentage(40);
    setDescription('Institutional assessment weightage and grade mapping criteria.');
    setIsDefault(true);
    setBands(DEFAULT_STANDARD_BANDS);
  };

  useEffect(() => {
    loadScales();
  }, [loadScales]);

  // Handle Preset selection
  const applyPreset = (preset: typeof PRESET_TEMPLATES[0]) => {
    setExamWeight(preset.exam_weight);
    setHwWeight(preset.homework_weight);
    setCwWeight(preset.classwork_weight);
    setAttWeight(preset.attendance_weight);
    setDescription(preset.description);
    notify(`Applied preset: ${preset.name}`);
  };

  // Save criteria / scale
  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!scaleName.trim()) {
      notify('Scale name is required.');
      return;
    }
    if (!isWeightValid) {
      notify(`Total assessment weightage must equal exactly 100.00%. Current sum: ${totalWeight}%`);
      return;
    }

    setSaving(true);
    setError('');
    try {
      const payload = {
        name: scaleName.trim(),
        school: scaleSchoolId || effectiveCampusId,
        is_default: isDefault,
        passing_percentage: passingPercentage,
        exam_weight: examWeight,
        homework_weight: hwWeight,
        classwork_weight: cwWeight,
        attendance_weight: attWeight,
        description: description.trim(),
        bands: bands.map(b => ({
          min_percent: parseFloat(String(b.min_percent)),
          max_percent: parseFloat(String(b.max_percent)),
          letter: b.letter.trim(),
          grade_point: parseFloat(String(b.grade_point || 0)),
          description: (b.description || '').trim()
        }))
      };

      if (selectedScaleId) {
        await request(`exams/grading-scales/${selectedScaleId}/`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
        notify('Grading scale and assessment weightage criteria updated successfully!');
      } else {
        const created = await request<GradingScaleItem>('exams/grading-scales/', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        notify('New grading scale and assessment criteria created successfully!');
        setSelectedScaleId(created.id);
      }
      await loadScales();
    } catch (err: any) {
      setError(err?.message || 'Failed to save criteria.');
      notify(err?.message || 'Failed to save criteria.');
    } finally {
      setSaving(false);
    }
  };

  // Quick Set Default
  const handleSetDefault = async (id: number) => {
    try {
      await request(`exams/grading-scales/${id}/set-default/`, { method: 'POST' });
      notify('Scale set as active default for campus.');
      await loadScales();
    } catch (err: any) {
      notify(err?.message || 'Failed to set default scale.');
    }
  };

  // Delete scale
  const handleDeleteScale = async (id: number) => {
    if (!confirm('Are you sure you want to delete this grading scale?')) return;
    try {
      await request(`exams/grading-scales/${id}/`, { method: 'DELETE' });
      notify('Grading scale removed.');
      await loadScales();
    } catch (err: any) {
      notify(err?.message || 'Could not delete scale.');
    }
  };

  // Grade Bands editor helpers
  const handleBandChange = (index: number, field: keyof GradeBandItem, val: any) => {
    setBands(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: val };
      return copy;
    });
  };

  const handleAddBand = () => {
    setBands(prev => [
      ...prev,
      { letter: 'New', min_percent: '0.00', max_percent: '10.00', grade_point: '0.00', description: 'Custom Grade Band' }
    ]);
  };

  const handleRemoveBand = (index: number) => {
    if (bands.length <= 1) {
      notify('At least one grade band is required.');
      return;
    }
    setBands(prev => prev.filter((_, i) => i !== index));
  };

  // Live Composite Evaluation Runner
  const runCompositeTest = async () => {
    setTestLoading(true);
    try {
      let url = 'exams/grading-scales/composite-evaluation/';
      if (selectedTestStudentId) {
        url += `?student=${selectedTestStudentId}`;
      } else if (effectiveCampusId) {
        url += `?school=${effectiveCampusId}`;
      }
      const res = await request<{ results: any[] }>(url);
      setTestResult((res.results && res.results.length > 0) ? res.results[0] : null);
    } catch (err: any) {
      notify(err?.message || 'Could not run composite evaluation test.');
    } finally {
      setTestLoading(false);
    }
  };

  // Load sample students for testing
  useEffect(() => {
    if (activeTab === 'test') {
      request<{ results?: any[] }>(`students/?limit=20${effectiveCampusId ? `&school=${effectiveCampusId}` : ''}`)
        .then(res => {
          const list = res.results || (Array.isArray(res) ? res : []);
          setTestStudents(list);
          if (list.length > 0 && !selectedTestStudentId) {
            setSelectedTestStudentId(String(list[0].id));
          }
        })
        .catch(() => {});
    }
  }, [activeTab, effectiveCampusId]);

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', paddingBottom: 60 }}>
      {/* Page Header */}
      <div className="page-header" style={{ marginBottom: 20 }}>
        <div>
          <div className="eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#6366f1', fontWeight: 700 }}>
            <SlidersHorizontal size={14} /> ACADEMIC POLICIES & EVALUATION CRITERIA
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: '#0f172a', margin: '4px 0 6px' }}>
            Grading Scales & Assessment Weightage Criteria
          </h1>
          <p style={{ color: '#64748b', fontSize: 14, margin: 0 }}>
            Configure institutional assessment weightage distribution (Exams, Homework, Classwork, Attendance) and letter grade GPA bands per campus.
          </p>
        </div>

        {/* Campus Scope Selector */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {campuses.length > 1 && onSelectCampus && (
            <label className="fx-filter-item" style={{ fontSize: 13, fontWeight: 600 }}>Campus
              <select
                className="fx-select"
                style={{ marginLeft: 6, fontSize: 13 }}
                value={effectiveCampusId || ''}
                onChange={e => onSelectCampus(e.target.value ? Number(e.target.value) : null)}
              >
                {campuses.map((c: any) => (
                  <option key={c.id} value={c.id}>{String(c.name || c.id)}</option>
                ))}
              </select>
            </label>
          )}

          <button
            className="outline-btn"
            onClick={() => loadScales()}
            disabled={loading}
            title="Refresh criteria"
          >
            <RefreshCw size={14} className={loading ? 'spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="error-bar" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#b91c1c' }}>
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {/* Navigation Sub-Tabs */}
      <nav className="tab-nav" style={{ display: 'flex', gap: 8, borderBottom: '2px solid #e2e8f0', marginBottom: 24 }}>
        <button
          className={activeTab === 'criteria' ? 'on' : ''}
          onClick={() => setActiveTab('criteria')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 16px', fontWeight: 600, borderBottom: activeTab === 'criteria' ? '2px solid #6366f1' : 'none', color: activeTab === 'criteria' ? '#6366f1' : '#64748b', background: 'transparent' }}
        >
          <SlidersHorizontal size={16} /> Assessment Weightage Criteria
        </button>
        <button
          className={activeTab === 'scales' ? 'on' : ''}
          onClick={() => setActiveTab('scales')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 16px', fontWeight: 600, borderBottom: activeTab === 'scales' ? '2px solid #6366f1' : 'none', color: activeTab === 'scales' ? '#6366f1' : '#64748b', background: 'transparent' }}
        >
          <Award size={16} /> Letter Grades & GPA Bands ({bands.length})
        </button>
        <button
          className={activeTab === 'matrix' ? 'on' : ''}
          onClick={() => setActiveTab('matrix')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 16px', fontWeight: 600, borderBottom: activeTab === 'matrix' ? '2px solid #6366f1' : 'none', color: activeTab === 'matrix' ? '#6366f1' : '#64748b', background: 'transparent' }}
        >
          <Building2 size={16} /> Campus Criteria Overview ({scales.length})
        </button>
        <button
          className={activeTab === 'test' ? 'on' : ''}
          onClick={() => { setActiveTab('test'); runCompositeTest(); }}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 16px', fontWeight: 600, borderBottom: activeTab === 'test' ? '2px solid #6366f1' : 'none', color: activeTab === 'test' ? '#6366f1' : '#64748b', background: 'transparent' }}
        >
          <Sparkles size={16} /> Live Connection & Composite Verification
        </button>
      </nav>

      {/* ------------------------------------------------------------- */}
      {/* TAB 1: ASSESSMENT WEIGHTAGE CRITERIA                           */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'criteria' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Preset Templates Card */}
          <section className="panel" style={{ padding: '18px 22px', borderTop: '4px solid #6366f1' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0f172a' }}>
                  Institutional Criteria Presets
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
                  Choose an approved educational weightage model or customize values below.
                </p>
              </div>
              <span className="pill purple" style={{ fontSize: 12 }}>
                Active Campus: {String(campuses.find((c: any) => c.id === effectiveCampusId)?.name || 'All Campuses')}
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
              {PRESET_TEMPLATES.map((p, i) => (
                <div
                  key={i}
                  onClick={() => applyPreset(p)}
                  style={{
                    padding: '12px 16px',
                    border: '1px solid #e2e8f0',
                    borderRadius: 8,
                    cursor: 'pointer',
                    background: (examWeight === p.exam_weight && hwWeight === p.homework_weight && cwWeight === p.classwork_weight && attWeight === p.attendance_weight) ? '#f5f3ff' : '#ffffff',
                    borderColor: (examWeight === p.exam_weight && hwWeight === p.homework_weight && cwWeight === p.classwork_weight && attWeight === p.attendance_weight) ? '#8b5cf6' : '#e2e8f0',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <strong style={{ fontSize: 13, color: '#1e293b' }}>{p.name}</strong>
                    {(examWeight === p.exam_weight && hwWeight === p.homework_weight && cwWeight === p.classwork_weight && attWeight === p.attendance_weight) && (
                      <span className="pill green" style={{ fontSize: 10, padding: '2px 6px' }}>Active</span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.4 }}>{p.description}</div>
                </div>
              ))}
            </div>
          </section>

          {/* Core Weightage Form */}
          <section className="panel" style={{ padding: '22px 24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#0f172a' }}>
                  Component Weightage Breakdown
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
                  Define how term examinations, homework, classroom tasks, and attendance contribute to each student's overall performance.
                </p>
              </div>

              {/* Total Weight Sum Badge */}
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 14px',
                borderRadius: 20,
                background: isWeightValid ? '#ecfdf5' : '#fef2f2',
                color: isWeightValid ? '#059669' : '#dc2626',
                fontWeight: 700,
                fontSize: 13,
                border: `1px solid ${isWeightValid ? '#a7f3d0' : '#fecaca'}`
              }}>
                {isWeightValid ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                <span>Total Weight: {totalWeight.toFixed(1)}% / 100.0%</span>
              </div>
            </div>

            {/* Live Progress Bar */}
            <div style={{ width: '100%', height: 12, background: '#f1f5f9', borderRadius: 6, overflow: 'hidden', display: 'flex', marginBottom: 20 }}>
              <div style={{ width: `${Math.min(100, examWeight)}%`, background: '#6366f1', transition: 'width 0.2s' }} title={`Exams: ${examWeight}%`} />
              <div style={{ width: `${Math.min(100, hwWeight)}%`, background: '#3b82f6', transition: 'width 0.2s' }} title={`Homework: ${hwWeight}%`} />
              <div style={{ width: `${Math.min(100, cwWeight)}%`, background: '#10b981', transition: 'width 0.2s' }} title={`Classwork: ${cwWeight}%`} />
              <div style={{ width: `${Math.min(100, attWeight)}%`, background: '#f59e0b', transition: 'width 0.2s' }} title={`Attendance: ${attWeight}%`} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 16, marginBottom: 24 }}>
              {/* 1. Exam Weight */}
              <div style={{ padding: 16, borderRadius: 10, background: '#faf5ff', border: '1px solid #e9d5ff' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, color: '#6b21a8' }}>
                  <Award size={18} />
                  <strong style={{ fontSize: 14 }}>Examinations Weight</strong>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.5"
                    value={examWeight}
                    onChange={e => setExamWeight(parseFloat(e.target.value) || 0)}
                    style={{ width: '100%', padding: '8px 12px', fontSize: 16, fontWeight: 700, borderRadius: 6, border: '1px solid #d8b4fe' }}
                  />
                  <span style={{ fontSize: 15, fontWeight: 600, color: '#6b21a8' }}>%</span>
                </div>
                <p style={{ fontSize: 11, color: '#7e22ce', margin: '6px 0 0' }}>
                  Calculated from central Examination Engine terms.
                </p>
              </div>

              {/* 2. Homework Weight */}
              <div style={{ padding: 16, borderRadius: 10, background: '#eff6ff', border: '1px solid #bfdbfe' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, color: '#1e40af' }}>
                  <ClipboardList size={18} />
                  <strong style={{ fontSize: 14 }}>Homework & Assignments</strong>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.5"
                    value={hwWeight}
                    onChange={e => setHwWeight(parseFloat(e.target.value) || 0)}
                    style={{ width: '100%', padding: '8px 12px', fontSize: 16, fontWeight: 700, borderRadius: 6, border: '1px solid #93c5fd' }}
                  />
                  <span style={{ fontSize: 15, fontWeight: 600, color: '#1e40af' }}>%</span>
                </div>
                <p style={{ fontSize: 11, color: '#1d4ed8', margin: '6px 0 0' }}>
                  Submission rate and confirmed completion score.
                </p>
              </div>

              {/* 3. Classwork Weight */}
              <div style={{ padding: 16, borderRadius: 10, background: '#ecfdf5', border: '1px solid #a7f3d0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, color: '#065f46' }}>
                  <BookOpen size={18} />
                  <strong style={{ fontSize: 14 }}>Class Assessments</strong>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.5"
                    value={cwWeight}
                    onChange={e => setCwWeight(parseFloat(e.target.value) || 0)}
                    style={{ width: '100%', padding: '8px 12px', fontSize: 16, fontWeight: 700, borderRadius: 6, border: '1px solid #6ee7b7' }}
                  />
                  <span style={{ fontSize: 15, fontWeight: 600, color: '#065f46' }}>%</span>
                </div>
                <p style={{ fontSize: 11, color: '#047857', margin: '6px 0 0' }}>
                  Periodic quizzes, classwork & homeroom assessments.
                </p>
              </div>

              {/* 4. Attendance Weight */}
              <div style={{ padding: 16, borderRadius: 10, background: '#fffbeb', border: '1px solid #fde68a' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, color: '#92400e' }}>
                  <ClipboardCheck size={18} />
                  <strong style={{ fontSize: 14 }}>Attendance & Standing</strong>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.5"
                    value={attWeight}
                    onChange={e => setAttWeight(parseFloat(e.target.value) || 0)}
                    style={{ width: '100%', padding: '8px 12px', fontSize: 16, fontWeight: 700, borderRadius: 6, border: '1px solid #fcd34d' }}
                  />
                  <span style={{ fontSize: 15, fontWeight: 600, color: '#92400e' }}>%</span>
                </div>
                <p style={{ fontSize: 11, color: '#b45309', margin: '6px 0 0' }}>
                  Institutional attendance threshold percentage.
                </p>
              </div>
            </div>

            {/* Additional Policy Settings */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 20 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                  Criteria / Scale Name:
                </label>
                <input
                  type="text"
                  value={scaleName}
                  onChange={e => setScaleName(e.target.value)}
                  placeholder="e.g. Main Campus Institutional Criteria"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #cbd5e1' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                  Passing Threshold Percentage:
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    value={passingPercentage}
                    onChange={e => setPassingPercentage(parseFloat(e.target.value) || 0)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #cbd5e1' }}
                  />
                  <span style={{ fontWeight: 600, color: '#64748b' }}>%</span>
                </div>
              </div>

              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                  Policy Description / Notes:
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="e.g. Approved criteria for 2025-2026 academic session."
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #cbd5e1' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 16, borderTop: '1px solid #e2e8f0', flexWrap: 'wrap', gap: 12 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={isDefault}
                  onChange={e => setIsDefault(e.target.checked)}
                />
                <span>Set as active default criteria for this campus</span>
              </label>

              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  type="button"
                  className="primary-btn"
                  onClick={() => handleSave()}
                  disabled={saving || !isWeightValid}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 20px' }}
                >
                  <Save size={16} /> {saving ? 'Saving Criteria…' : 'Save & Apply Campus Criteria'}
                </button>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* TAB 2: LETTER GRADES & GPA BANDS                               */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'scales' && (
        <section className="panel" style={{ padding: '22px 24px', borderTop: '4px solid #8b5cf6' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#0f172a' }}>
                Institutional Letter Grade & GPA Bands
              </h3>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
                Map percentage ranges to standard letter grades, GPA grade points, and performance descriptions.
              </p>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className="outline-btn"
                onClick={handleAddBand}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <Plus size={15} /> Add Grade Band
              </button>
              <button
                type="button"
                className="primary-btn"
                onClick={() => handleSave()}
                disabled={saving}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <Save size={15} /> Save Bands
              </button>
            </div>
          </div>

          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: 120 }}>LETTER GRADE</th>
                  <th style={{ width: 140 }}>MIN %</th>
                  <th style={{ width: 140 }}>MAX %</th>
                  <th style={{ width: 130 }}>GPA POINT</th>
                  <th>PERFORMANCE DESCRIPTION</th>
                  <th style={{ width: 80, textAlign: 'center' }}>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {bands.map((band, idx) => (
                  <tr key={idx}>
                    <td>
                      <input
                        type="text"
                        value={band.letter}
                        onChange={e => handleBandChange(idx, 'letter', e.target.value)}
                        style={{ width: '80px', padding: '6px 8px', fontWeight: 800, textAlign: 'center', borderRadius: 6, border: '1px solid #cbd5e1' }}
                      />
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <input
                          type="number"
                          step="0.01"
                          value={band.min_percent}
                          onChange={e => handleBandChange(idx, 'min_percent', e.target.value)}
                          style={{ width: '90px', padding: '6px 8px', borderRadius: 6, border: '1px solid #cbd5e1' }}
                        />
                        <span style={{ fontSize: 12, color: '#64748b' }}>%</span>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <input
                          type="number"
                          step="0.01"
                          value={band.max_percent}
                          onChange={e => handleBandChange(idx, 'max_percent', e.target.value)}
                          style={{ width: '90px', padding: '6px 8px', borderRadius: 6, border: '1px solid #cbd5e1' }}
                        />
                        <span style={{ fontSize: 12, color: '#64748b' }}>%</span>
                      </div>
                    </td>
                    <td>
                      <input
                        type="number"
                        step="0.1"
                        value={band.grade_point}
                        onChange={e => handleBandChange(idx, 'grade_point', e.target.value)}
                        style={{ width: '80px', padding: '6px 8px', borderRadius: 6, border: '1px solid #cbd5e1' }}
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        value={band.description}
                        onChange={e => handleBandChange(idx, 'description', e.target.value)}
                        style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e1' }}
                      />
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <button
                        type="button"
                        onClick={() => handleRemoveBand(idx)}
                        style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 4 }}
                        title="Remove band"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ------------------------------------------------------------- */}
      {/* TAB 3: CAMPUS CRITERIA OVERVIEW MATRIX                         */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'matrix' && (
        <section className="panel" style={{ padding: '22px 24px', borderTop: '4px solid #10b981' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#0f172a' }}>
                All Campus Criteria Configurations
              </h3>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
                Compare active assessment weightages and grading scales across all branches.
              </p>
            </div>
            <button
              className="primary-btn"
              onClick={() => {
                resetFormForNew(effectiveCampusId);
                setActiveTab('criteria');
              }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <Plus size={15} /> Create New Campus Criteria
            </button>
          </div>

          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>CAMPUS</th>
                  <th>CRITERIA NAME</th>
                  <th>STATUS</th>
                  <th>EXAMS</th>
                  <th>HOMEWORK</th>
                  <th>CLASSWORK</th>
                  <th>ATTENDANCE</th>
                  <th>PASS %</th>
                  <th style={{ textAlign: 'right' }}>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {scales.map(scale => (
                  <tr key={scale.id} style={{ background: scale.is_default ? '#fbfcfe' : '#ffffff' }}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Building2 size={15} color="#6366f1" />
                        <strong>{scale.school_name}</strong>
                      </div>
                    </td>
                    <td>
                      <div><strong>{scale.name}</strong></div>
                      {scale.description && <div style={{ fontSize: 11, color: '#64748b' }}>{scale.description}</div>}
                    </td>
                    <td>
                      {scale.is_default ? (
                        <span className="pill green" style={{ fontSize: 11 }}>Active Default</span>
                      ) : (
                        <span className="pill" style={{ fontSize: 11 }}>Alternative</span>
                      )}
                    </td>
                    <td><span className="pill purple" style={{ fontWeight: 700 }}>{scale.exam_weight}%</span></td>
                    <td><span className="pill blue" style={{ fontWeight: 700 }}>{scale.homework_weight}%</span></td>
                    <td><span className="pill green" style={{ fontWeight: 700 }}>{scale.classwork_weight}%</span></td>
                    <td><span className="pill amber" style={{ fontWeight: 700 }}>{scale.attendance_weight}%</span></td>
                    <td><strong>{scale.passing_percentage}%</strong></td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: 6 }}>
                        {!scale.is_default && (
                          <button
                            className="sm-btn"
                            onClick={() => handleSetDefault(scale.id)}
                            title="Set as active default for this campus"
                          >
                            Set Default
                          </button>
                        )}
                        <button
                          className="sm-btn"
                          onClick={() => {
                            setSelectedScaleId(scale.id);
                            populateForm(scale);
                            setActiveTab('criteria');
                          }}
                          title="Edit criteria"
                        >
                          <Edit3 size={13} /> Edit
                        </button>
                        <button
                          className="sm-btn"
                          style={{ color: '#ef4444' }}
                          onClick={() => handleDeleteScale(scale.id)}
                          title="Delete scale"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {scales.length === 0 && (
                  <tr>
                    <td colSpan={9} style={{ textAlign: 'center', padding: '40px 20px', color: '#64748b' }}>
                      No criteria defined yet. Click &quot;Create New Campus Criteria&quot; above to setup your first scale.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ------------------------------------------------------------- */}
      {/* TAB 4: LIVE COMPOSITE STANDING & VERIFICATION                  */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'test' && (
        <section className="panel" style={{ padding: '22px 24px', borderTop: '4px solid #f59e0b' }}>
          <div style={{ marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#0f172a' }}>
              Live System Connection: Student Composite Evaluation
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
              Verify how the campus assessment weightage criteria (Exams {examWeight}%, Homework {hwWeight}%, Classwork {cwWeight}%, Attendance {attWeight}%) translates into a live composite grade for enrolled learners.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 20, flexWrap: 'wrap' }}>
            <label style={{ fontSize: 13, fontWeight: 600 }}>Select Student:
              <select
                className="fx-select"
                style={{ marginLeft: 6, fontSize: 13, minWidth: 220 }}
                value={selectedTestStudentId}
                onChange={e => setSelectedTestStudentId(e.target.value)}
              >
                {testStudents.map(st => (
                  <option key={st.id} value={st.id}>
                    {st.full_name || `${st.first_name} ${st.last_name}`} ({st.admission_number || `ID ${st.id}`})
                  </option>
                ))}
              </select>
            </label>

            <button
              className="primary-btn"
              onClick={runCompositeTest}
              disabled={testLoading}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <Sparkles size={15} /> {testLoading ? 'Evaluating…' : 'Compute Composite Standing'}
            </button>
          </div>

          {testResult ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Headline Result Card */}
              <div style={{ padding: '20px 24px', background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>STUDENT COMPOSITE PERFORMANCE</div>
                  <h2 style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', margin: '4px 0 2px' }}>{testResult.student_name}</h2>
                  <div style={{ fontSize: 13, color: '#64748b' }}>
                    Admission: {testResult.admission_number} | Campus: {testResult.school_name} | Criteria: {testResult.scale_name}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>OVERALL COMPOSITE</div>
                    <div style={{ fontSize: 28, fontWeight: 800, color: '#6366f1' }}>
                      {testResult.composite_percentage !== null ? `${testResult.composite_percentage}%` : 'N/A'}
                    </div>
                  </div>

                  <div style={{ textAlign: 'center', padding: '10px 18px', background: '#ffffff', borderRadius: 10, border: '2px solid #8b5cf6' }}>
                    <div style={{ fontSize: 11, color: '#6b21a8', fontWeight: 700 }}>GRADE</div>
                    <div style={{ fontSize: 32, fontWeight: 900, color: '#7c3aed' }}>{testResult.letter_grade}</div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>GPA {testResult.grade_point}</div>
                  </div>

                  <div>
                    {testResult.passed === true && <span className="pill green" style={{ fontSize: 13, padding: '6px 12px' }}>PASSED</span>}
                    {testResult.passed === false && <span className="pill red" style={{ fontSize: 13, padding: '6px 12px' }}>NEEDS SUPPORT</span>}
                  </div>
                </div>
              </div>

              {/* Component breakdown cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
                {(testResult.components || []).map((c: any, ci: number) => (
                  <div key={ci} style={{ padding: 14, background: '#ffffff', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>{c.component}</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: '#1e293b', margin: '4px 0 2px' }}>
                      {c.score.toFixed(1)}%
                    </div>
                    <div style={{ fontSize: 12, color: '#6366f1' }}>
                      Weight: {c.weight}% → Contribution: <strong>{c.contribution.toFixed(2)} pts</strong>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ padding: 30, textAlign: 'center', color: '#64748b' }}>
              Select a student above and click &quot;Compute Composite Standing&quot; to test criteria connections.
            </div>
          )}
        </section>
      )}
    </div>
  );
}
