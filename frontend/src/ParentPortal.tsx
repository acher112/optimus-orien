import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Users, UserCheck, AlertTriangle, CheckCircle2, Clock, Calendar,
  TrendingUp, Award, BookOpen, FileText, PhoneCall, Mail, ChevronRight,
  Download, Eye, Bell, Shield, ArrowUpRight, ArrowDownRight, Minus,
  RefreshCw, MessageSquare, HelpCircle, Check, Printer, X
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  CartesianGrid, Legend
} from 'recharts';
import { request, type User } from './api';

interface Props {
  user: User;
  notify: (msg: string) => void;
  initialPage?: string;
}

type TabType = 'overview' | 'results' | 'attendance' | 'risk' | 'teachers' | 'homework' | 'fees';

export default function ParentPortal({ user, notify, initialPage }: Props) {
  const [lang, setLang] = useState<'en' | 'ur'>('en');
  const [children, setChildren] = useState<any[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [loading, setLoading] = useState(true);
  const [childLoading, setChildLoading] = useState(false);
  const [error, setError] = useState('');

  // Child specific data
  const [overviewData, setOverviewData] = useState<any>(null);
  const [resultsData, setResultsData] = useState<any>(null);
  const [attendanceData, setAttendanceData] = useState<any>(null);
  const [riskData, setRiskData] = useState<any>(null);
  const [teachersData, setTeachersData] = useState<any[]>([]);
  const [homeworkData, setHomeworkData] = useState<any[]>([]);
  const [feesData, setFeesData] = useState<any>(null);

  // Modals
  const [showCallbackModal, setShowCallbackModal] = useState(false);
  const [callbackTeacherId, setCallbackTeacherId] = useState<number | ''>('');
  const [callbackTopic, setCallbackTopic] = useState('academic');
  const [callbackTime, setCallbackTime] = useState('morning');
  const [callbackMessage, setCallbackMessage] = useState('');
  const [submittingCallback, setSubmittingCallback] = useState(false);

  const [showReportCardModal, setShowReportCardModal] = useState(false);
  const [reportCardData, setReportCardData] = useState<any>(null);
  const [loadingReportCard, setLoadingReportCard] = useState(false);

  // Fetch children list
  const fetchChildren = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const res: any = await request('parent/home/');
      const list = res.children || [];
      setChildren(list);
      if (list.length > 0 && !selectedChildId) {
        // If navigating to a specific tab from sidebar, keep family home or select 1st child
        if (initialPage && initialPage !== 'Family Home' && initialPage !== 'Overview') {
          setSelectedChildId(list[0].id);
        }
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load children summary.');
    } finally {
      setLoading(false);
    }
  }, [initialPage, selectedChildId]);

  useEffect(() => {
    fetchChildren();
  }, [fetchChildren]);

  // Sync tab with initialPage
  useEffect(() => {
    if (initialPage === 'Results & Progress') setActiveTab('results');
    else if (initialPage === 'Attendance') setActiveTab('attendance');
    else if (initialPage === 'Risk & Support') setActiveTab('risk');
    else if (initialPage === 'Teachers') setActiveTab('teachers');
    else if (initialPage === 'Homework') setActiveTab('homework');
    else if (initialPage === 'Fees') setActiveTab('fees');
    else if (initialPage === 'Family Home') setSelectedChildId(null);
  }, [initialPage]);

  // Selected child object
  const activeChild = useMemo(() => {
    return children.find(c => c.id === selectedChildId) || null;
  }, [children, selectedChildId]);

  // Fetch data for selected child and active tab
  const fetchChildTab = useCallback(async (childId: number, tab: TabType) => {
    try {
      setChildLoading(true);
      if (tab === 'overview') {
        const res = await request(`parent/children/${childId}/overview/`);
        setOverviewData(res);
      } else if (tab === 'results') {
        const res = await request(`parent/children/${childId}/results/`);
        setResultsData(res);
      } else if (tab === 'attendance') {
        const res = await request(`parent/children/${childId}/attendance/`);
        setAttendanceData(res);
      } else if (tab === 'risk') {
        const res = await request(`parent/children/${childId}/risk-and-support/`);
        setRiskData(res);
      } else if (tab === 'teachers') {
        const res: any = await request(`parent/children/${childId}/teachers/`);
        setTeachersData(res || []);
      } else if (tab === 'homework') {
        const res: any = await request(`parent/children/${childId}/homework/`);
        setHomeworkData(res || []);
      } else if (tab === 'fees') {
        const res = await request(`parent/children/${childId}/fees/`);
        setFeesData(res);
      }
    } catch (err: any) {
      notify(err?.message || 'Could not load data.');
    } finally {
      setChildLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    if (selectedChildId) {
      fetchChildTab(selectedChildId, activeTab);
    }
  }, [selectedChildId, activeTab, fetchChildTab]);

  // Acknowledge risk alert
  const handleAcknowledgeAlert = async (alertId: number) => {
    try {
      await request(`parent/alerts/${alertId}/acknowledge/`, { method: 'POST' });
      notify('Alert acknowledged. Thank you for staying involved.');
      if (selectedChildId) {
        fetchChildTab(selectedChildId, 'risk');
        fetchChildren();
      }
    } catch (err: any) {
      notify(err?.message || 'Failed to acknowledge alert.');
    }
  };

  // Submit callback request
  const handleSubmitCallback = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedChildId || !callbackTeacherId || !callbackMessage.trim()) {
      notify('Please select a teacher and provide a message note.');
      return;
    }
    try {
      setSubmittingCallback(true);
      await request(`parent/children/${selectedChildId}/callback-request/`, {
        method: 'POST',
        body: JSON.stringify({
          teacher_id: callbackTeacherId,
          topic: callbackTopic,
          preferred_time: callbackTime,
          message: callbackMessage.trim(),
        })
      });
      notify('Call-back request submitted. The teacher has been notified.');
      setShowCallbackModal(false);
      setCallbackMessage('');
    } catch (err: any) {
      notify(err?.message || 'Failed to submit call-back request.');
    } finally {
      setSubmittingCallback(false);
    }
  };

  // Open Printable Report Card
  const handleOpenReportCard = async (studentId: number) => {
    try {
      setLoadingReportCard(true);
      setShowReportCardModal(true);
      const res = await request(`parent/children/${studentId}/report-card/`);
      setReportCardData(res);
    } catch (err: any) {
      notify(err?.message || 'Failed to load report card.');
      setShowReportCardModal(false);
    } finally {
      setLoadingReportCard(false);
    }
  };

  // Urdu Translations map
  const t = (en: string, ur: string) => lang === 'ur' ? ur : en;

  return (
    <div className="parent-portal-container" style={{ padding: '24px', maxWidth: '1280px', margin: '0 auto' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted, #64748b)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            {t('Parent & Guardian Portal', 'والدین و سرپرست پورٹل')}
          </div>
          <h1 style={{ fontSize: '26px', fontWeight: 700, margin: '4px 0 0 0', color: 'var(--text-primary, #0f172a)' }}>
            {selectedChildId && activeChild ? `${activeChild.full_name}'s Progress` : t('Family Overview', 'خاندانی جائزہ')}
          </h1>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Language Toggle */}
          <button
            onClick={() => setLang(l => l === 'en' ? 'ur' : 'en')}
            style={{
              padding: '6px 14px',
              borderRadius: '20px',
              border: '1px solid var(--border-color, #cbd5e1)',
              background: '#fff',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <span>{lang === 'en' ? 'اردو (Urdu)' : 'English'}</span>
          </button>

          {/* If inside a child view, back to Family Home */}
          {selectedChildId && (
            <button
              onClick={() => setSelectedChildId(null)}
              style={{
                padding: '6px 14px',
                borderRadius: '8px',
                border: '1px solid var(--border-color, #cbd5e1)',
                background: '#fff',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <Users size={15} />
              <span>{t('All Children', 'تمام بچے')}</span>
            </button>
          )}
        </div>
      </div>

      {loading && (
        <div style={{ padding: '60px', textAlign: 'center', color: '#64748b' }}>
          <RefreshCw className="animate-spin" size={28} style={{ margin: '0 auto 12px auto' }} />
          <p>{t('Loading your family profile...', 'معلومات لوڈ کی جا رہی ہیں...')}</p>
        </div>
      )}

      {error && !loading && (
        <div style={{ padding: '16px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#991b1b', marginBottom: '20px' }}>
          {error}
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 1. FAMILY HOME (Multi-child switcher & summary cards)        */}
      {/* ------------------------------------------------------------- */}
      {!loading && !selectedChildId && (
        <div>
          <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '14px', color: '#64748b', fontWeight: 500 }}>
              {t(`Linked Children (${children.length})`, `منسلک طلباء (${children.length})`)}
            </span>
          </div>

          {children.length === 0 ? (
            <div style={{ padding: '48px', textAlign: 'center', background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
              <Users size={40} color="#94a3b8" style={{ margin: '0 auto 12px auto' }} />
              <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#1e293b' }}>{t('No Linked Students Found', 'کوئی منسلک طالب علم نہیں ملا')}</h3>
              <p style={{ color: '#64748b', maxWidth: '400px', margin: '8px auto 0 auto', fontSize: '14px' }}>
                {t('Please contact your school administration or campus principal to verify and link your children.', 'براہ کرم اسکول کے پرنسپل سے رابطہ کریں۔')}
              </p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '20px' }}>
              {children.map(child => {
                const isNeedsAttention = child.needs_attention;
                const attRate = child.attendance_rate;
                return (
                  <div
                    key={child.id}
                    style={{
                      background: '#fff',
                      borderRadius: '12px',
                      border: isNeedsAttention ? '2px solid #fca5a5' : '1px solid #e2e8f0',
                      boxShadow: isNeedsAttention ? '0 4px 12px rgba(239, 68, 68, 0.08)' : '0 1px 3px rgba(0,0,0,0.05)',
                      padding: '20px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between'
                    }}
                  >
                    <div>
                      {/* Header with avatar & attention badge */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                          <div style={{
                            width: '46px',
                            height: '46px',
                            borderRadius: '50%',
                            background: child.gender === 'female' ? '#fdf2f8' : '#eff6ff',
                            color: child.gender === 'female' ? '#db2777' : '#2563eb',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 700,
                            fontSize: '18px'
                          }}>
                            {child.full_name ? child.full_name.charAt(0) : 'S'}
                          </div>
                          <div>
                            <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: '#0f172a' }}>{child.full_name}</h3>
                            <div style={{ fontSize: '13px', color: '#64748b' }}>
                              {child.class_display} • Roll: {child.admission_number}
                            </div>
                          </div>
                        </div>

                        {isNeedsAttention && (
                          <span style={{
                            background: '#fef2f2',
                            color: '#b91c1c',
                            fontSize: '11px',
                            fontWeight: 700,
                            padding: '3px 8px',
                            borderRadius: '12px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}>
                            <AlertTriangle size={12} />
                            {t('Needs Attention', 'توجہ طلب')}
                          </span>
                        )}
                      </div>

                      {/* Campus & Homeroom info */}
                      <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '16px', background: '#f8fafc', padding: '8px 12px', borderRadius: '6px' }}>
                        <div><b>{t('Campus:', 'کیمپس:')}</b> {child.campus_name}</div>
                        <div><b>{t('Homeroom Teacher:', 'کلاس ٹیچر:')}</b> {child.class_teacher_name}</div>
                      </div>

                      {/* 3-Stat Strip */}
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(3, 1fr)',
                        gap: '8px',
                        background: '#f8fafc',
                        borderRadius: '8px',
                        padding: '12px 8px',
                        textAlign: 'center',
                        marginBottom: '16px'
                      }}>
                        <div>
                          <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>{t('ATTENDANCE', 'حاضری')}</div>
                          <div style={{
                            fontSize: '15px',
                            fontWeight: 700,
                            marginTop: '2px',
                            color: attRate < 75 ? '#dc2626' : (attRate < 85 ? '#d97706' : '#16a34a')
                          }}>
                            {attRate}%
                          </div>
                          <span style={{ fontSize: '10px', color: '#94a3b8' }}>{child.attendance_badge}</span>
                        </div>

                        <div>
                          <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>{t('ACADEMICS', 'تعلیمی')}</div>
                          <div style={{ fontSize: '13px', fontWeight: 700, marginTop: '4px', color: '#2563eb' }}>
                            {child.academic_standing}
                          </div>
                          <span style={{ fontSize: '10px', color: '#94a3b8' }}>{t('Overall', 'مجموعی')}</span>
                        </div>

                        <div>
                          <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>{t('ALERTS', 'انتباہ')}</div>
                          <div style={{ fontSize: '14px', fontWeight: 700, marginTop: '2px', color: child.active_alerts_count > 0 ? '#dc2626' : '#16a34a' }}>
                            {child.active_alerts_count > 0 ? `${child.active_alerts_count} Active` : (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', color: '#16a34a', fontSize: '12px' }}>
                                <Check size={14} /> {t('On track', 'تسلی بخش')}
                              </span>
                            )}
                          </div>
                          <span style={{ fontSize: '10px', color: '#94a3b8' }}>{child.primary_alert ? 'Action req.' : 'No issues'}</span>
                        </div>
                      </div>
                    </div>

                    {/* Quick action buttons */}
                    <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '14px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <button
                        onClick={() => {
                          setSelectedChildId(child.id);
                          setActiveTab('results');
                        }}
                        style={{
                          flex: 1,
                          padding: '8px 12px',
                          background: 'var(--brand-primary, #1e3a8a)',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '6px',
                          fontSize: '13px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px'
                        }}
                      >
                        <TrendingUp size={15} />
                        <span>{t('View Progress', 'مکمل پیشرفت')}</span>
                      </button>

                      <button
                        onClick={() => handleOpenReportCard(child.id)}
                        title="Download / Print Progress Report"
                        style={{
                          padding: '8px 12px',
                          background: '#fff',
                          color: '#475569',
                          border: '1px solid #cbd5e1',
                          borderRadius: '6px',
                          fontSize: '13px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        <Printer size={15} />
                        <span>{t('Report', 'رپورٹ')}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 2. PER-CHILD VIEW & TABS                                      */}
      {/* ------------------------------------------------------------- */}
      {selectedChildId && activeChild && (
        <div>
          {/* Child Switcher Pill Bar */}
          {children.length > 1 && (
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', overflowX: 'auto', paddingBottom: '4px' }}>
              {children.map(c => (
                <button
                  key={c.id}
                  onClick={() => setSelectedChildId(c.id)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '20px',
                    border: c.id === selectedChildId ? '2px solid #2563eb' : '1px solid #cbd5e1',
                    background: c.id === selectedChildId ? '#eff6ff' : '#fff',
                    color: c.id === selectedChildId ? '#1d4ed8' : '#475569',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <span>{c.full_name}</span>
                  {c.needs_attention && <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444' }} />}
                </button>
              ))}
            </div>
          )}

          {/* Navigation Tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', marginBottom: '24px', overflowX: 'auto', gap: '8px' }}>
            {[
              { key: 'overview', label: t('Overview', 'جائزہ'), icon: Eye },
              { key: 'results', label: t('Results & Progress', 'نتائج و تعلیمی پیشرفت'), icon: TrendingUp },
              { key: 'attendance', label: t('Attendance', 'حاضری کا ریکارڈ'), icon: Calendar },
              { key: 'risk', label: t('Risk & Support', 'رہنمائی و سپورٹ'), icon: AlertTriangle, badge: activeChild.active_alerts_count },
              { key: 'teachers', label: t('Teachers', 'اساتذہ سے رابطہ'), icon: PhoneCall },
              { key: 'homework', label: t('Homework', 'ہوم ورک'), icon: BookOpen },
              { key: 'fees', label: t('Fees', 'فیس تفصیلات'), icon: FileText },
            ].map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key as TabType)}
                  style={{
                    padding: '12px 18px',
                    background: 'none',
                    border: 'none',
                    borderBottom: isActive ? '3px solid #2563eb' : '3px solid transparent',
                    color: isActive ? '#1d4ed8' : '#64748b',
                    fontSize: '14px',
                    fontWeight: isActive ? 700 : 500,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    whiteSpace: 'nowrap'
                  }}
                >
                  <Icon size={17} />
                  <span>{tab.label}</span>
                  {tab.badge && tab.badge > 0 ? (
                    <span style={{ background: '#ef4444', color: '#fff', fontSize: '11px', borderRadius: '10px', padding: '1px 6px', fontWeight: 700 }}>
                      {tab.badge}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          {childLoading && (
            <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
              <RefreshCw className="animate-spin" size={24} style={{ margin: '0 auto 8px auto' }} />
              <p>{t('Updating details...', 'تفصیلات حاصل کی جا رہی ہیں...')}</p>
            </div>
          )}

          {/* TAB A: OVERVIEW */}
          {!childLoading && activeTab === 'overview' && overviewData && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
              {/* Recent Attendance Strip */}
              <div style={{ background: '#fff', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 12px 0' }}>{t('Recent Attendance (Last 10 Days)', 'حالیہ 10 دنوں کی حاضری')}</h3>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {overviewData.recent_attendance?.length === 0 && <span style={{ color: '#94a3b8' }}>{t('No attendance recorded yet.', 'کوئی ریکارڈ نہیں ملا')}</span>}
                  {overviewData.recent_attendance?.map((rec: any, idx: number) => {
                    const isP = rec.status === 'present';
                    const isA = rec.status === 'absent';
                    const isL = rec.status === 'late';
                    return (
                      <div
                        key={idx}
                        title={`${rec.date}: ${rec.status}`}
                        style={{
                          width: '38px',
                          height: '38px',
                          borderRadius: '8px',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background: isP ? '#dcfce7' : (isA ? '#fee2e2' : '#fef3c7'),
                          color: isP ? '#15803d' : (isA ? '#b91c1c' : '#b45309'),
                          fontWeight: 700,
                          fontSize: '12px'
                        }}
                      >
                        <span>{isP ? 'P' : (isA ? 'A' : (isL ? 'L' : 'LV'))}</span>
                        <span style={{ fontSize: '9px', fontWeight: 500 }}>{rec.date.slice(8)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Recent Assessments */}
              <div style={{ background: '#fff', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 12px 0' }}>{t('Recent Assessment Results', 'حالیہ امتحانی نتائج')}</h3>
                {overviewData.recent_assessments?.length === 0 ? (
                  <p style={{ color: '#94a3b8', fontSize: '14px' }}>{t('No recent assessments published.', 'کوئی حالیہ نتیجہ نہیں ملا')}</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {overviewData.recent_assessments?.map((a: any, i: number) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: '#f8fafc', borderRadius: '8px' }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '14px', color: '#1e293b' }}>{a.subject_name}</div>
                          <div style={{ fontSize: '12px', color: '#64748b' }}>{a.assessment_title} • {a.date}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <span style={{ fontWeight: 700, fontSize: '15px', color: a.percentage >= 70 ? '#16a34a' : (a.percentage >= 50 ? '#2563eb' : '#dc2626') }}>
                            {a.percentage}%
                          </span>
                          <div style={{ fontSize: '11px', color: '#94a3b8' }}>{a.marks_obtained}/{a.max_marks}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Upcoming Items (Homework & Exams) */}
              <div style={{ background: '#fff', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 12px 0' }}>{t('Upcoming in Next 7 Days', 'اگلے 7 دنوں کے اہم امور')}</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {overviewData.upcoming_homework?.map((hw: any) => (
                    <div key={hw.id} style={{ fontSize: '13px', padding: '8px 12px', background: '#eff6ff', borderRadius: '6px', color: '#1e40af' }}>
                      <b>Homework:</b> {hw.title} ({hw.subject}) • Due: {hw.due_date}
                    </div>
                  ))}
                  {overviewData.upcoming_assessments?.map((ass: any) => (
                    <div key={ass.id} style={{ fontSize: '13px', padding: '8px 12px', background: '#fdf4ff', borderRadius: '6px', color: '#86198f' }}>
                      <b>Assessment:</b> {ass.title} ({ass.subject}) • Date: {ass.date}
                    </div>
                  ))}
                  {(!overviewData.upcoming_homework?.length && !overviewData.upcoming_assessments?.length) && (
                    <p style={{ color: '#94a3b8', fontSize: '13px' }}>{t('No upcoming deadlines scheduled.', 'کوئی آنے والی ڈیڈ لائن مقرر نہیں ہے')}</p>
                  )}
                </div>
              </div>

              {/* Commendations */}
              <div style={{ background: '#fff', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 12px 0', display: 'flex', alignItems: 'center', gap: '6px', color: '#b45309' }}>
                  <Award size={18} />
                  <span>{t('Positive Commendations', 'اساتذہ کے مثبت تبصرے')}</span>
                </h3>
                {overviewData.positive_shoutouts?.length === 0 ? (
                  <p style={{ color: '#94a3b8', fontSize: '13px' }}>{t('Regular classroom observations ongoing.', 'معمول کے مشاہدات جاری ہیں')}</p>
                ) : (
                  overviewData.positive_shoutouts?.map((s: any, idx: number) => (
                    <div key={idx} style={{ padding: '10px 14px', background: '#fefce8', border: '1px solid #fef08a', borderRadius: '8px', fontSize: '13px', color: '#854d0e', marginBottom: '8px' }}>
                      "{s.note}" — <i>{s.subject} ({s.date})</i>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB B: RESULTS & PROGRESS (AQI LEVEL 5) */}
          {!childLoading && activeTab === 'results' && resultsData && (
            <div>
              {/* Aggregates Comparison Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                {/* Child Overall */}
                <div style={{ background: '#fff', padding: '18px', borderRadius: '10px', border: '1px solid #cbd5e1' }}>
                  <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>{t('CHILD OVERALL AVERAGE', 'طالب علم کی مجموعی کارکردگی')}</div>
                  <div style={{ fontSize: '26px', fontWeight: 700, color: '#334155', marginTop: '4px' }}>
                    {resultsData.overall_percentage !== null ? `${resultsData.overall_percentage}%` : '—'}
                  </div>
                  <span style={{ fontSize: '12px', color: '#64748b' }}>{activeChild.full_name}</span>
                </div>

                {/* Class Average */}
                <div style={{ background: '#fff', padding: '18px', borderRadius: '10px', border: '1px solid #cbd5e1' }}>
                  <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>{t('CLASS AVERAGE', 'کلاس اوسط')}</div>
                  <div style={{ fontSize: '26px', fontWeight: 700, color: '#94a3b8', marginTop: '4px' }}>
                    {resultsData.class_average !== null ? `${resultsData.class_average}%` : '—'}
                  </div>
                  {resultsData.difference !== null && (
                    <div style={{
                      fontSize: '12px',
                      fontWeight: 600,
                      color: resultsData.difference >= 0 ? '#16a34a' : '#ea580c',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}>
                      {resultsData.difference >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                      <span>{resultsData.difference > 0 ? `+${resultsData.difference}` : resultsData.difference} pp vs class</span>
                    </div>
                  )}
                </div>

                {/* Boys Average */}
                <div style={{ background: '#fff', padding: '18px', borderRadius: '10px', border: '1px solid #bfdbfe' }}>
                  <div style={{ fontSize: '12px', color: '#2563eb', fontWeight: 600 }}>{t('BOYS AVERAGE', 'لڑکوں کی اوسط')}</div>
                  {resultsData.boys_privacy_notice ? (
                    <div style={{ fontSize: '13px', color: '#64748b', marginTop: '8px' }}>{resultsData.boys_privacy_notice}</div>
                  ) : (
                    <div style={{ fontSize: '26px', fontWeight: 700, color: '#3b82f6', marginTop: '4px' }}>
                      {resultsData.boys_class_average !== null ? `${resultsData.boys_class_average}%` : '—'}
                    </div>
                  )}
                  <span style={{ fontSize: '11px', color: '#94a3b8' }}>{t('Anonymous aggregate', 'گمنام مجموعی ڈیٹا')}</span>
                </div>

                {/* Girls Average */}
                <div style={{ background: '#fff', padding: '18px', borderRadius: '10px', border: '1px solid #fbcfe8' }}>
                  <div style={{ fontSize: '12px', color: '#db2777', fontWeight: 600 }}>{t('GIRLS AVERAGE', 'لڑکیوں کی اوسط')}</div>
                  {resultsData.girls_privacy_notice ? (
                    <div style={{ fontSize: '13px', color: '#64748b', marginTop: '8px' }}>{resultsData.girls_privacy_notice}</div>
                  ) : (
                    <div style={{ fontSize: '26px', fontWeight: 700, color: '#ec4899', marginTop: '4px' }}>
                      {resultsData.girls_class_average !== null ? `${resultsData.girls_class_average}%` : '—'}
                    </div>
                  )}
                  <span style={{ fontSize: '11px', color: '#94a3b8' }}>{t('Anonymous aggregate', 'گمنام مجموعی ڈیٹا')}</span>
                </div>
              </div>

              {/* Anonymous Histogram Distribution */}
              {resultsData.histogram && resultsData.histogram.length > 0 && (
                <div style={{ background: '#fff', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '24px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>
                        {t('Class Performance Distribution (Anonymous)', 'کلاس کی عمومی کارکردگی کا جائزہ')}
                      </h3>
                      <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#64748b' }}>
                        {t('Shows where your child stands relative to the class distribution. Individual classmates remain anonymous.', 'آپ کے بچے کی پوزیشن گرے رنگ میں نمایاں کی گئی ہے۔')}
                      </p>
                    </div>

                    <div style={{ display: 'flex', gap: '12px', fontSize: '12px', alignItems: 'center' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ width: '12px', height: '12px', background: '#6b7280', borderRadius: '3px' }} />
                        <span>{t('Child Band', 'بچے کی بریکٹ')}</span>
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ width: '12px', height: '12px', background: '#cbd5e1', borderRadius: '3px' }} />
                        <span>{t('Classmates', 'دیگر طلباء')}</span>
                      </span>
                    </div>
                  </div>

                  <div style={{ width: '100%', height: '220px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={resultsData.histogram} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="band" tick={{ fontSize: 12, fill: '#64748b' }} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                        <Tooltip
                          formatter={(value: any, name: any, item: any) => [
                            `${value} students in band`,
                            item.payload.is_child_band ? `${activeChild.full_name} is in this band` : 'Score Range'
                          ]}
                        />
                        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                          {resultsData.histogram.map((entry: any, index: number) => (
                            <Cell key={`cell-${index}`} fill={entry.is_child_band ? '#6b7280' : '#cbd5e1'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Subject Breakdown Table */}
              <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0' }}>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>{t('Subject Performance Breakdown', 'مضامین کی تفصیلی کارکردگی')}</h3>
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', color: '#64748b', fontSize: '12px', borderBottom: '1px solid #e2e8f0' }}>
                        <th style={{ padding: '12px 20px' }}>{t('Subject', 'مضمون')}</th>
                        <th style={{ padding: '12px' }}>{t('Current Score', 'حاصل کردہ اسکور')}</th>
                        <th style={{ padding: '12px' }}>{t('Class Average', 'کلاس اوسط')}</th>
                        <th style={{ padding: '12px' }}>{t('Difference', 'فرق')}</th>
                        <th style={{ padding: '12px 20px' }}>{t('Status', 'حیثیت')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resultsData.subjects?.length === 0 ? (
                        <tr>
                          <td colSpan={5} style={{ padding: '30px', textAlign: 'center', color: '#94a3b8' }}>
                            {t('No subject evaluations recorded yet.', 'کوئی مضمون کا ڈیٹا موجود نہیں')}
                          </td>
                        </tr>
                      ) : (
                        resultsData.subjects?.map((subj: any, i: number) => {
                          const diff = subj.difference;
                          return (
                            <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                              <td style={{ padding: '12px 20px', fontWeight: 600, color: '#1e293b' }}>
                                {subj.subject_name}
                              </td>
                              <td style={{ padding: '12px', fontWeight: 700, color: '#0f172a' }}>
                                {subj.final_percentage !== null ? `${subj.final_percentage}%` : '—'}
                              </td>
                              <td style={{ padding: '12px', color: '#64748b' }}>
                                {subj.class_subject_average !== null ? `${subj.class_subject_average}%` : '—'}
                              </td>
                              <td style={{ padding: '12px', fontWeight: 600 }}>
                                {diff !== null && diff !== undefined ? (
                                  <span style={{ color: diff >= 0 ? '#16a34a' : '#ea580c' }}>
                                    {diff > 0 ? `+${diff}` : diff} pp
                                  </span>
                                ) : '—'}
                              </td>
                              <td style={{ padding: '12px 20px' }}>
                                <span style={{
                                  padding: '3px 8px',
                                  borderRadius: '6px',
                                  fontSize: '12px',
                                  fontWeight: 600,
                                  background: subj.status === 'complete' ? '#dcfce7' : '#f1f5f9',
                                  color: subj.status === 'complete' ? '#15803d' : '#475569'
                                }}>
                                  {subj.status || 'In Progress'}
                                </span>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB C: ATTENDANCE */}
          {!childLoading && activeTab === 'attendance' && attendanceData && (
            <div>
              {/* Summary Stats */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                <div style={{ background: '#fff', padding: '18px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>{t('ATTENDANCE RATE', 'حاضری فیصد')}</div>
                  <div style={{
                    fontSize: '28px',
                    fontWeight: 700,
                    color: attendanceData.in_warning_zone ? '#dc2626' : '#16a34a',
                    marginTop: '4px'
                  }}>
                    {attendanceData.attendance_rate}%
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>
                    {t('School minimum target:', 'اسکول کا کم از کم ہدف:')} {attendanceData.school_target}%
                  </div>
                </div>

                <div style={{ background: '#fff', padding: '18px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>{t('PRESENT DAYS', 'موجود دن')}</div>
                  <div style={{ fontSize: '28px', fontWeight: 700, color: '#16a34a', marginTop: '4px' }}>
                    {attendanceData.present}
                  </div>
                  <span style={{ fontSize: '11px', color: '#94a3b8' }}>{t(`Out of ${attendanceData.total_sessions} days`, `کل ${attendanceData.total_sessions} دنوں میں سے`)}</span>
                </div>

                <div style={{ background: '#fff', padding: '18px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>{t('UNEXCUSED ABSENCES', 'غیر حاضریاں')}</div>
                  <div style={{ fontSize: '28px', fontWeight: 700, color: '#dc2626', marginTop: '4px' }}>
                    {attendanceData.absent}
                  </div>
                  <span style={{ fontSize: '11px', color: '#94a3b8' }}>{t('Requires review', 'توجہ طلب')}</span>
                </div>

                <div style={{ background: '#fff', padding: '18px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>{t('LATE ARRIVALS', 'تاخیر سے آمد')}</div>
                  <div style={{ fontSize: '28px', fontWeight: 700, color: '#d97706', marginTop: '4px' }}>
                    {attendanceData.late}
                  </div>
                  <span style={{ fontSize: '11px', color: '#94a3b8' }}>{t('Arrived after bell', 'بیل کے بعد')}</span>
                </div>
              </div>

              {/* Warning zone banner */}
              {attendanceData.in_warning_zone && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '14px 18px', color: '#991b1b', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <AlertTriangle size={20} />
                  <div>
                    <b>{t('Attendance Alert Notice:', 'حاضری میں کمی کا انتباہ:')}</b>
                    <span style={{ marginLeft: '6px' }}>
                      {t(`Attendance is currently ${attendanceData.attendance_rate}%, which is below the school requirement of ${attendanceData.school_target}%. Regular attendance is essential for success.`, `طالب علم کی حاضری ${attendanceData.attendance_rate} فیصد ہے جو کہ مطلوبہ معیار سے کم ہے۔`)}
                    </span>
                  </div>
                </div>
              )}

              {/* Attendance Table */}
              <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0' }}>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>{t('Daily Attendance Register', 'روزانہ حاضری کا رجسٹر')}</h3>
                </div>

                <div style={{ overflowX: 'auto', maxHeight: '350px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                    <thead style={{ position: 'sticky', top: 0, background: '#f8fafc' }}>
                      <tr style={{ color: '#64748b', fontSize: '12px', borderBottom: '1px solid #e2e8f0' }}>
                        <th style={{ padding: '10px 20px' }}>{t('Date', 'تاریخ')}</th>
                        <th style={{ padding: '10px' }}>{t('Status', 'حیثیت')}</th>
                        <th style={{ padding: '10px 20px' }}>{t('Notes / Remarks', 'ریمارکس')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {attendanceData.records?.length === 0 ? (
                        <tr><td colSpan={3} style={{ padding: '20px', textAlign: 'center', color: '#94a3b8' }}>{t('No attendance records available.', 'کوئی ریکارڈ نہیں ملا')}</td></tr>
                      ) : (
                        attendanceData.records?.map((r: any, idx: number) => {
                          const statusColor = r.status === 'present' ? '#16a34a' : (r.status === 'absent' ? '#dc2626' : (r.status === 'late' ? '#d97706' : '#2563eb'));
                          return (
                            <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                              <td style={{ padding: '10px 20px', fontWeight: 600 }}>{r.date}</td>
                              <td style={{ padding: '10px' }}>
                                <span style={{ color: statusColor, fontWeight: 700, textTransform: 'capitalize' }}>
                                  {r.status}
                                </span>
                              </td>
                              <td style={{ padding: '10px 20px', color: '#64748b' }}>{r.notes || '—'}</td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB D: RISK & SUPPORT */}
          {!childLoading && activeTab === 'risk' && riskData && (
            <div>
              <div style={{ marginBottom: '20px' }}>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>{t('Support & Guidance Alerts', 'طالب علم کی رہنمائی اور معاونت')}</h3>
                <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b' }}>
                  {t('The school identifies areas where students might benefit from extra practice or guidance. These are opportunities for partnership, not disciplinary actions.', 'اسکول طالب علم کی بہتری کے لیے تجاویز پیش کرتا ہے۔')}
                </p>
              </div>

              {/* Active Alerts */}
              {riskData.active_alerts?.length === 0 ? (
                <div style={{ padding: '36px', textAlign: 'center', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '12px', marginBottom: '24px' }}>
                  <CheckCircle2 size={36} color="#16a34a" style={{ margin: '0 auto 10px auto' }} />
                  <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#166534' }}>
                    {t('Everything is on Track', 'تمام معاملات تسلی بخش ہیں')}
                  </h4>
                  <p style={{ margin: '6px 0 0 0', fontSize: '13px', color: '#15803d' }}>
                    {t('There are no active attendance or academic risk alerts for this student.', 'اس طالب علم کے لیے کوئی فعال انتباہ موجود نہیں ہے۔')}
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '32px' }}>
                  {riskData.active_alerts?.map((alert: any) => (
                    <div
                      key={alert.id}
                      style={{
                        background: '#fff',
                        border: alert.severity === 'high' ? '2px solid #fca5a5' : '1px solid #fed7aa',
                        borderRadius: '12px',
                        padding: '20px'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                            <span style={{
                              background: alert.severity === 'high' ? '#fee2e2' : '#ffedd5',
                              color: alert.severity === 'high' ? '#b91c1c' : '#c2410c',
                              fontSize: '11px',
                              fontWeight: 700,
                              padding: '2px 8px',
                              borderRadius: '6px',
                              textTransform: 'uppercase'
                            }}>
                              {alert.alert_type} • {alert.severity}
                            </span>
                            <span style={{ fontSize: '12px', color: '#64748b' }}>{alert.created_at.slice(0, 10)}</span>
                          </div>
                          <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>{alert.title}</h4>
                        </div>

                        {alert.status !== 'acknowledged' ? (
                          <button
                            onClick={() => handleAcknowledgeAlert(alert.id)}
                            style={{
                              padding: '6px 14px',
                              background: '#2563eb',
                              color: '#fff',
                              border: 'none',
                              borderRadius: '6px',
                              fontSize: '12px',
                              fontWeight: 600,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px'
                            }}
                          >
                            <Check size={14} />
                            <span>{t('I have reviewed this alert', 'میں نے پڑھ لیا ہے')}</span>
                          </button>
                        ) : (
                          <span style={{ fontSize: '12px', color: '#16a34a', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <CheckCircle2 size={15} />
                            <span>{t('Acknowledged', 'تسلیم شدہ')}</span>
                          </span>
                        )}
                      </div>

                      <p style={{ margin: '12px 0', fontSize: '14px', color: '#334155', lineHeight: 1.5 }}>
                        {alert.description}
                      </p>

                      {alert.suggested_action && (
                        <div style={{ background: '#f8fafc', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', color: '#475569' }}>
                          <b>{t('Recommended action:', 'تجویز کردہ اقدام:')}</b> {alert.suggested_action}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Past Resolved Alerts */}
              {riskData.past_alerts?.length > 0 && (
                <div>
                  <h4 style={{ fontSize: '15px', fontWeight: 700, color: '#475569', marginBottom: '12px' }}>
                    {t('Past Resolved Alerts', 'ماضی کے حل شدہ انتباہات')}
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {riskData.past_alerts?.map((a: any) => (
                      <div key={a.id} style={{ padding: '10px 14px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <span style={{ fontWeight: 600, fontSize: '13px', color: '#334155' }}>{a.title}</span>
                          <span style={{ fontSize: '11px', color: '#94a3b8', marginLeft: '8px' }}>Resolved on {a.resolved_at?.slice(0, 10)}</span>
                        </div>
                        <span style={{ fontSize: '11px', color: '#16a34a', fontWeight: 700 }}>RESOLVED</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB E: TEACHERS & COMMUNICATION */}
          {!childLoading && activeTab === 'teachers' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>{t('Teaching Faculty', 'کلاس اور مضامین کے اساتذہ')}</h3>
                  <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b' }}>
                    {t('Request a call-back or message teachers for academic questions.', 'اساتذہ سے بات چیت کے لیے کال بیک کی درخواست کریں۔')}
                  </p>
                </div>

                <button
                  onClick={() => setShowCallbackModal(true)}
                  style={{
                    padding: '8px 16px',
                    background: '#2563eb',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <PhoneCall size={16} />
                  <span>{t('Request Call-Back', 'کال بیک کی درخواست کریں')}</span>
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
                {teachersData.map((tItem: any) => (
                  <div
                    key={tItem.id}
                    style={{
                      background: '#fff',
                      border: tItem.is_homeroom ? '2px solid #93c5fd' : '1px solid #e2e8f0',
                      borderRadius: '10px',
                      padding: '16px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between'
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 700 }}>{tItem.name}</h4>
                        {tItem.is_homeroom && (
                          <span style={{ background: '#dbeafe', color: '#1e40af', fontSize: '10px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px' }}>
                            HOMEROOM
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '13px', color: '#64748b', marginTop: '2px' }}>
                        {tItem.role} • {tItem.subject}
                      </div>

                      {tItem.email && (
                        <div style={{ fontSize: '12px', color: '#2563eb', marginTop: '10px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Mail size={13} />
                          <span>{tItem.email}</span>
                        </div>
                      )}
                    </div>

                    <button
                      onClick={() => {
                        setCallbackTeacherId(tItem.id);
                        setShowCallbackModal(true);
                      }}
                      style={{
                        marginTop: '16px',
                        padding: '6px 12px',
                        background: '#f8fafc',
                        border: '1px solid #cbd5e1',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 600,
                        color: '#334155',
                        cursor: 'pointer'
                      }}
                    >
                      {t('Request Contact', 'رابطہ کی درخواست')}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB F: HOMEWORK */}
          {!childLoading && activeTab === 'homework' && (
            <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0' }}>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>{t('Assigned Homework', 'تفویض کردہ ہوم ورک')}</h3>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', color: '#64748b', fontSize: '12px', borderBottom: '1px solid #e2e8f0' }}>
                      <th style={{ padding: '12px 20px' }}>{t('Title & Subject', 'عنوان اور مضمون')}</th>
                      <th style={{ padding: '12px' }}>{t('Due Date', 'آخری تاریخ')}</th>
                      <th style={{ padding: '12px' }}>{t('Status', 'حیثیت')}</th>
                      <th style={{ padding: '12px 20px' }}>{t('Marks / Feedback', 'نمبر اور تبصرہ')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {homeworkData.length === 0 ? (
                      <tr><td colSpan={4} style={{ padding: '30px', textAlign: 'center', color: '#94a3b8' }}>{t('No homework assignments found.', 'کوئی ہوم ورک نہیں ملا')}</td></tr>
                    ) : (
                      homeworkData.map(hw => (
                        <tr key={hw.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '12px 20px' }}>
                            <div style={{ fontWeight: 600, color: '#1e293b' }}>{hw.title}</div>
                            <div style={{ fontSize: '11px', color: '#64748b' }}>{hw.subject_name}</div>
                          </td>
                          <td style={{ padding: '12px', color: '#475569' }}>{hw.due_date}</td>
                          <td style={{ padding: '12px' }}>
                            <span style={{
                              padding: '2px 8px',
                              borderRadius: '6px',
                              fontSize: '11px',
                              fontWeight: 600,
                              background: hw.submission_status === 'submitted' ? '#dcfce7' : (hw.submission_status === 'overdue' ? '#fee2e2' : '#fef3c7'),
                              color: hw.submission_status === 'submitted' ? '#15803d' : (hw.submission_status === 'overdue' ? '#b91c1c' : '#b45309'),
                              textTransform: 'capitalize'
                            }}>
                              {hw.submission_status}
                            </span>
                          </td>
                          <td style={{ padding: '12px 20px', color: '#64748b' }}>
                            {hw.score !== null ? <b>{hw.score} pts</b> : '—'} {hw.teacher_feedback ? `• ${hw.teacher_feedback}` : ''}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB G: FEES */}
          {!childLoading && activeTab === 'fees' && feesData && (
            <div>
              {!feesData.fees_enabled ? (
                <div style={{ padding: '36px', textAlign: 'center', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px' }}>
                  <FileText size={36} color="#94a3b8" style={{ margin: '0 auto 10px auto' }} />
                  <p style={{ color: '#64748b', fontSize: '14px' }}>{feesData.message || 'Fee tracking is managed offline by the school office.'}</p>
                </div>
              ) : (
                <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                  <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0' }}>
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>{t('Term Fee Vouchers', 'فیس واؤچرز')}</h3>
                  </div>

                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                      <thead>
                        <tr style={{ background: '#f8fafc', color: '#64748b', fontSize: '12px', borderBottom: '1px solid #e2e8f0' }}>
                          <th style={{ padding: '12px 20px' }}>{t('Voucher #', 'واؤچر نمبر')}</th>
                          <th style={{ padding: '12px' }}>{t('Term', 'مدت')}</th>
                          <th style={{ padding: '12px' }}>{t('Total Amount', 'کل رقم')}</th>
                          <th style={{ padding: '12px' }}>{t('Due Date', 'آخری تاریخ')}</th>
                          <th style={{ padding: '12px 20px' }}>{t('Payment Status', 'حیثیت ادائیگی')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {feesData.vouchers?.map((vch: any, idx: number) => (
                          <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '12px 20px', fontWeight: 600 }}>{vch.voucher_no}</td>
                            <td style={{ padding: '12px', color: '#475569' }}>{vch.term}</td>
                            <td style={{ padding: '12px', fontWeight: 700, color: '#0f172a' }}>PKR {vch.total_amount.toLocaleString()}</td>
                            <td style={{ padding: '12px', color: '#64748b' }}>{vch.due_date}</td>
                            <td style={{ padding: '12px 20px' }}>
                              <span style={{
                                padding: '3px 8px',
                                borderRadius: '6px',
                                fontSize: '12px',
                                fontWeight: 700,
                                background: vch.status === 'Paid' ? '#dcfce7' : '#fee2e2',
                                color: vch.status === 'Paid' ? '#15803d' : '#b91c1c'
                              }}>
                                {vch.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* MODAL: CALL-BACK REQUEST                                      */}
      {/* ------------------------------------------------------------- */}
      {showCallbackModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }}>
          <div style={{ background: '#fff', borderRadius: '12px', width: '100%', maxWidth: '480px', padding: '24px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>{t('Request Teacher Call-Back', 'استاد سے رابطہ کی درخواست')}</h3>
              <button onClick={() => setShowCallbackModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmitCallback} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                  {t('Select Teacher', 'استاد منتخب کریں')}
                </label>
                <select
                  value={callbackTeacherId}
                  onChange={e => setCallbackTeacherId(e.target.value ? Number(e.target.value) : '')}
                  required
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                >
                  <option value="">{t('-- Choose a teacher --', '-- استاد منتخب کریں --')}</option>
                  {teachersData.map(t => (
                    <option key={t.id} value={t.id}>{t.name} ({t.role} - {t.subject})</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                  {t('Topic', 'موضوع')}
                </label>
                <select
                  value={callbackTopic}
                  onChange={e => setCallbackTopic(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                >
                  <option value="academic">{t('Academic Progress', 'تعلیمی پیشرفت')}</option>
                  <option value="attendance">{t('Attendance / Leave', 'حاضری یا رخصت')}</option>
                  <option value="wellbeing">{t('Wellbeing & Behaviour', 'رویہ و فلاح')}</option>
                  <option value="general">{t('General Inquiry', 'عمومی معلومات')}</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                  {t('Preferred Contact Time', 'رابطے کا ترجیحی وقت')}
                </label>
                <select
                  value={callbackTime}
                  onChange={e => setCallbackTime(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                >
                  <option value="morning">{t('Morning (8:00 AM - 11:00 AM)', 'صبح')}</option>
                  <option value="afternoon">{t('Afternoon (1:00 PM - 3:00 PM)', 'دوپہر')}</option>
                  <option value="anytime">{t('Anytime during school hours', 'اسکول کے اوقات میں کسی بھی وقت')}</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                  {t('Brief Message Note', 'مختصر پیغام')}
                </label>
                <textarea
                  value={callbackMessage}
                  onChange={e => setCallbackMessage(e.target.value)}
                  rows={3}
                  required
                  placeholder={t('Please mention the specific question or concern...', 'اپنی بات کی وضاحت کریں...')}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowCallbackModal(false)}
                  style={{ padding: '8px 14px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff', fontSize: '13px', cursor: 'pointer' }}
                >
                  {t('Cancel', 'منسوخ')}
                </button>
                <button
                  type="submit"
                  disabled={submittingCallback}
                  style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: '#2563eb', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
                >
                  {submittingCallback ? t('Sending...', 'بھیجا جا رہا ہے...') : t('Submit Request', 'درخواست جمع کروائیں')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* MODAL: PRINTABLE REPORT CARD                                  */}
      {/* ------------------------------------------------------------- */}
      {showReportCardModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }}>
          <div style={{ background: '#fff', borderRadius: '12px', width: '100%', maxWidth: '720px', maxHeight: '90vh', overflowY: 'auto', padding: '32px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => window.print()}
                  style={{ padding: '6px 12px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <Printer size={15} />
                  <span>{t('Print / Save PDF', 'پرنٹ یا محفوظ کریں')}</span>
                </button>
              </div>
              <button onClick={() => setShowReportCardModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>
                <X size={20} />
              </button>
            </div>

            {loadingReportCard ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
                <RefreshCw className="animate-spin" size={24} style={{ margin: '0 auto 8px auto' }} />
                <p>Generating report card...</p>
              </div>
            ) : reportCardData ? (
              <div id="printable-report-card">
                {/* Official Header */}
                <div style={{ textAlign: 'center', borderBottom: '2px solid #0f172a', paddingBottom: '16px', marginBottom: '20px' }}>
                  <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#0f172a' }}>{reportCardData.school_name}</h2>
                  <div style={{ fontSize: '13px', color: '#475569', marginTop: '2px' }}>Student Academic & Behavioural Progress Summary</div>
                  <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>Date Issued: {reportCardData.generated_date}</div>
                </div>

                {/* Student Credentials Row */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', background: '#f8fafc', padding: '14px', borderRadius: '8px', marginBottom: '20px', fontSize: '13px' }}>
                  <div><b>Student Name:</b> {reportCardData.student_name}</div>
                  <div><b>Roll / Admission #:</b> {reportCardData.admission_number}</div>
                  <div><b>Class / Section:</b> {reportCardData.class_name}</div>
                  <div><b>Attendance Rate:</b> {reportCardData.attendance_percentage}%</div>
                </div>

                {/* Subject Summary Table */}
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', marginBottom: '24px' }}>
                  <thead>
                    <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #cbd5e1', textAlign: 'left' }}>
                      <th style={{ padding: '8px 12px' }}>Subject</th>
                      <th style={{ padding: '8px 12px' }}>Student Score</th>
                      <th style={{ padding: '8px 12px' }}>Class Benchmark</th>
                      <th style={{ padding: '8px 12px' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportCardData.subjects?.map((s: any, idx: number) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '8px 12px', fontWeight: 600 }}>{s.subject_name}</td>
                        <td style={{ padding: '8px 12px', fontWeight: 700 }}>{s.final_percentage !== null ? `${s.final_percentage}%` : '—'}</td>
                        <td style={{ padding: '8px 12px', color: '#64748b' }}>{s.class_subject_average !== null ? `${s.class_subject_average}%` : '—'}</td>
                        <td style={{ padding: '8px 12px' }}>{s.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Overall Summary Strip */}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', background: '#eff6ff', borderRadius: '8px', marginBottom: '28px', fontSize: '14px' }}>
                  <span><b>Cumulative Standing:</b> {reportCardData.overall_percentage !== null ? `${reportCardData.overall_percentage}%` : '—'}</span>
                  <span><b>Class Average:</b> {reportCardData.class_average !== null ? `${reportCardData.class_average}%` : '—'}</span>
                </div>

                {/* Signatures */}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '40px', paddingTop: '20px', borderTop: '1px solid #e2e8f0', fontSize: '12px', color: '#64748b' }}>
                  <div style={{ textAlign: 'center', width: '200px' }}>
                    <div style={{ borderBottom: '1px solid #cbd5e1', height: '30px', marginBottom: '6px' }} />
                    <span>Homeroom Teacher</span>
                  </div>
                  <div style={{ textAlign: 'center', width: '200px' }}>
                    <div style={{ borderBottom: '1px solid #cbd5e1', height: '30px', marginBottom: '6px' }} />
                    <span>Head of School / Principal</span>
                  </div>
                </div>

                <div style={{ marginTop: '24px', fontSize: '10px', color: '#94a3b8', textAlign: 'center' }}>
                  {reportCardData.disclaimer}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
