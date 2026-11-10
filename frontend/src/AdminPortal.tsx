import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Building2, Users, DollarSign, Calendar, Clock, Crown, BookOpen,
  ShieldCheck, CheckCircle2, AlertCircle, XCircle, Search, RefreshCw,
  X, ChevronRight, BarChart3, TrendingUp, Layers, Check, FileText,
  ArrowRight, Eye, ShieldAlert, Key, Mail, Lock, LogOut, ExternalLink,
  SlidersHorizontal, Percent, CreditCard, Sparkles, AlertTriangle
} from 'lucide-react';
import { request, login, type User } from './api';

export interface AdminPortalProps {
  user: User;
  notify?: (msg: string, type?: 'success' | 'error' | 'info') => void;
  onSignOut?: () => void;
  onGoToApp?: () => void;
}

type TabType = 'directory' | 'finance' | 'orders' | 'security';

export default function AdminPortal({ user, notify, onSignOut, onGoToApp }: AdminPortalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('directory');
  const [schools, setSchools] = useState<any[]>([]);
  const [loadingSchools, setLoadingSchools] = useState(false);
  const [analytics, setAnalytics] = useState<any | null>(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);
  const [orders, setOrders] = useState<any[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [ordersFilter, setOrdersFilter] = useState<string>('all');
  const [currencyMode, setCurrencyMode] = useState<'USD' | 'PKR'>('USD');

  // Search & Filter state for Directory
  const [searchQuery, setSearchQuery] = useState('');
  const [planFilter, setPlanFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  // Modals
  const [alterModalSchool, setAlterModalSchool] = useState<any | null>(null);
  const [alterPlanCode, setAlterPlanCode] = useState('free');
  const [alterStatus, setAlterStatus] = useState('active');
  const [alterPaidUntil, setAlterPaidUntil] = useState('');
  const [alterStudentOverride, setAlterStudentOverride] = useState<number | ''>('');
  const [alterNotes, setAlterNotes] = useState('');
  const [savingAlter, setSavingAlter] = useState(false);

  const [detailsModalSchool, setDetailsModalSchool] = useState<any | null>(null);
  const [receiptModalOrder, setReceiptModalOrder] = useState<any | null>(null);
  const [orderActionModal, setOrderActionModal] = useState<{ order: any; type: 'approve' | 'reject' } | null>(null);
  const [orderActionNote, setOrderActionNote] = useState('');
  const [processingOrderAction, setProcessingOrderAction] = useState(false);

  // Security tab state (Support grants & Invitations)
  const [grants, setGrants] = useState<any[]>([]);
  const [invites, setInvites] = useState<any[]>([]);
  const [inviteModal, setInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('teacher');
  const [generatedInviteLink, setGeneratedInviteLink] = useState('');

  const sendNotification = useCallback((msg: string, type: 'success' | 'error' | 'info' = 'info') => {
    if (notify) notify(msg, type);
    else alert(msg);
  }, [notify]);

  // Load Schools Directory
  const loadSchools = useCallback(async () => {
    setLoadingSchools(true);
    try {
      const res = await request<{ results: any[] }>('platform-admin/billing/schools/');
      setSchools(res?.results || []);
    } catch (err) {
      sendNotification(err instanceof Error ? err.message : 'Could not fetch school subscribers', 'error');
    } finally {
      setLoadingSchools(false);
    }
  }, [sendNotification]);

  // Load Financial Analytics
  const loadAnalytics = useCallback(async () => {
    setLoadingAnalytics(true);
    try {
      const res = await request<any>('platform-admin/billing/finance-analytics/');
      setAnalytics(res);
    } catch (err) {
      sendNotification(err instanceof Error ? err.message : 'Could not fetch financial analytics', 'error');
    } finally {
      setLoadingAnalytics(false);
    }
  }, [sendNotification]);

  // Load Orders Queue
  const loadOrders = useCallback(async () => {
    setLoadingOrders(true);
    try {
      const qs = ordersFilter !== 'all' ? `?status=${ordersFilter}` : '';
      const res = await request<{ results: any[] }>(`platform-admin/billing/orders/${qs}`);
      setOrders(res?.results || []);
    } catch (err) {
      sendNotification(err instanceof Error ? err.message : 'Could not fetch orders', 'error');
    } finally {
      setLoadingOrders(false);
    }
  }, [ordersFilter, sendNotification]);

  // Load Security Grants & Invites
  const loadSecurity = useCallback(async () => {
    try {
      const [grantsRes, invitesRes] = await Promise.all([
        request<any>('platform/support-grants/').catch(() => ({ results: [] })),
        request<any>('invitations/').catch(() => ({ results: [] })),
      ]);
      setGrants(grantsRes.results || []);
      setInvites(invitesRes.results || []);
    } catch {}
  }, []);

  const refreshAll = useCallback(() => {
    loadSchools();
    loadAnalytics();
    loadOrders();
    loadSecurity();
  }, [loadSchools, loadAnalytics, loadOrders, loadSecurity]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  // Open Alter Modal
  const handleOpenAlterModal = (school: any) => {
    setAlterModalSchool(school);
    setAlterPlanCode(school.plan_code || 'free');
    setAlterStatus(school.status || 'active');
    setAlterPaidUntil(school.paid_until ? school.paid_until.substring(0, 10) : '');
    setAlterStudentOverride(school.active_students || 0);
    setAlterNotes('');
  };

  // Submit Alter Subscription
  const handleSaveAlteration = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!alterModalSchool) return;

    setSavingAlter(true);
    try {
      const payload: any = {
        plan_code: alterPlanCode,
        status: alterStatus,
        notes: alterNotes || 'Package alteration by website owner',
      };
      if (alterPaidUntil) {
        payload.paid_until = alterPaidUntil;
      } else {
        payload.paid_until = null;
      }
      if (alterStudentOverride !== '') {
        payload.active_students_override = Number(alterStudentOverride);
      }

      await request(`platform-admin/billing/schools/${alterModalSchool.school_id}/alter/`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      sendNotification(`Plan for ${alterModalSchool.school_name} successfully updated to ${alterPlanCode.toUpperCase()} (${alterStatus.toUpperCase()})!`, 'success');
      setAlterModalSchool(null);
      loadSchools();
      loadAnalytics();
    } catch (err) {
      sendNotification(err instanceof Error ? err.message : 'Failed to alter subscription', 'error');
    } finally {
      setSavingAlter(false);
    }
  };

  // Quick Extend Helper
  const handleQuickExtend = (days: number) => {
    const base = alterPaidUntil ? new Date(alterPaidUntil) : new Date();
    base.setDate(base.getDate() + days);
    setAlterPaidUntil(base.toISOString().substring(0, 10));
    setAlterStatus('active');
  };

  // Approve or Reject Order
  const handleConfirmOrderAction = async () => {
    if (!orderActionModal) return;
    const { order, type } = orderActionModal;
    setProcessingOrderAction(true);
    try {
      const endpoint = `platform-admin/billing/orders/${order.id}/${type}/`;
      await request(endpoint, {
        method: 'POST',
        body: JSON.stringify({ review_note: orderActionNote || `Order ${type}d by platform owner` }),
      });
      sendNotification(`Order #${order.order_number} has been ${type}d successfully.`, 'success');
      setOrderActionModal(null);
      setOrderActionNote('');
      loadOrders();
      loadSchools();
      loadAnalytics();
    } catch (err) {
      sendNotification(err instanceof Error ? err.message : `Failed to ${type} order`, 'error');
    } finally {
      setProcessingOrderAction(false);
    }
  };

  // Issue New Invitation
  const handleIssueInvitation = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await request<any>('invitations/', {
        method: 'POST',
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      sendNotification(`Invitation link generated for ${res.email}`, 'success');
      setGeneratedInviteLink(`${window.location.origin}${res.invite_url}`);
      setInviteEmail('');
      loadSecurity();
    } catch (err) {
      sendNotification(err instanceof Error ? err.message : 'Failed to generate invitation', 'error');
    }
  };

  // Revoke Support Grant
  const handleRevokeGrant = async (id: number) => {
    try {
      await request(`platform/support-grants/${id}/revoke/`, { method: 'POST' });
      sendNotification('Support access grant revoked.', 'success');
      loadSecurity();
    } catch (err) {
      sendNotification(err instanceof Error ? err.message : 'Failed to revoke grant', 'error');
    }
  };

  // Filtered Schools Directory
  const filteredSchools = useMemo(() => {
    return schools.filter(s => {
      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = s.school_name?.toLowerCase().includes(q);
        const matchesCode = s.school_code?.toLowerCase().includes(q);
        const matchesCity = s.city?.toLowerCase().includes(q);
        const matchesOrg = s.organisation_name?.toLowerCase().includes(q);
        const matchesEmail = s.admin_email?.toLowerCase().includes(q);
        if (!matchesName && !matchesCode && !matchesCity && !matchesOrg && !matchesEmail) {
          return false;
        }
      }
      // Plan filter
      if (planFilter !== 'all') {
        if (planFilter === 'free' && !s.is_trial) return false;
        if (planFilter === 'standard' && (s.plan_code !== 'standard' || s.is_trial)) return false;
        if (planFilter === 'premium' && (s.plan_code !== 'premium' || s.is_trial)) return false;
      }
      // Status filter
      if (statusFilter !== 'all') {
        if (statusFilter === 'trial' && !s.is_trial) return false;
        if (statusFilter === 'active' && (s.status !== 'active' || s.is_trial)) return false;
        if (statusFilter === 'past_due' && s.status !== 'past_due') return false;
        if (statusFilter === 'suspended' && s.status !== 'suspended') return false;
      }
      return true;
    });
  }, [schools, searchQuery, planFilter, statusFilter]);

  // Aggregate KPI summary
  const summaryKpis = useMemo(() => {
    const totalSchoolsCount = schools.length;
    const totalStudentsCount = schools.reduce((acc, s) => acc + (s.active_students || 0), 0);
    const freeCount = schools.filter(s => s.is_trial).length;
    const standardCount = schools.filter(s => !s.is_trial && s.plan_code === 'standard').length;
    const premiumCount = schools.filter(s => !s.is_trial && s.plan_code === 'premium').length;
    const pastDueCount = schools.filter(s => s.status === 'past_due').length;

    const totalRevUsd = analytics?.kpis?.total_revenue_usd || '0.00';
    const totalRevPkr = analytics?.kpis?.total_revenue_pkr || '0.00';
    const mrrUsd = analytics?.kpis?.monthly_run_rate_usd || '0.00';
    const mrrPkr = analytics?.kpis?.monthly_run_rate_pkr || '0.00';

    return {
      totalSchoolsCount,
      totalStudentsCount,
      freeCount,
      standardCount,
      premiumCount,
      pastDueCount,
      totalRevUsd,
      totalRevPkr,
      mrrUsd,
      mrrPkr,
    };
  }, [schools, analytics]);

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', color: '#0f172a', fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* Top Banner & Header */}
      <header style={{
        background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 60%, #4338ca 100%)',
        color: '#ffffff',
        padding: '20px 32px',
        boxShadow: '0 4px 20px -2px rgba(30, 27, 75, 0.25)',
      }}>
        <div style={{ maxWidth: 1400, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: 'rgba(255, 255, 255, 0.15)',
              backdropFilter: 'blur(8px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid rgba(255, 255, 255, 0.25)',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
            }}>
              <ShieldCheck size={26} color="#fbbf24" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: '-0.02em' }}>Optimus Orien</h1>
                <span style={{
                  fontSize: 11,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  background: 'rgba(251, 191, 36, 0.2)',
                  color: '#fbbf24',
                  padding: '3px 8px',
                  borderRadius: 12,
                  border: '1px solid rgba(251, 191, 36, 0.35)',
                }}>
                  Website Owner Portal
                </span>
              </div>
              <p style={{ margin: '3px 0 0', fontSize: 13, color: '#c7d2fe' }}>
                Master Institution Oversight • Package Alterations • Revenue Analytics • Financial Management
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {onGoToApp && (
              <button
                type="button"
                onClick={onGoToApp}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  background: 'rgba(255, 255, 255, 0.1)',
                  color: '#ffffff',
                  border: '1px solid rgba(255, 255, 255, 0.25)',
                  padding: '8px 14px',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <ExternalLink size={15} /> Switch to School Workspace (/app)
              </button>
            )}

            <button
              type="button"
              onClick={refreshAll}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                background: 'rgba(255, 255, 255, 0.1)',
                color: '#ffffff',
                border: '1px solid rgba(255, 255, 255, 0.25)',
                padding: '8px 14px',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              <RefreshCw size={15} /> Refresh
            </button>

            {onSignOut && (
              <button
                type="button"
                onClick={onSignOut}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  background: 'rgba(239, 68, 68, 0.2)',
                  color: '#fca5a5',
                  border: '1px solid rgba(239, 68, 68, 0.35)',
                  padding: '8px 14px',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                <LogOut size={15} /> Sign Out
              </button>
            )}
          </div>
        </div>

        {/* Global Highlight Metrics Bar */}
        <div style={{
          maxWidth: 1400,
          margin: '20px auto 0',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 12,
        }}>
          <div style={{
            background: 'rgba(255, 255, 255, 0.08)',
            backdropFilter: 'blur(8px)',
            borderRadius: 10,
            padding: '12px 16px',
            border: '1px solid rgba(255, 255, 255, 0.15)',
          }}>
            <div style={{ fontSize: 11, color: '#c7d2fe', textTransform: 'uppercase', fontWeight: 600 }}>Total Registered Schools</div>
            <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4, display: 'flex', alignItems: 'baseline', gap: 6 }}>
              {summaryKpis.totalSchoolsCount}
              <span style={{ fontSize: 12, fontWeight: 500, color: '#93c5fd' }}>campuses</span>
            </div>
          </div>

          <div style={{
            background: 'rgba(255, 255, 255, 0.08)',
            backdropFilter: 'blur(8px)',
            borderRadius: 10,
            padding: '12px 16px',
            border: '1px solid rgba(255, 255, 255, 0.15)',
          }}>
            <div style={{ fontSize: 11, color: '#c7d2fe', textTransform: 'uppercase', fontWeight: 600 }}>Total Active Students</div>
            <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4, color: '#6ee7b7' }}>
              {summaryKpis.totalStudentsCount.toLocaleString()}
            </div>
          </div>

          <div style={{
            background: 'rgba(255, 255, 255, 0.08)',
            backdropFilter: 'blur(8px)',
            borderRadius: 10,
            padding: '12px 16px',
            border: '1px solid rgba(255, 255, 255, 0.15)',
          }}>
            <div style={{ fontSize: 11, color: '#c7d2fe', textTransform: 'uppercase', fontWeight: 600 }}>Monthly Run-Rate (MRR)</div>
            <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4, color: '#38bdf8' }}>
              ${summaryKpis.mrrUsd} <span style={{ fontSize: 13, fontWeight: 500, color: '#bae6fd' }}>(Rs {Number(summaryKpis.mrrPkr).toLocaleString()})</span>
            </div>
          </div>

          <div style={{
            background: 'rgba(255, 255, 255, 0.08)',
            backdropFilter: 'blur(8px)',
            borderRadius: 10,
            padding: '12px 16px',
            border: '1px solid rgba(255, 255, 255, 0.15)',
          }}>
            <div style={{ fontSize: 11, color: '#c7d2fe', textTransform: 'uppercase', fontWeight: 600 }}>Total Collected Revenue</div>
            <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4, color: '#fde047' }}>
              ${summaryKpis.totalRevUsd} <span style={{ fontSize: 13, fontWeight: 500, color: '#fef08a' }}>(Rs {Number(summaryKpis.totalRevPkr).toLocaleString()})</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main style={{ maxWidth: 1400, margin: '24px auto', padding: '0 24px' }}>
        {/* Navigation Tabs */}
        <div style={{
          display: 'flex',
          gap: 8,
          borderBottom: '2px solid #e2e8f0',
          marginBottom: 24,
          paddingBottom: 2,
        }}>
          <button
            type="button"
            onClick={() => setActiveTab('directory')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 18px',
              fontSize: 14,
              fontWeight: 600,
              borderRadius: '8px 8px 0 0',
              border: 'none',
              background: activeTab === 'directory' ? '#ffffff' : 'transparent',
              color: activeTab === 'directory' ? '#4338ca' : '#64748b',
              borderBottom: activeTab === 'directory' ? '3px solid #4338ca' : '3px solid transparent',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <Building2 size={16} /> Campuses & Schools Directory
            <span style={{
              background: activeTab === 'directory' ? '#e0e7ff' : '#f1f5f9',
              color: activeTab === 'directory' ? '#4338ca' : '#64748b',
              fontSize: 11,
              padding: '2px 7px',
              borderRadius: 10,
              fontWeight: 700,
            }}>
              {filteredSchools.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('finance')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 18px',
              fontSize: 14,
              fontWeight: 600,
              borderRadius: '8px 8px 0 0',
              border: 'none',
              background: activeTab === 'finance' ? '#ffffff' : 'transparent',
              color: activeTab === 'finance' ? '#4338ca' : '#64748b',
              borderBottom: activeTab === 'finance' ? '3px solid #4338ca' : '3px solid transparent',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <DollarSign size={16} /> Platform Revenue & Charts
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('orders')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 18px',
              fontSize: 14,
              fontWeight: 600,
              borderRadius: '8px 8px 0 0',
              border: 'none',
              background: activeTab === 'orders' ? '#ffffff' : 'transparent',
              color: activeTab === 'orders' ? '#4338ca' : '#64748b',
              borderBottom: activeTab === 'orders' ? '3px solid #4338ca' : '3px solid transparent',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <CreditCard size={16} /> Subscription Orders & Approvals
            {orders.filter(o => o.status === 'pending').length > 0 && (
              <span style={{
                background: '#ef4444',
                color: '#ffffff',
                fontSize: 11,
                padding: '2px 7px',
                borderRadius: 10,
                fontWeight: 700,
              }}>
                {orders.filter(o => o.status === 'pending').length} pending
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('security')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 18px',
              fontSize: 14,
              fontWeight: 600,
              borderRadius: '8px 8px 0 0',
              border: 'none',
              background: activeTab === 'security' ? '#ffffff' : 'transparent',
              color: activeTab === 'security' ? '#4338ca' : '#64748b',
              borderBottom: activeTab === 'security' ? '3px solid #4338ca' : '3px solid transparent',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <Key size={16} /> Governance & Support Grants
          </button>
        </div>

        {/* ============================================================== */}
        {/* TAB 1: CAMPUSES & SCHOOLS DIRECTORY (TRACKING & ALTERATIONS) */}
        {/* ============================================================== */}
        {activeTab === 'directory' && (
          <div>
            {/* Filter and Search Bar */}
            <div style={{
              background: '#ffffff',
              borderRadius: 12,
              padding: '16px 20px',
              border: '1px solid #e2e8f0',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
              display: 'flex',
              flexWrap: 'wrap',
              gap: 14,
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 20,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 260 }}>
                <div style={{ position: 'relative', width: '100%' }}>
                  <Search size={16} color="#94a3b8" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
                  <input
                    type="text"
                    placeholder="Search school name, campus code, city, organisation, or admin email..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '9px 12px 9px 36px',
                      borderRadius: 8,
                      border: '1px solid #cbd5e1',
                      fontSize: 13,
                      outline: 'none',
                      background: '#f8fafc',
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>Plan:</span>
                  <select
                    value={planFilter}
                    onChange={e => setPlanFilter(e.target.value)}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 8,
                      border: '1px solid #cbd5e1',
                      fontSize: 13,
                      background: '#ffffff',
                      cursor: 'pointer',
                    }}
                  >
                    <option value="all">All Plans ({schools.length})</option>
                    <option value="free">30-Day Free Trial ({summaryKpis.freeCount})</option>
                    <option value="standard">Standard Plan ({summaryKpis.standardCount})</option>
                    <option value="premium">Premium Plan ({summaryKpis.premiumCount})</option>
                  </select>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>Status:</span>
                  <select
                    value={statusFilter}
                    onChange={e => setStatusFilter(e.target.value)}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 8,
                      border: '1px solid #cbd5e1',
                      fontSize: 13,
                      background: '#ffffff',
                      cursor: 'pointer',
                    }}
                  >
                    <option value="all">All Statuses</option>
                    <option value="active">Active</option>
                    <option value="trial">30-Day Trial</option>
                    <option value="past_due">Past Due</option>
                    <option value="suspended">Suspended</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Schools Table */}
            <div style={{
              background: '#ffffff',
              borderRadius: 12,
              border: '1px solid #e2e8f0',
              overflow: 'hidden',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
            }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      <th style={{ padding: '14px 16px', fontWeight: 600 }}>School / Campus</th>
                      <th style={{ padding: '14px 16px', fontWeight: 600 }}>Organisation</th>
                      <th style={{ padding: '14px 16px', fontWeight: 600 }}>Students</th>
                      <th style={{ padding: '14px 16px', fontWeight: 600 }}>Current Plan</th>
                      <th style={{ padding: '14px 16px', fontWeight: 600 }}>Status</th>
                      <th style={{ padding: '14px 16px', fontWeight: 600 }}>Days Passed / Left</th>
                      <th style={{ padding: '14px 16px', fontWeight: 600 }}>Monthly Revenue</th>
                      <th style={{ padding: '14px 16px', fontWeight: 600 }}>Total Collected</th>
                      <th style={{ padding: '14px 16px', fontWeight: 600, textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSchools.map((s) => {
                      const isTrial = s.is_trial;
                      const isStandard = !isTrial && s.plan_code === 'standard';
                      const isPremium = !isTrial && s.plan_code === 'premium';

                      return (
                        <tr
                          key={s.school_id}
                          style={{
                            borderBottom: '1px solid #f1f5f9',
                            transition: 'background 0.15s ease',
                          }}
                          onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                          <td style={{ padding: '14px 16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <div style={{
                                width: 34,
                                height: 34,
                                borderRadius: 8,
                                background: isPremium ? '#ede9fe' : (isStandard ? '#e0f2fe' : '#fef3c7'),
                                color: isPremium ? '#6d28d9' : (isStandard ? '#0284c7' : '#d97706'),
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: 700,
                                fontSize: 13,
                              }}>
                                {s.school_name ? s.school_name.charAt(0).toUpperCase() : 'S'}
                              </div>
                              <div>
                                <div style={{ fontWeight: 600, color: '#0f172a' }}>{s.school_name}</div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#64748b', marginTop: 2 }}>
                                  <span style={{ fontFamily: 'monospace', background: '#f1f5f9', padding: '1px 5px', borderRadius: 4 }}>{s.school_code}</span>
                                  {s.city && <span>• {s.city}</span>}
                                </div>
                              </div>
                            </div>
                          </td>

                          <td style={{ padding: '14px 16px' }}>
                            <div style={{ fontWeight: 500, color: '#1e293b' }}>{s.organisation_name || 'Independent'}</div>
                            <div style={{ fontSize: 11, color: '#64748b' }}>{s.campuses_count} {s.campuses_count === 1 ? 'Campus' : 'Campuses'}</div>
                          </td>

                          <td style={{ padding: '14px 16px' }}>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                              <strong style={{ color: '#0f172a', fontSize: 14 }}>{s.active_students}</strong>
                              <span style={{ fontSize: 11, color: '#64748b' }}>active</span>
                            </div>
                            <div style={{ fontSize: 11, color: '#94a3b8' }}>{s.classes_count} classes • {s.staff_count} staff</div>
                          </td>

                          <td style={{ padding: '14px 16px' }}>
                            {isPremium ? (
                              <span style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 5,
                                padding: '4px 10px',
                                borderRadius: 12,
                                fontSize: 12,
                                fontWeight: 600,
                                background: 'linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)',
                                color: '#6d28d9',
                                border: '1px solid #ddd6fe',
                              }}>
                                <Crown size={13} color="#7c3aed" /> Premium ($7.20)
                              </span>
                            ) : isStandard ? (
                              <span style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 5,
                                padding: '4px 10px',
                                borderRadius: 12,
                                fontSize: 12,
                                fontWeight: 600,
                                background: '#f0f9ff',
                                color: '#0284c7',
                                border: '1px solid #bae6fd',
                              }}>
                                <BookOpen size={13} color="#0284c7" /> Standard ($3.60)
                              </span>
                            ) : (
                              <span style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 5,
                                padding: '4px 10px',
                                borderRadius: 12,
                                fontSize: 12,
                                fontWeight: 600,
                                background: '#fffbeb',
                                color: '#b45309',
                                border: '1px solid #fde68a',
                              }}>
                                <Calendar size={13} color="#b45309" /> 30-Day Free Trial
                              </span>
                            )}
                          </td>

                          <td style={{ padding: '14px 16px' }}>
                            <span style={{
                              display: 'inline-block',
                              padding: '3px 9px',
                              borderRadius: 10,
                              fontSize: 11,
                              fontWeight: 600,
                              textTransform: 'uppercase',
                              background: s.status === 'active' ? '#ecfdf5' : (s.status === 'past_due' ? '#fef2f2' : (s.status === 'suspended' ? '#f1f5f9' : '#fffbeb')),
                              color: s.status === 'active' ? '#059669' : (s.status === 'past_due' ? '#dc2626' : (s.status === 'suspended' ? '#64748b' : '#d97706')),
                              border: `1px solid ${s.status === 'active' ? '#a7f3d0' : (s.status === 'past_due' ? '#fecaca' : (s.status === 'suspended' ? '#cbd5e1' : '#fde68a'))}`,
                            }}>
                              {s.status_display}
                            </span>
                          </td>

                          <td style={{ padding: '14px 16px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                              <span style={{ fontSize: 12, color: '#334155', fontWeight: 500 }}>
                                <Clock size={11} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                                {s.days_passed} days passed
                              </span>
                              {s.paid_until ? (
                                <span style={{
                                  fontSize: 11,
                                  fontWeight: 600,
                                  color: s.is_expired ? '#dc2626' : (s.days_remaining <= 7 ? '#d97706' : '#059669')
                                }}>
                                  {s.is_expired ? 'Expired' : `${s.days_remaining} days left`} (until {s.paid_until.substring(0, 10)})
                                </span>
                              ) : (
                                <span style={{ fontSize: 11, color: '#94a3b8' }}>Trial term (no expiry set)</span>
                              )}
                            </div>
                          </td>

                          <td style={{ padding: '14px 16px' }}>
                            <div style={{ fontWeight: 600, color: '#0f172a' }}>
                              ${s.monthly_revenue_usd} <span style={{ fontSize: 11, color: '#64748b', fontWeight: 400 }}>/ mo</span>
                            </div>
                            <div style={{ fontSize: 11, color: '#64748b' }}>
                              Rs {Number(s.monthly_revenue_pkr).toLocaleString()}
                            </div>
                          </td>

                          <td style={{ padding: '14px 16px' }}>
                            <div style={{ fontWeight: 600, color: '#059669' }}>
                              ${s.total_paid_usd}
                            </div>
                            <div style={{ fontSize: 11, color: '#94a3b8' }}>
                              {s.orders_count} orders
                            </div>
                          </td>

                          <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                              <button
                                type="button"
                                onClick={() => handleOpenAlterModal(s)}
                                style={{
                                  background: '#4338ca',
                                  color: '#ffffff',
                                  border: 'none',
                                  padding: '6px 12px',
                                  borderRadius: 6,
                                  fontSize: 12,
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 4,
                                }}
                              >
                                <SlidersHorizontal size={12} /> Alter Pkg
                              </button>
                              <button
                                type="button"
                                onClick={() => setDetailsModalSchool(s)}
                                style={{
                                  background: '#f1f5f9',
                                  color: '#334155',
                                  border: '1px solid #cbd5e1',
                                  padding: '6px 10px',
                                  borderRadius: 6,
                                  fontSize: 12,
                                  fontWeight: 500,
                                  cursor: 'pointer',
                                }}
                              >
                                <Eye size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}

                    {filteredSchools.length === 0 && (
                      <tr>
                        <td colSpan={9} style={{ textAlign: 'center', padding: '40px 20px', color: '#64748b' }}>
                          <AlertCircle size={24} color="#94a3b8" style={{ margin: '0 auto 8px', display: 'block' }} />
                          No registered schools match your search or filter criteria.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 2: PLATFORM REVENUE & CHARTS (MONEY MANAGEMENT & FINANCE) */}
        {/* ============================================================== */}
        {activeTab === 'finance' && (
          <div>
            {/* Top Controls & Currency Toggle */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: '#0f172a' }}>Platform Financial Overview</h2>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
                  Live aggregate SaaS income, recurring run rate, plan distribution, and per-school earnings.
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#ffffff', padding: '4px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b', padding: '0 8px' }}>Currency:</span>
                <button
                  type="button"
                  onClick={() => setCurrencyMode('USD')}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 600,
                    border: 'none',
                    background: currencyMode === 'USD' ? '#4338ca' : 'transparent',
                    color: currencyMode === 'USD' ? '#ffffff' : '#64748b',
                    cursor: 'pointer',
                  }}
                >
                  USD ($)
                </button>
                <button
                  type="button"
                  onClick={() => setCurrencyMode('PKR')}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 600,
                    border: 'none',
                    background: currencyMode === 'PKR' ? '#4338ca' : 'transparent',
                    color: currencyMode === 'PKR' ? '#ffffff' : '#64748b',
                    cursor: 'pointer',
                  }}
                >
                  PKR (Rs)
                </button>
              </div>
            </div>

            {/* Financial KPI Cards */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: 16,
              marginBottom: 24,
            }}>
              <div style={{
                background: '#ffffff',
                borderRadius: 12,
                padding: '20px',
                border: '1px solid #e2e8f0',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>All-Time Approved Revenue</span>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: '#ecfdf5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <DollarSign size={18} color="#059669" />
                  </div>
                </div>
                <div style={{ fontSize: 26, fontWeight: 700, color: '#059669', marginTop: 12 }}>
                  {currencyMode === 'USD' ? `$${summaryKpis.totalRevUsd}` : `Rs ${Number(summaryKpis.totalRevPkr).toLocaleString()}`}
                </div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                  {analytics?.kpis?.approved_orders_count || 0} approved transaction orders
                </div>
              </div>

              <div style={{
                background: '#ffffff',
                borderRadius: 12,
                padding: '20px',
                border: '1px solid #e2e8f0',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Monthly Recurring (MRR)</span>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <TrendingUp size={18} color="#2563eb" />
                  </div>
                </div>
                <div style={{ fontSize: 26, fontWeight: 700, color: '#2563eb', marginTop: 12 }}>
                  {currencyMode === 'USD' ? `$${summaryKpis.mrrUsd}` : `Rs ${Number(summaryKpis.mrrPkr).toLocaleString()}`}
                </div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                  Expected monthly value from active subscribers
                </div>
              </div>

              <div style={{
                background: '#ffffff',
                borderRadius: 12,
                padding: '20px',
                border: '1px solid #e2e8f0',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Pending Review In Queue</span>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: '#fffbeb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Clock size={18} color="#d97706" />
                  </div>
                </div>
                <div style={{ fontSize: 26, fontWeight: 700, color: '#d97706', marginTop: 12 }}>
                  {currencyMode === 'USD'
                    ? `$${analytics?.kpis?.pending_orders_usd || '0.00'}`
                    : `Rs ${Number(analytics?.kpis?.pending_orders_pkr || 0).toLocaleString()}`}
                </div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                  {analytics?.kpis?.pending_orders_count || 0} orders awaiting approval
                </div>
              </div>

              <div style={{
                background: '#ffffff',
                borderRadius: 12,
                padding: '20px',
                border: '1px solid #e2e8f0',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Subscribed vs Trial</span>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: '#f5f3ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Layers size={18} color="#7c3aed" />
                  </div>
                </div>
                <div style={{ fontSize: 26, fontWeight: 700, color: '#7c3aed', marginTop: 12 }}>
                  {summaryKpis.standardCount + summaryKpis.premiumCount} <span style={{ fontSize: 14, fontWeight: 500, color: '#64748b' }}>paid / {summaryKpis.freeCount} trial</span>
                </div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                  {summaryKpis.totalSchoolsCount} total active educational campuses
                </div>
              </div>
            </div>

            {/* Visual Charts Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(480px, 1fr))', gap: 20, marginBottom: 24 }}>
              {/* Chart 1: Monthly Revenue Trend Bar Chart */}
              <div style={{
                background: '#ffffff',
                borderRadius: 12,
                padding: '20px',
                border: '1px solid #e2e8f0',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <div>
                    <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0, color: '#0f172a' }}>Platform Revenue Trend (Last 6 Months)</h3>
                    <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748b' }}>Approved subscriber payments over time ({currencyMode})</p>
                  </div>
                  <BarChart3 size={18} color="#6366f1" />
                </div>

                {/* SVG Bar Chart */}
                <div style={{ height: 200, display: 'flex', alignItems: 'flex-end', gap: 16, padding: '10px 0', borderBottom: '1px solid #e2e8f0' }}>
                  {(analytics?.revenue_by_month || []).map((m: any, idx: number) => {
                    const val = currencyMode === 'USD' ? Number(m.usd) : Number(m.pkr);
                    // calculate relative height (max min 100 for scale)
                    const maxVal = Math.max(...(analytics?.revenue_by_month || []).map((x: any) => currencyMode === 'USD' ? Number(x.usd) : Number(x.pkr)), 100);
                    const barHeightPct = Math.max(12, Math.round((val / maxVal) * 160));

                    return (
                      <div key={idx} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, height: '100%', justifyContent: 'flex-end' }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: '#334155' }}>
                          {currencyMode === 'USD' ? `$${val}` : `${Math.round(val / 1000)}k`}
                        </span>
                        <div
                          style={{
                            width: '100%',
                            maxWidth: 42,
                            height: `${barHeightPct}px`,
                            background: 'linear-gradient(180deg, #6366f1 0%, #4338ca 100%)',
                            borderRadius: '6px 6px 0 0',
                            transition: 'height 0.3s ease',
                          }}
                          title={`${m.month}: ${currencyMode === 'USD' ? `$${m.usd}` : `Rs ${m.pkr}`} (${m.orders_count} orders)`}
                        />
                        <span style={{ fontSize: 11, color: '#64748b', fontWeight: 500 }}>{m.month.split(' ')[0]}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Chart 2: Plan & Status Distribution (Visual Rings & Pills) */}
              <div style={{
                background: '#ffffff',
                borderRadius: 12,
                padding: '20px',
                border: '1px solid #e2e8f0',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <div>
                    <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0, color: '#0f172a' }}>Subscription Plan Distribution</h3>
                    <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748b' }}>Active schools by tier and status</p>
                  </div>
                  <Crown size={18} color="#7c3aed" />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 24, padding: '10px 0' }}>
                  {/* Visual Donut representation */}
                  <div style={{ position: 'relative', width: 130, height: 130, flexShrink: 0 }}>
                    <svg viewBox="0 0 36 36" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
                      {/* Background circle */}
                      <circle cx="18" cy="18" r="15.9155" fill="transparent" stroke="#f1f5f9" strokeWidth="4.5" />
                      {/* Free trial circle */}
                      <circle
                        cx="18"
                        cy="18"
                        r="15.9155"
                        fill="transparent"
                        stroke="#f59e0b"
                        strokeWidth="4.5"
                        strokeDasharray={`${summaryKpis.totalSchoolsCount ? (summaryKpis.freeCount / summaryKpis.totalSchoolsCount) * 100 : 0} 100`}
                        strokeDashoffset="0"
                      />
                      {/* Standard circle */}
                      <circle
                        cx="18"
                        cy="18"
                        r="15.9155"
                        fill="transparent"
                        stroke="#0284c7"
                        strokeWidth="4.5"
                        strokeDasharray={`${summaryKpis.totalSchoolsCount ? (summaryKpis.standardCount / summaryKpis.totalSchoolsCount) * 100 : 0} 100`}
                        strokeDashoffset={`-${summaryKpis.totalSchoolsCount ? (summaryKpis.freeCount / summaryKpis.totalSchoolsCount) * 100 : 0}`}
                      />
                      {/* Premium circle */}
                      <circle
                        cx="18"
                        cy="18"
                        r="15.9155"
                        fill="transparent"
                        stroke="#7c3aed"
                        strokeWidth="4.5"
                        strokeDasharray={`${summaryKpis.totalSchoolsCount ? (summaryKpis.premiumCount / summaryKpis.totalSchoolsCount) * 100 : 0} 100`}
                        strokeDashoffset={`-${summaryKpis.totalSchoolsCount ? ((summaryKpis.freeCount + summaryKpis.standardCount) / summaryKpis.totalSchoolsCount) * 100 : 0}`}
                      />
                    </svg>
                    <div style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      <span style={{ fontSize: 20, fontWeight: 700, color: '#0f172a' }}>{summaryKpis.totalSchoolsCount}</span>
                      <span style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase' }}>Schools</span>
                    </div>
                  </div>

                  {/* Legend & Breakdown */}
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 500, color: '#334155' }}>
                        <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#7c3aed' }} />
                        Premium Plan ($7.20)
                      </span>
                      <strong style={{ fontSize: 13, color: '#7c3aed' }}>
                        {summaryKpis.premiumCount} ({summaryKpis.totalSchoolsCount ? Math.round((summaryKpis.premiumCount / summaryKpis.totalSchoolsCount) * 100) : 0}%)
                      </strong>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 500, color: '#334155' }}>
                        <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#0284c7' }} />
                        Standard Plan ($3.60)
                      </span>
                      <strong style={{ fontSize: 13, color: '#0284c7' }}>
                        {summaryKpis.standardCount} ({summaryKpis.totalSchoolsCount ? Math.round((summaryKpis.standardCount / summaryKpis.totalSchoolsCount) * 100) : 0}%)
                      </strong>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 500, color: '#334155' }}>
                        <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#f59e0b' }} />
                        30-Day Free Trial
                      </span>
                      <strong style={{ fontSize: 13, color: '#d97706' }}>
                        {summaryKpis.freeCount} ({summaryKpis.totalSchoolsCount ? Math.round((summaryKpis.freeCount / summaryKpis.totalSchoolsCount) * 100) : 0}%)
                      </strong>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Per-School Earnings Table */}
            <div style={{
              background: '#ffffff',
              borderRadius: 12,
              border: '1px solid #e2e8f0',
              overflow: 'hidden',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
            }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0, color: '#0f172a' }}>Per-School Revenue & Recurring Value Breakdown</h3>
                <span style={{ fontSize: 12, color: '#64748b' }}>Showing top revenue contributors</span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      <th style={{ padding: '12px 16px', fontWeight: 600 }}>School</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600 }}>Current Plan</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600 }}>Active Students</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600 }}>Monthly Value (MRR)</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600 }}>Total Collected (All-Time)</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600, textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(analytics?.per_school_ranking || []).map((s: any) => (
                      <tr key={s.school_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '12px 16px' }}>
                          <strong>{s.school_name}</strong>
                          <span style={{ fontSize: 11, color: '#64748b', marginLeft: 6 }}>({s.school_code})</span>
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{
                            padding: '3px 8px',
                            borderRadius: 10,
                            fontSize: 11,
                            fontWeight: 600,
                            background: s.plan_code === 'premium' ? '#f5f3ff' : (s.plan_code === 'standard' ? '#f0f9ff' : '#fffbeb'),
                            color: s.plan_code === 'premium' ? '#7c3aed' : (s.plan_code === 'standard' ? '#0284c7' : '#d97706'),
                          }}>
                            {s.plan_name}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <strong>{s.active_students}</strong> students
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{ fontWeight: 600, color: '#0f172a' }}>
                            ${s.monthly_revenue_usd}
                          </span>
                          <span style={{ fontSize: 11, color: '#64748b', marginLeft: 4 }}>
                            (Rs {Number(s.monthly_revenue_pkr).toLocaleString()})
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{ fontWeight: 700, color: '#059669' }}>
                            ${s.total_paid_usd}
                          </span>
                          <span style={{ fontSize: 11, color: '#64748b', marginLeft: 4 }}>
                            (Rs {Number(s.total_paid_pkr).toLocaleString()})
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                          <button
                            type="button"
                            onClick={() => {
                              const target = schools.find(x => x.school_id === s.school_id);
                              if (target) handleOpenAlterModal(target);
                            }}
                            style={{
                              background: '#4338ca',
                              color: '#ffffff',
                              border: 'none',
                              padding: '5px 10px',
                              borderRadius: 6,
                              fontSize: 11,
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            Alter Plan
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 3: SUBSCRIPTION ORDERS & REVIEW QUEUE (APPROVE / REJECT) */}
        {/* ============================================================== */}
        {activeTab === 'orders' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: '#0f172a' }}>Subscription Orders & Approvals</h2>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
                  Review subscriber orders, verify card / manual bank payments, and activate subscription terms.
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>Filter Orders:</span>
                <select
                  value={ordersFilter}
                  onChange={e => setOrdersFilter(e.target.value)}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1px solid #cbd5e1',
                    fontSize: 13,
                    background: '#ffffff',
                    cursor: 'pointer',
                  }}
                >
                  <option value="all">All Orders</option>
                  <option value="pending">Pending Approval</option>
                  <option value="approved">Approved</option>
                  <option value="paid">Paid</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>
            </div>

            <div style={{
              background: '#ffffff',
              borderRadius: 12,
              border: '1px solid #e2e8f0',
              overflow: 'hidden',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
            }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      <th style={{ padding: '14px 16px', fontWeight: 600 }}>Order #</th>
                      <th style={{ padding: '14px 16px', fontWeight: 600 }}>School</th>
                      <th style={{ padding: '14px 16px', fontWeight: 600 }}>Plan & Term</th>
                      <th style={{ padding: '14px 16px', fontWeight: 600 }}>Headcount</th>
                      <th style={{ padding: '14px 16px', fontWeight: 600 }}>Amount</th>
                      <th style={{ padding: '14px 16px', fontWeight: 600 }}>Status</th>
                      <th style={{ padding: '14px 16px', fontWeight: 600 }}>Date</th>
                      <th style={{ padding: '14px 16px', fontWeight: 600, textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((o) => (
                      <tr key={o.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '14px 16px', fontFamily: 'monospace', fontWeight: 600, color: '#334155' }}>
                          #{o.order_number}
                        </td>
                        <td style={{ padding: '14px 16px' }}>
                          <strong>{o.school_name}</strong>
                        </td>
                        <td style={{ padding: '14px 16px' }}>
                          <span style={{ fontWeight: 600, color: '#4338ca' }}>{o.plan_name}</span>
                          <span style={{ fontSize: 11, color: '#64748b', marginLeft: 6 }}>
                            ({o.billing_months} {o.billing_months === 1 ? 'Month' : 'Months'}
                            {Number(o.discount_percentage) > 0 ? ` • ${o.discount_percentage}% off` : ''})
                          </span>
                        </td>
                        <td style={{ padding: '14px 16px' }}>
                          <strong>{o.student_count}</strong> seats
                        </td>
                        <td style={{ padding: '14px 16px' }}>
                          <strong style={{ color: '#059669', fontSize: 14 }}>
                            {o.currency === 'USD' ? `$${o.amount}` : `Rs ${Number(o.amount).toLocaleString()}`}
                          </strong>
                        </td>
                        <td style={{ padding: '14px 16px' }}>
                          <span style={{
                            padding: '3px 9px',
                            borderRadius: 10,
                            fontSize: 11,
                            fontWeight: 600,
                            textTransform: 'uppercase',
                            background: (o.status === 'approved' || o.status === 'paid') ? '#ecfdf5' : (o.status === 'pending' ? '#fffbeb' : '#fef2f2'),
                            color: (o.status === 'approved' || o.status === 'paid') ? '#059669' : (o.status === 'pending' ? '#d97706' : '#dc2626'),
                            border: `1px solid ${(o.status === 'approved' || o.status === 'paid') ? '#a7f3d0' : (o.status === 'pending' ? '#fde68a' : '#fecaca')}`,
                          }}>
                            {o.status}
                          </span>
                        </td>
                        <td style={{ padding: '14px 16px', fontSize: 12, color: '#64748b' }}>
                          {new Date(o.created_at).toLocaleDateString()}
                        </td>
                        <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                            {o.status === 'pending' && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => setOrderActionModal({ order: o, type: 'approve' })}
                                  style={{
                                    background: '#059669',
                                    color: '#ffffff',
                                    border: 'none',
                                    padding: '5px 10px',
                                    borderRadius: 6,
                                    fontSize: 11,
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                  }}
                                >
                                  Approve
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setOrderActionModal({ order: o, type: 'reject' })}
                                  style={{
                                    background: '#ef4444',
                                    color: '#ffffff',
                                    border: 'none',
                                    padding: '5px 10px',
                                    borderRadius: 6,
                                    fontSize: 11,
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                  }}
                                >
                                  Reject
                                </button>
                              </>
                            )}
                            <button
                              type="button"
                              onClick={() => setReceiptModalOrder(o)}
                              style={{
                                background: '#f1f5f9',
                                color: '#334155',
                                border: '1px solid #cbd5e1',
                                padding: '5px 10px',
                                borderRadius: 6,
                                fontSize: 11,
                                fontWeight: 500,
                                cursor: 'pointer',
                              }}
                            >
                              Receipt
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}

                    {orders.length === 0 && (
                      <tr>
                        <td colSpan={8} style={{ textAlign: 'center', padding: '40px 20px', color: '#64748b' }}>
                          No orders found matching this filter.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 4: GOVERNANCE & SECURITY (SUPPORT ACCESS & INVITATIONS) */}
        {/* ============================================================== */}
        {activeTab === 'security' && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(480px, 1fr))', gap: 20 }}>
              {/* Support Grants */}
              <div style={{
                background: '#ffffff',
                borderRadius: 12,
                padding: '20px',
                border: '1px solid #e2e8f0',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <div>
                    <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0, color: '#0f172a' }}>Audited Support-Access Grants</h3>
                    <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748b' }}>Authorized temporary support sessions into tenant records</p>
                  </div>
                  <ShieldCheck size={18} color="#059669" />
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>
                        <th style={{ padding: '8px 10px', textAlign: 'left' }}>Tenant</th>
                        <th style={{ padding: '8px 10px', textAlign: 'left' }}>Support User</th>
                        <th style={{ padding: '8px 10px', textAlign: 'left' }}>Valid Until</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {grants.map((g) => (
                        <tr key={g.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '8px 10px' }}><strong>{g.school_name || g.organisation_name}</strong></td>
                          <td style={{ padding: '8px 10px' }}>{g.granted_to}</td>
                          <td style={{ padding: '8px 10px' }}>{new Date(g.expires_at).toLocaleDateString()}</td>
                          <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                            {g.is_valid && (
                              <button
                                type="button"
                                onClick={() => handleRevokeGrant(g.id)}
                                style={{ background: 'transparent', color: '#dc2626', border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}
                              >
                                Revoke
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                      {grants.length === 0 && (
                        <tr>
                          <td colSpan={4} style={{ textAlign: 'center', padding: '24px 10px', color: '#94a3b8' }}>
                            No active support grants on record.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* User Invitations */}
              <div style={{
                background: '#ffffff',
                borderRadius: 12,
                padding: '20px',
                border: '1px solid #e2e8f0',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <div>
                    <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0, color: '#0f172a' }}>Admin Invitations</h3>
                    <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748b' }}>Generate secure onboarding links for administrators and teachers</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setGeneratedInviteLink(''); setInviteModal(true); }}
                    style={{
                      background: '#4338ca',
                      color: '#ffffff',
                      border: 'none',
                      padding: '6px 12px',
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    + Issue Invitation
                  </button>
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>
                        <th style={{ padding: '8px 10px', textAlign: 'left' }}>Email</th>
                        <th style={{ padding: '8px 10px', textAlign: 'left' }}>Role</th>
                        <th style={{ padding: '8px 10px', textAlign: 'left' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invites.map((inv) => (
                        <tr key={inv.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '8px 10px' }}><strong>{inv.email}</strong></td>
                          <td style={{ padding: '8px 10px' }}>
                            <span style={{ padding: '2px 6px', borderRadius: 4, background: '#e0e7ff', color: '#4338ca', fontSize: 10, fontWeight: 600 }}>
                              {inv.role}
                            </span>
                          </td>
                          <td style={{ padding: '8px 10px' }}>
                            <span style={{ color: inv.is_used ? '#059669' : '#d97706', fontWeight: 600 }}>
                              {inv.is_used ? 'Accepted' : 'Pending'}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {invites.length === 0 && (
                        <tr>
                          <td colSpan={3} style={{ textAlign: 'center', padding: '24px 10px', color: '#94a3b8' }}>
                            No invitations issued.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ============================================================== */}
      {/* MODAL 1: ALTER PACKAGE / SUBSCRIPTION MODAL */}
      {/* ============================================================== */}
      {alterModalSchool && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          background: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: 16,
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: 16,
            width: '100%',
            maxWidth: 620,
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            border: '1px solid #e2e8f0',
            overflow: 'hidden',
          }}>
            <div style={{
              padding: '18px 24px',
              borderBottom: '1px solid #e2e8f0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: '#f8fafc',
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0f172a' }}>
                  Alter Subscription & Package Tier
                </h3>
                <p style={{ margin: '3px 0 0', fontSize: 12, color: '#64748b' }}>
                  School: <strong>{alterModalSchool.school_name}</strong> ({alterModalSchool.school_code})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAlterModalSchool(null)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#64748b' }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveAlteration} style={{ padding: '20px 24px' }}>
              {/* Plan Choice Cards */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 8 }}>
                  Assign Target Plan Tier:
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                  <div
                    onClick={() => setAlterPlanCode('free')}
                    style={{
                      border: alterPlanCode === 'free' ? '2px solid #f59e0b' : '1px solid #e2e8f0',
                      background: alterPlanCode === 'free' ? '#fffbeb' : '#ffffff',
                      borderRadius: 10,
                      padding: '12px 10px',
                      cursor: 'pointer',
                      textAlign: 'center',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <Calendar size={18} color="#d97706" style={{ margin: '0 auto 6px' }} />
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>30-Day Free Trial</div>
                    <div style={{ fontSize: 11, color: '#b45309', marginTop: 2 }}>$0 / student</div>
                  </div>

                  <div
                    onClick={() => setAlterPlanCode('standard')}
                    style={{
                      border: alterPlanCode === 'standard' ? '2px solid #0284c7' : '1px solid #e2e8f0',
                      background: alterPlanCode === 'standard' ? '#f0f9ff' : '#ffffff',
                      borderRadius: 10,
                      padding: '12px 10px',
                      cursor: 'pointer',
                      textAlign: 'center',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <BookOpen size={18} color="#0284c7" style={{ margin: '0 auto 6px' }} />
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>Standard Plan</div>
                    <div style={{ fontSize: 11, color: '#0284c7', marginTop: 2 }}>$3.60 / student</div>
                  </div>

                  <div
                    onClick={() => setAlterPlanCode('premium')}
                    style={{
                      border: alterPlanCode === 'premium' ? '2px solid #7c3aed' : '1px solid #e2e8f0',
                      background: alterPlanCode === 'premium' ? '#f5f3ff' : '#ffffff',
                      borderRadius: 10,
                      padding: '12px 10px',
                      cursor: 'pointer',
                      textAlign: 'center',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <Crown size={18} color="#7c3aed" style={{ margin: '0 auto 6px' }} />
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>Premium Plan</div>
                    <div style={{ fontSize: 11, color: '#7c3aed', marginTop: 2 }}>$7.20 / student</div>
                  </div>
                </div>
              </div>

              {/* Status and Student Count Override */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 6 }}>
                    Subscription Status:
                  </label>
                  <select
                    value={alterStatus}
                    onChange={e => setAlterStatus(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 8,
                      border: '1px solid #cbd5e1',
                      fontSize: 13,
                      background: '#ffffff',
                    }}
                  >
                    <option value="active">Active (Full Access)</option>
                    <option value="trial">30-Day Free Trial</option>
                    <option value="past_due">Past Due (Grace Notice)</option>
                    <option value="suspended">Suspended (Locked)</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 6 }}>
                    Invoiced / Authorized Students:
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={alterStudentOverride}
                    onChange={e => setAlterStudentOverride(e.target.value === '' ? '' : Number(e.target.value))}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 8,
                      border: '1px solid #cbd5e1',
                      fontSize: 13,
                    }}
                  />
                </div>
              </div>

              {/* Expiration Date / Extension */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 6 }}>
                  Paid Until / Expiration Date:
                </label>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
                  <input
                    type="date"
                    value={alterPaidUntil}
                    onChange={e => setAlterPaidUntil(e.target.value)}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      borderRadius: 8,
                      border: '1px solid #cbd5e1',
                      fontSize: 13,
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setAlterPaidUntil('')}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 8,
                      border: '1px solid #cbd5e1',
                      background: '#f8fafc',
                      fontSize: 12,
                      cursor: 'pointer',
                    }}
                  >
                    Clear Expiry
                  </button>
                </div>

                {/* Quick Extend Buttons */}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => handleQuickExtend(30)}
                    style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#f1f5f9', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                  >
                    +30 Days
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickExtend(60)}
                    style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#f1f5f9', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                  >
                    +60 Days
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickExtend(180)}
                    style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#f1f5f9', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                  >
                    +6 Months (180d)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickExtend(365)}
                    style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#f1f5f9', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                  >
                    +1 Year (365d)
                  </button>
                </div>
              </div>

              {/* Owner Note / Audit Reason */}
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 6 }}>
                  Audit Trail Reason / Owner Notes:
                </label>
                <input
                  type="text"
                  placeholder="e.g. Extended promo courtesy, payment verified via direct bank deposit..."
                  value={alterNotes}
                  onChange={e => setAlterNotes(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1px solid #cbd5e1',
                    fontSize: 13,
                  }}
                />
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, borderTop: '1px solid #f1f5f9', paddingTop: 16 }}>
                <button
                  type="button"
                  onClick={() => setAlterModalSchool(null)}
                  style={{
                    padding: '9px 16px',
                    borderRadius: 8,
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingAlter}
                  style={{
                    padding: '9px 20px',
                    borderRadius: 8,
                    border: 'none',
                    background: '#4338ca',
                    color: '#ffffff',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  {savingAlter ? <RefreshCw size={14} className="spin" /> : <Check size={14} />} Save & Apply Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL 2: CAMPUS DETAILS MODAL */}
      {/* ============================================================== */}
      {detailsModalSchool && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          background: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: 16,
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: 16,
            width: '100%',
            maxWidth: 580,
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            border: '1px solid #e2e8f0',
            overflow: 'hidden',
          }}>
            <div style={{
              padding: '18px 24px',
              borderBottom: '1px solid #e2e8f0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: '#f8fafc',
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0f172a' }}>
                  {detailsModalSchool.school_name}
                </h3>
                <p style={{ margin: '3px 0 0', fontSize: 12, color: '#64748b' }}>
                  Campus Details & Contact Information
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDetailsModalSchool(null)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#64748b' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: '20px 24px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Campus Code</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', marginTop: 2 }}>{detailsModalSchool.school_code}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>City / Region</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', marginTop: 2 }}>{detailsModalSchool.city || 'Not Specified'}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Organisation</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', marginTop: 2 }}>{detailsModalSchool.organisation_name || 'Independent'}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Primary Admin Contact</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', marginTop: 2 }}>{detailsModalSchool.admin_email || 'No email on record'}</div>
                </div>
              </div>

              <div style={{
                background: '#f8fafc',
                borderRadius: 10,
                padding: '14px 16px',
                border: '1px solid #e2e8f0',
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 10,
                textAlign: 'center',
                marginBottom: 16,
              }}>
                <div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>Enrolled Students</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', marginTop: 2 }}>{detailsModalSchool.active_students}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>Academic Classes</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', marginTop: 2 }}>{detailsModalSchool.classes_count}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>Staff Members</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', marginTop: 2 }}>{detailsModalSchool.staff_count}</div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Current Plan</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#4338ca', marginTop: 2 }}>{detailsModalSchool.plan_name}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Status & Paid Until</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', marginTop: 2 }}>
                    {detailsModalSchool.status_display} ({detailsModalSchool.paid_until ? detailsModalSchool.paid_until.substring(0, 10) : 'Open Trial'})
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
                <button
                  type="button"
                  onClick={() => {
                    const s = detailsModalSchool;
                    setDetailsModalSchool(null);
                    handleOpenAlterModal(s);
                  }}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 8,
                    border: 'none',
                    background: '#4338ca',
                    color: '#ffffff',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Alter Subscription for this Campus
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL 3: ORDER APPROVE / REJECT CONFIRMATION */}
      {/* ============================================================== */}
      {orderActionModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          background: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: 16,
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: 16,
            width: '100%',
            maxWidth: 500,
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            border: '1px solid #e2e8f0',
            overflow: 'hidden',
          }}>
            <div style={{
              padding: '18px 24px',
              borderBottom: '1px solid #e2e8f0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: orderActionModal.type === 'approve' ? '#ecfdf5' : '#fef2f2',
            }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: orderActionModal.type === 'approve' ? '#065f46' : '#991b1b' }}>
                {orderActionModal.type === 'approve' ? 'Approve Subscription Order' : 'Reject Subscription Order'}
              </h3>
              <button
                type="button"
                onClick={() => setOrderActionModal(null)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#64748b' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: '20px 24px' }}>
              <p style={{ margin: '0 0 14px', fontSize: 13, color: '#334155' }}>
                Are you sure you want to <strong>{orderActionModal.type}</strong> order #{orderActionModal.order.order_number} for <strong>{orderActionModal.order.school_name}</strong>?
              </p>

              <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: 8, fontSize: 12, color: '#475569', marginBottom: 16 }}>
                <div><strong>Plan:</strong> {orderActionModal.order.plan_name} ({orderActionModal.order.billing_months} months)</div>
                <div><strong>Amount:</strong> {orderActionModal.order.currency} {orderActionModal.order.amount}</div>
                <div><strong>Students:</strong> {orderActionModal.order.student_count}</div>
              </div>

              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 6 }}>
                Audit Note:
              </label>
              <input
                type="text"
                placeholder={orderActionModal.type === 'approve' ? 'e.g. Bank slip verified against official statement' : 'e.g. Invalid payment reference or receipt unreadable'}
                value={orderActionNote}
                onChange={e => setOrderActionNote(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: '1px solid #cbd5e1',
                  fontSize: 13,
                  marginBottom: 20,
                }}
              />

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => setOrderActionModal(null)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 8,
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    fontSize: 13,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmOrderAction}
                  disabled={processingOrderAction}
                  style={{
                    padding: '8px 18px',
                    borderRadius: 8,
                    border: 'none',
                    background: orderActionModal.type === 'approve' ? '#059669' : '#dc2626',
                    color: '#ffffff',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {processingOrderAction ? 'Processing...' : `Confirm ${orderActionModal.type.toUpperCase()}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL 4: ORDER RECEIPT VIEWER */}
      {/* ============================================================== */}
      {receiptModalOrder && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          background: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: 16,
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: 16,
            width: '100%',
            maxWidth: 520,
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            border: '1px solid #e2e8f0',
            overflow: 'hidden',
          }}>
            <div style={{
              padding: '18px 24px',
              borderBottom: '1px solid #e2e8f0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: '#f8fafc',
            }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0f172a' }}>
                Subscription Receipt #{receiptModalOrder.order_number}
              </h3>
              <button
                type="button"
                onClick={() => setReceiptModalOrder(null)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#64748b' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: '24px' }}>
              <div style={{ textAlign: 'center', marginBottom: 20 }}>
                <div style={{ fontSize: 28, fontWeight: 800, color: '#059669' }}>
                  {receiptModalOrder.currency === 'USD' ? `$${receiptModalOrder.amount}` : `Rs ${Number(receiptModalOrder.amount).toLocaleString()}`}
                </div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                  Status: <strong>{receiptModalOrder.status.toUpperCase()}</strong> • Issued on {new Date(receiptModalOrder.created_at).toLocaleDateString()}
                </div>
              </div>

              <div style={{ borderTop: '1px solid #e2e8f0', borderBottom: '1px solid #e2e8f0', padding: '14px 0', fontSize: 13, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748b' }}>School / Campus:</span>
                  <strong>{receiptModalOrder.school_name}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748b' }}>Subscription Tier:</span>
                  <strong>{receiptModalOrder.plan_name}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748b' }}>Duration:</span>
                  <strong>{receiptModalOrder.billing_months} Months</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748b' }}>Enrolled Headcount:</span>
                  <strong>{receiptModalOrder.student_count} Students</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748b' }}>Subtotal:</span>
                  <span>{receiptModalOrder.currency} {receiptModalOrder.subtotal}</span>
                </div>
                {Number(receiptModalOrder.discount_amount) > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#059669' }}>
                    <span>Term Discount ({receiptModalOrder.discount_percentage}%):</span>
                    <span>-{receiptModalOrder.currency} {receiptModalOrder.discount_amount}</span>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
                <button
                  type="button"
                  onClick={() => setReceiptModalOrder(null)}
                  style={{
                    padding: '8px 18px',
                    borderRadius: 8,
                    border: 'none',
                    background: '#4338ca',
                    color: '#ffffff',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Close Receipt
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL 5: ISSUE INVITATION MODAL */}
      {/* ============================================================== */}
      {inviteModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          background: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: 16,
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: 16,
            width: '100%',
            maxWidth: 480,
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            border: '1px solid #e2e8f0',
            overflow: 'hidden',
          }}>
            <div style={{
              padding: '18px 24px',
              borderBottom: '1px solid #e2e8f0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: '#f8fafc',
            }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0f172a' }}>Issue Admin / Staff Invitation</h3>
              <button
                type="button"
                onClick={() => setInviteModal(false)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#64748b' }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleIssueInvitation} style={{ padding: '20px 24px' }}>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 6 }}>
                  User Email Address *
                </label>
                <input
                  type="email"
                  required
                  placeholder="admin@school.org"
                  value={inviteEmail}
                  onChange={e => setInviteEmail(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1px solid #cbd5e1',
                    fontSize: 13,
                  }}
                />
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 6 }}>
                  System Role *
                </label>
                <select
                  value={inviteRole}
                  onChange={e => setInviteRole(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1px solid #cbd5e1',
                    fontSize: 13,
                    background: '#ffffff',
                  }}
                >
                  <option value="organisation_admin">Organisation Administrator</option>
                  <option value="school_admin">School Campus Admin</option>
                  <option value="principal">Principal</option>
                  <option value="teacher">Teacher</option>
                </select>
              </div>

              {generatedInviteLink && (
                <div style={{ marginBottom: 16, padding: '12px', background: '#eff6ff', borderRadius: 8, border: '1px solid #bfdbfe' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#1e40af' }}>Share this onboarding link:</div>
                  <input
                    type="text"
                    readOnly
                    value={generatedInviteLink}
                    style={{ width: '100%', fontSize: 11, padding: '6px', marginTop: 4, borderRadius: 4, border: '1px solid #93c5fd' }}
                  />
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => setInviteModal(false)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 8,
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    fontSize: 13,
                    cursor: 'pointer',
                  }}
                >
                  Close
                </button>
                <button
                  type="submit"
                  style={{
                    padding: '8px 18px',
                    borderRadius: 8,
                    border: 'none',
                    background: '#4338ca',
                    color: '#ffffff',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Generate Invitation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export function AdminLogin({ onLogin }: { onLogin: (user: User) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const u = await login(username, password);
      const isOwner = Boolean(
        u && (u.is_superuser || ['platform_admin', 'owner', 'super_admin', 'organisation_admin'].includes(u.role) || (u.is_staff && !u.school))
      );
      if (!isOwner) {
        setError('Access denied: This account is not a registered Platform Administrator or Website Owner.');
        return;
      }
      onLogin(u);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid owner credentials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'radial-gradient(ellipse at 50% 20%, #1e1b4b 0%, #0f172a 100%)',
      padding: '24px 16px',
      fontFamily: 'Inter, system-ui, sans-serif',
    }}>
      <div style={{
        width: '100%',
        maxWidth: 440,
        background: '#ffffff',
        borderRadius: 20,
        padding: '36px 32px',
        boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.1)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{
            width: 54,
            height: 54,
            borderRadius: 14,
            background: 'linear-gradient(135deg, #312e81 0%, #4338ca 100%)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 8px 16px rgba(67, 56, 202, 0.3)',
            marginBottom: 14,
          }}>
            <ShieldCheck size={30} color="#fbbf24" />
          </div>
          <div style={{
            display: 'inline-block',
            fontSize: 11,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            background: '#e0e7ff',
            color: '#4338ca',
            padding: '3px 10px',
            borderRadius: 12,
            marginBottom: 8,
          }}>
            Website Owner Console
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: '#0f172a' }}>Platform Administration</h2>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: '#64748b' }}>
            Sign in with website owner credentials to monitor schools, revenues, and alter packages.
          </p>
        </div>

        {/* Credentials Notice Box */}
        <div style={{
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: 10,
          padding: '12px 14px',
          fontSize: 12,
          color: '#334155',
          marginBottom: 18,
          lineHeight: 1.5,
        }}>
          <div><strong>Master Owner Account:</strong> <code style={{ background: '#e2e8f0', padding: '2px 5px', borderRadius: 4 }}>admin</code></div>
          <div style={{ marginTop: 2 }}><strong>Master Password:</strong> <code style={{ background: '#e2e8f0', padding: '2px 5px', borderRadius: 4 }}>AdminPass123!</code></div>
          <div style={{ marginTop: 6, fontSize: 11, color: '#64748b' }}>
            <em>(You can also log in with your registered Super Owner account)</em>
          </div>
        </div>

        {error && (
          <div style={{
            background: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#dc2626',
            padding: '12px 14px',
            borderRadius: 10,
            fontSize: 13,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 20,
          }}>
            <AlertCircle size={16} color="#dc2626" style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 6 }}>
              Owner Username / Email
            </label>
            <input
              type="text"
              required
              placeholder="e.g. admin or owner@optimusorien.com"
              value={username}
              onChange={e => setUsername(e.target.value)}
              style={{
                width: '100%',
                padding: '11px 14px',
                borderRadius: 10,
                border: '1px solid #cbd5e1',
                fontSize: 14,
                outline: 'none',
                background: '#f8fafc',
              }}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 6 }}>
              Security Password
            </label>
            <input
              type="password"
              required
              placeholder="••••••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              style={{
                width: '100%',
                padding: '11px 14px',
                borderRadius: 10,
                border: '1px solid #cbd5e1',
                fontSize: 14,
                outline: 'none',
                background: '#f8fafc',
              }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '12px',
              borderRadius: 10,
              border: 'none',
              background: 'linear-gradient(135deg, #312e81 0%, #4338ca 100%)',
              color: '#ffffff',
              fontSize: 14,
              fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer',
              boxShadow: '0 4px 14px rgba(67, 56, 202, 0.35)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              transition: 'opacity 0.15s ease',
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? <RefreshCw size={16} className="spin" /> : <Lock size={16} />}
            {loading ? 'Authenticating...' : 'Sign In as Website Owner'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: 24, borderTop: '1px solid #f1f5f9', paddingTop: 18 }}>
          <button
            type="button"
            onClick={() => { window.location.href = '/'; }}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#64748b',
              fontSize: 12,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            ← Return to Public Homepage
          </button>
        </div>
      </div>
    </div>
  );
}

export function AdminUnauthorized({ user, onSignOut, onGoToApp }: { user: User; onSignOut: () => void; onGoToApp: () => void }) {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#f8fafc',
      padding: '24px 16px',
      fontFamily: 'Inter, system-ui, sans-serif',
    }}>
      <div style={{
        maxWidth: 480,
        background: '#ffffff',
        borderRadius: 20,
        padding: '36px 32px',
        boxShadow: '0 20px 40px -10px rgba(0, 0, 0, 0.1)',
        border: '1px solid #e2e8f0',
        textAlign: 'center',
      }}>
        <div style={{
          width: 56,
          height: 56,
          borderRadius: 16,
          background: '#fef2f2',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 16,
        }}>
          <ShieldAlert size={30} color="#dc2626" />
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: '#0f172a' }}>Platform Owner Access Restricted</h2>
        <p style={{ margin: '10px 0 20px', fontSize: 13, color: '#64748b', lineHeight: 1.5 }}>
          You are currently signed in as <strong>{user.username}</strong> ({user.role}). This section is strictly reserved for Website Owners and Platform Administrators.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            type="button"
            onClick={onSignOut}
            style={{
              padding: '12px',
              borderRadius: 10,
              border: 'none',
              background: '#4338ca',
              color: '#ffffff',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Sign In with Website Owner Account
          </button>

          <button
            type="button"
            onClick={onGoToApp}
            style={{
              padding: '11px',
              borderRadius: 10,
              border: '1px solid #cbd5e1',
              background: '#ffffff',
              color: '#334155',
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Return to School Workspace (/app)
          </button>
        </div>
      </div>
    </div>
  );
}

