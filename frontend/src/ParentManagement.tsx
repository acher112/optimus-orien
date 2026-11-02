import React, { useCallback, useEffect, useState } from 'react';
import {
  Users, UserCheck, Search, Filter, Plus, Shield, Eye, EyeOff,
  AlertCircle, CheckCircle2, Lock, Unlock, Download, RefreshCw,
  Phone, Mail, Copy, Check, Printer, X, ChevronRight, AlertTriangle
} from 'lucide-react';
import { request, type User } from './api';

interface Props {
  user: User;
  notify: (msg: string) => void;
  campuses?: any[];
}

export default function ParentManagement({ user, notify, campuses }: Props) {
  const isOrgAdmin = user.is_superuser || user.role === 'organisation_admin';
  const isPrincipal = user.role === 'principal' || user.role === 'school_admin';

  const [parents, setParents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedCampusId, setSelectedCampusId] = useState<string>(
    user.school ? String(user.school) : ''
  );

  // Wizard Modal state
  const [showWizard, setShowWizard] = useState(false);
  const [step, setStep] = useState(1);

  // Wizard Step 1: Student selection
  const [studentSearch, setStudentSearch] = useState('');
  const [foundStudents, setFoundStudents] = useState<any[]>([]);
  const [selectedStudents, setSelectedStudents] = useState<any[]>([]);
  const [searchingStudents, setSearchingStudents] = useState(false);

  // Wizard Step 2: Guardian Details & Duplicate Detection
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [relationshipType, setRelationshipType] = useState('father');
  const [identityType, setIdentityType] = useState('cnic');
  const [identityNumber, setIdentityNumber] = useState('');
  const [mobile, setMobile] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [preferredLang, setPreferredLang] = useState('en');

  const [checkingDuplicate, setCheckingDuplicate] = useState(false);
  const [duplicateMatch, setDuplicateMatch] = useState<any>(null);
  const [linkToExistingId, setLinkToExistingId] = useState<number | null>(null);

  // Wizard Step 3: Permissions & Access
  const [canViewAcademics, setCanViewAcademics] = useState(true);
  const [canViewAttendance, setCanViewAttendance] = useState(true);
  const [canViewHomework, setCanViewHomework] = useState(true);
  const [canViewFees, setCanViewFees] = useState(true);
  const [receiveNotifications, setReceiveNotifications] = useState(true);
  const [issueTempPassword, setIssueTempPassword] = useState(true);

  // Wizard Step 4: Verification
  const [isVerified, setIsVerified] = useState(false);
  const [verificationNote, setVerificationNote] = useState('');
  const [submittingWizard, setSubmittingWizard] = useState(false);

  // Credentials Receipt Modal (After registration)
  const [credentialsReceipt, setCredentialsReceipt] = useState<any>(null);

  // Sensitive ID Reveal Modal
  const [revealingGuardian, setRevealingGuardian] = useState<any>(null);
  const [revealedNumber, setRevealedNumber] = useState<string | null>(null);
  const [loadingReveal, setLoadingReveal] = useState(false);

  // Parent Detail Drawer
  const [activeParent, setActiveParent] = useState<any>(null);
  const [loadingParentDetail, setLoadingParentDetail] = useState(false);

  // Link child to existing parent modal
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkStudentSearch, setLinkStudentSearch] = useState('');
  const [linkFoundStudents, setLinkFoundStudents] = useState<any[]>([]);
  const [selectedLinkStudent, setSelectedLinkStudent] = useState<any>(null);

  // Fetch Parents Directory
  const fetchParents = useCallback(async () => {
    try {
      setLoading(true);
      let query = `parents/?search=${encodeURIComponent(search)}`;
      if (statusFilter) query += `&status=${statusFilter}`;
      if (isOrgAdmin && selectedCampusId) query += `&campus_id=${selectedCampusId}`;

      const res: any = await request(query);
      setParents((res as any[]) || []);
    } catch (err: any) {
      notify(err?.message || 'Failed to load parents directory.');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, selectedCampusId, isOrgAdmin, notify]);

  useEffect(() => {
    fetchParents();
  }, [fetchParents]);

  // Search students for Step 1
  const searchStudents = async (queryText: string) => {
    if (!queryText.trim()) return;
    try {
      setSearchingStudents(true);
      let url = `students/?search=${encodeURIComponent(queryText)}`;
      if (user.school) url += `&school=${user.school}`;
      const res: any = await request(url);
      setFoundStudents(res.results || res || []);
    } catch (err) {
      // Ignore
    } finally {
      setSearchingStudents(false);
    }
  };

  // Live duplicate check on blur
  const checkDuplicate = async () => {
    if (!identityNumber && !mobile && !email) return;
    try {
      setCheckingDuplicate(true);
      const res: any = await request('parents/check-duplicate/', {
        method: 'POST',
        body: JSON.stringify({
          identity_type: identityType,
          identity_number: identityNumber,
          mobile,
          email,
        })
      });
      if (res.is_duplicate) {
        setDuplicateMatch(res.match);
      } else {
        setDuplicateMatch(null);
      }
    } catch (err) {
      // Ignore
    } finally {
      setCheckingDuplicate(false);
    }
  };

  // Submit Add Parent Wizard
  const handleRegisterParent = async () => {
    if (!isVerified) {
      notify('You must verify parent custody/identity against admission records.');
      return;
    }
    try {
      setSubmittingWizard(true);
      const payload: any = {
        student_ids: selectedStudents.map(s => s.id),
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        relationship_type: relationshipType,
        identity_type: identityType,
        identity_number: identityNumber.trim(),
        mobile: mobile.trim(),
        email: email.trim(),
        address: address.trim(),
        preferred_language: preferredLang,
        is_verified: isVerified,
        verification_note: verificationNote.trim(),
        issue_temporary_password: issueTempPassword,
        permissions: {
          can_view_academics: canViewAcademics,
          can_view_attendance: canViewAttendance,
          can_view_homework: canViewHomework,
          can_view_fees: canViewFees,
          receive_notifications: receiveNotifications,
        }
      };

      if (linkToExistingId) {
        payload.link_to_existing_guardian_id = linkToExistingId;
      }

      const res: any = await request('parents/register/', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      notify('Parent registered and linked successfully.');
      setShowWizard(false);
      resetWizard();
      fetchParents();

      if (res.credentials_receipt) {
        setCredentialsReceipt(res.credentials_receipt);
      }
    } catch (err: any) {
      notify(err?.message || 'Registration failed. Please check form inputs.');
    } finally {
      setSubmittingWizard(false);
    }
  };

  const resetWizard = () => {
    setStep(1);
    setSelectedStudents([]);
    setFirstName('');
    setLastName('');
    setIdentityNumber('');
    setMobile('');
    setEmail('');
    setAddress('');
    setDuplicateMatch(null);
    setLinkToExistingId(null);
    setIsVerified(false);
    setVerificationNote('');
  };

  // Sensitive Reveal Identity
  const handleRevealIdentity = async (guardian: any) => {
    try {
      setLoadingReveal(true);
      setRevealingGuardian(guardian);
      const res: any = await request(`parents/${guardian.id}/reveal-identity/`, { method: 'POST' });
      setRevealedNumber(res.identity_number);
    } catch (err: any) {
      notify(err?.message || 'Failed to reveal identity number.');
      setRevealingGuardian(null);
    } finally {
      setLoadingReveal(false);
    }
  };

  // Open Parent Details Drawer
  const openParentDetail = async (id: number) => {
    try {
      setLoadingParentDetail(true);
      const res: any = await request(`parents/${id}/`);
      setActiveParent(res);
    } catch (err: any) {
      notify(err?.message || 'Failed to load parent details.');
    } finally {
      setLoadingParentDetail(false);
    }
  };

  // Revoke Relationship
  const handleRevokeRelationship = async (relId: number, studentName: string) => {
    const reason = window.prompt(`Please provide a reason for revoking access to ${studentName} (e.g. custody change, transfer):`);
    if (!reason) return;
    try {
      await request(`parents/${activeParent.id}/revoke-relationship/${relId}/`, {
        method: 'POST',
        body: JSON.stringify({ reason })
      });
      notify(`Access for ${studentName} has been revoked.`);
      openParentDetail(activeParent.id);
      fetchParents();
    } catch (err: any) {
      notify(err?.message || 'Failed to revoke relationship.');
    }
  };

  // Reset Password for parent
  const handleResetPassword = async (guardianId: number) => {
    if (!window.confirm('Issue a new temporary password for this parent?')) return;
    try {
      const res: any = await request(`parents/${guardianId}/reset-password/`, { method: 'POST' });
      notify('Password reset successfully.');
      if (res.credentials_receipt) {
        setCredentialsReceipt(res.credentials_receipt);
      }
    } catch (err: any) {
      notify(err?.message || 'Failed to reset password.');
    }
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1360px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            People & Custodians
          </div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, margin: '4px 0 0 0', color: '#0f172a' }}>
            Parents & Guardians Directory
          </h1>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <a
            href="/api/v1/parents/export/"
            download="parents_directory.csv"
            style={{
              padding: '8px 14px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              background: '#fff',
              color: '#334155',
              fontSize: '13px',
              fontWeight: 600,
              textDecoration: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Download size={15} />
            <span>Export CSV</span>
          </a>

          <button
            onClick={() => setShowWizard(true)}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: 'none',
              background: 'var(--brand-primary, #1e3a8a)',
              color: '#fff',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Plus size={16} />
            <span>Add Parent / Guardian</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: '240px', position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '10px', color: '#94a3b8' }} />
          <input
            type="text"
            placeholder="Search by parent name, mobile, email, or student..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px 8px 36px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              fontSize: '13px'
            }}
          />
        </div>

        {isOrgAdmin && campuses && (
          <select
            value={selectedCampusId}
            onChange={e => setSelectedCampusId(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
          >
            <option value="">All Campuses</option>
            {campuses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}

        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
        >
          <option value="">All Statuses</option>
          <option value="active">Active Accounts</option>
          <option value="suspended">Suspended Accounts</option>
        </select>
      </div>

      {/* Directory Table */}
      <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
            <RefreshCw className="animate-spin" size={24} style={{ margin: '0 auto 8px auto' }} />
            <p>Loading parent records...</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#f8fafc', color: '#64748b', fontSize: '12px', borderBottom: '1px solid #e2e8f0' }}>
                  <th style={{ padding: '12px 20px' }}>Parent Name</th>
                  <th style={{ padding: '12px' }}>Contact Info</th>
                  <th style={{ padding: '12px' }}>National ID (Masked)</th>
                  <th style={{ padding: '12px' }}>Linked Children</th>
                  <th style={{ padding: '12px' }}>Status</th>
                  <th style={{ padding: '12px 20px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {parents.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: '36px', textAlign: 'center', color: '#94a3b8' }}>
                      No parents found matching the filter criteria.
                    </td>
                  </tr>
                ) : (
                  parents.map(p => (
                    <tr key={p.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '12px 20px' }}>
                        <div style={{ fontWeight: 600, color: '#0f172a' }}>{p.name}</div>
                        <div style={{ fontSize: '11px', color: '#64748b' }}>User: {p.username || '—'}</div>
                      </td>
                      <td style={{ padding: '12px' }}>
                        <div style={{ color: '#334155' }}>{p.mobile || '—'}</div>
                        <div style={{ fontSize: '11px', color: '#64748b' }}>{p.email}</div>
                      </td>
                      <td style={{ padding: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{p.identity_masked}</span>
                          <button
                            onClick={() => handleRevealIdentity(p)}
                            title="Reveal Full ID (Audited)"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#2563eb', padding: '2px' }}
                          >
                            <Eye size={14} />
                          </button>
                        </div>
                      </td>
                      <td style={{ padding: '12px' }}>
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                          {p.children?.map((c: any) => (
                            <span
                              key={c.id}
                              style={{
                                background: '#eff6ff',
                                color: '#1e40af',
                                fontSize: '11px',
                                fontWeight: 600,
                                padding: '2px 8px',
                                borderRadius: '12px'
                              }}
                            >
                              {c.name} ({c.class})
                            </span>
                          ))}
                        </div>
                      </td>
                      <td style={{ padding: '12px' }}>
                        <span style={{
                          padding: '2px 8px',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontWeight: 600,
                          background: p.is_active ? '#dcfce7' : '#fee2e2',
                          color: p.is_active ? '#15803d' : '#b91c1c'
                        }}>
                          {p.is_active ? 'Active' : 'Suspended'}
                        </span>
                      </td>
                      <td style={{ padding: '12px 20px', textAlign: 'right' }}>
                        <button
                          onClick={() => openParentDetail(p.id)}
                          style={{
                            padding: '4px 10px',
                            background: '#f8fafc',
                            border: '1px solid #cbd5e1',
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontWeight: 600,
                            color: '#334155',
                            cursor: 'pointer'
                          }}
                        >
                          Manage
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 4-STEP "ADD PARENT" WIZARD MODAL                              */}
      {/* ------------------------------------------------------------- */}
      {showWizard && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }}>
          <div style={{ background: '#fff', borderRadius: '14px', width: '100%', maxWidth: '680px', maxHeight: '90vh', overflowY: 'auto', padding: '28px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)' }}>
            {/* Wizard Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #f1f5f9', paddingBottom: '12px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>Register Parent / Guardian</h3>
                <div style={{ fontSize: '12px', color: '#64748b' }}>Step {step} of 4</div>
              </div>
              <button onClick={() => setShowWizard(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>
                <X size={20} />
              </button>
            </div>

            {/* Stepper progress bar */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
              {['Select Students', 'Parent Profile', 'Permissions', 'Verification'].map((label, idx) => (
                <div key={idx} style={{ flex: 1, height: '4px', borderRadius: '2px', background: step >= idx + 1 ? '#2563eb' : '#e2e8f0' }} />
              ))}
            </div>

            {/* STEP 1: SELECT STUDENT(S) */}
            {step === 1 && (
              <div>
                <h4 style={{ margin: '0 0 8px 0', fontSize: '15px', fontWeight: 600 }}>1. Select Student(s) to Link</h4>
                <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: '#64748b' }}>
                  Search for children enrolled at this campus. You can link multiple siblings under a single parent account.
                </p>

                <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                  <input
                    type="text"
                    placeholder="Enter student name or roll number..."
                    value={studentSearch}
                    onChange={e => setStudentSearch(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && searchStudents(studentSearch)}
                    style={{ flex: 1, padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                  />
                  <button
                    type="button"
                    onClick={() => searchStudents(studentSearch)}
                    disabled={searchingStudents}
                    style={{ padding: '8px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
                  >
                    Search
                  </button>
                </div>

                {/* Found Students Results */}
                {foundStudents.length > 0 && (
                  <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', maxHeight: '160px', overflowY: 'auto', marginBottom: '16px' }}>
                    {foundStudents.map(st => {
                      const isSelected = selectedStudents.some(s => s.id === st.id);
                      return (
                        <div
                          key={st.id}
                          onClick={() => {
                            if (isSelected) {
                              setSelectedStudents(selectedStudents.filter(s => s.id !== st.id));
                            } else {
                              setSelectedStudents([...selectedStudents, st]);
                            }
                          }}
                          style={{
                            padding: '10px 14px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            borderBottom: '1px solid #f1f5f9',
                            cursor: 'pointer',
                            background: isSelected ? '#eff6ff' : '#fff'
                          }}
                        >
                          <div>
                            <span style={{ fontWeight: 600, color: '#1e293b' }}>{st.name || `${st.first_name} ${st.last_name}`}</span>
                            <span style={{ fontSize: '12px', color: '#64748b', marginLeft: '8px' }}>Roll: {st.admission_number} ({st.class_name || 'Class'})</span>
                          </div>
                          <input type="checkbox" checked={isSelected} readOnly />
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Selected Students Pill Box */}
                <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '24px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>
                    Selected Students ({selectedStudents.length}):
                  </div>
                  {selectedStudents.length === 0 ? (
                    <span style={{ fontSize: '13px', color: '#94a3b8' }}>No students selected yet. Search and select above.</span>
                  ) : (
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {selectedStudents.map(st => (
                        <span
                          key={st.id}
                          style={{
                            background: '#dbeafe',
                            color: '#1e40af',
                            padding: '4px 10px',
                            borderRadius: '16px',
                            fontSize: '12px',
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          <span>{st.name || `${st.first_name} ${st.last_name}`}</span>
                          <button
                            type="button"
                            onClick={() => setSelectedStudents(selectedStudents.filter(s => s.id !== st.id))}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                          >
                            <X size={12} />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    disabled={selectedStudents.length === 0}
                    onClick={() => setStep(2)}
                    style={{
                      padding: '8px 18px',
                      background: selectedStudents.length > 0 ? '#2563eb' : '#94a3b8',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '13px',
                      fontWeight: 600,
                      cursor: selectedStudents.length > 0 ? 'pointer' : 'not-allowed'
                    }}
                  >
                    Next: Parent Info
                  </button>
                </div>
              </div>
            )}

            {/* STEP 2: PARENT DETAILS & DUPLICATE DETECTION */}
            {step === 2 && (
              <div>
                <h4 style={{ margin: '0 0 8px 0', fontSize: '15px', fontWeight: 600 }}>2. Parent / Guardian Identity & Contact</h4>
                <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: '#64748b' }}>
                  Identity document numbers are encrypted at rest and masked in list displays.
                </p>

                {/* Duplicate detected banner */}
                {duplicateMatch && (
                  <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '14px', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#b45309', fontWeight: 700, fontSize: '14px' }}>
                      <AlertTriangle size={18} />
                      <span>Existing Parent Account Detected</span>
                    </div>
                    <p style={{ margin: '4px 0 10px 0', fontSize: '13px', color: '#78350f' }}>
                      A parent matching this CNIC, mobile, or email already exists in the system: <b>{duplicateMatch.masked_name}</b> ({duplicateMatch.masked_identity}).
                    </p>
                    <button
                      type="button"
                      onClick={() => setLinkToExistingId(duplicateMatch.id)}
                      style={{
                        padding: '6px 12px',
                        background: linkToExistingId === duplicateMatch.id ? '#15803d' : '#b45309',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      {linkToExistingId === duplicateMatch.id ? '✓ Linked to Existing Account' : 'Link to this Existing Account'}
                    </button>
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', marginBottom: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>First Name *</label>
                    <input
                      type="text"
                      value={firstName}
                      onChange={e => setFirstName(e.target.value)}
                      required
                      style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>Last Name *</label>
                    <input
                      type="text"
                      value={lastName}
                      onChange={e => setLastName(e.target.value)}
                      required
                      style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>Relationship *</label>
                    <select
                      value={relationshipType}
                      onChange={e => setRelationshipType(e.target.value)}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                    >
                      <option value="father">Father</option>
                      <option value="mother">Mother</option>
                      <option value="guardian">Guardian / Custodian</option>
                      <option value="other">Other Relative</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>ID Document Type</label>
                    <select
                      value={identityType}
                      onChange={e => setIdentityType(e.target.value)}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                    >
                      <option value="cnic">CNIC (Pakistan 13 digits)</option>
                      <option value="passport">Passport</option>
                      <option value="other">Other Official ID</option>
                    </select>
                  </div>
                </div>

                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                    National ID Number (CNIC format: 12345-1234567-1) *
                  </label>
                  <input
                    type="text"
                    value={identityNumber}
                    onChange={e => setIdentityNumber(e.target.value)}
                    onBlur={checkDuplicate}
                    placeholder="e.g. 35201-1234567-1"
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', marginBottom: '16px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>Mobile Phone *</label>
                    <input
                      type="text"
                      value={mobile}
                      onChange={e => setMobile(e.target.value)}
                      onBlur={checkDuplicate}
                      placeholder="0300-1234567"
                      style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>Email Address *</label>
                    <input
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      onBlur={checkDuplicate}
                      placeholder="parent@example.com"
                      style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    style={{ padding: '8px 16px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', cursor: 'pointer' }}
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    disabled={!firstName || !lastName || !identityNumber || !mobile}
                    onClick={() => setStep(3)}
                    style={{ padding: '8px 18px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
                  >
                    Next: Permissions
                  </button>
                </div>
              </div>
            )}

            {/* STEP 3: ACCESS & PERMISSIONS */}
            {step === 3 && (
              <div>
                <h4 style={{ margin: '0 0 8px 0', fontSize: '15px', fontWeight: 600 }}>3. Portal Permissions & Credentials</h4>
                <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: '#64748b' }}>
                  Configure what sections of the portal this parent is authorised to access.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '20px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
                    <input type="checkbox" checked={canViewAcademics} onChange={e => setCanViewAcademics(e.target.checked)} />
                    <span><b>Can view Academics & AQI Results</b> (Exam scores, performance comparisons)</span>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
                    <input type="checkbox" checked={canViewAttendance} onChange={e => setCanViewAttendance(e.target.checked)} />
                    <span><b>Can view Attendance records</b> (Daily register & alerts)</span>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
                    <input type="checkbox" checked={canViewHomework} onChange={e => setCanViewHomework(e.target.checked)} />
                    <span><b>Can view Homework & Study Materials</b></span>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
                    <input type="checkbox" checked={canViewFees} onChange={e => setCanViewFees(e.target.checked)} />
                    <span><b>Can view Fee Vouchers & Payment Status</b></span>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
                    <input type="checkbox" checked={receiveNotifications} onChange={e => setReceiveNotifications(e.target.checked)} />
                    <span><b>Receive Risk & Support Notifications</b> (Attendance drops, academic support)</span>
                  </label>
                </div>

                <div style={{ marginBottom: '24px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
                    <input type="checkbox" checked={issueTempPassword} onChange={e => setIssueTempPassword(e.target.checked)} />
                    <span><b>Issue temporary password immediately</b> (Generate printable credentials receipt)</span>
                  </label>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    style={{ padding: '8px 16px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', cursor: 'pointer' }}
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={() => setStep(4)}
                    style={{ padding: '8px 18px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
                  >
                    Next: Verification
                  </button>
                </div>
              </div>
            )}

            {/* STEP 4: VERIFICATION & CONFIRMATION */}
            {step === 4 && (
              <div>
                <h4 style={{ margin: '0 0 8px 0', fontSize: '15px', fontWeight: 600 }}>4. Mandatory Identity Verification</h4>
                <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: '#64748b' }}>
                  To protect child safety and adhere to privacy policy, access must be confirmed against school admission records.
                </p>

                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '16px', marginBottom: '20px' }}>
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '13px', color: '#991b1b', cursor: 'pointer', fontWeight: 600 }}>
                    <input
                      type="checkbox"
                      checked={isVerified}
                      onChange={e => setIsVerified(e.target.checked)}
                      style={{ marginTop: '3px' }}
                    />
                    <span>
                      I confirm that the parent's identity and legal custody/relationship has been verified against school admission documentation.
                    </span>
                  </label>
                </div>

                <div style={{ marginBottom: '24px' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                    Verification Notes (Optional)
                  </label>
                  <textarea
                    value={verificationNote}
                    onChange={e => setVerificationNote(e.target.value)}
                    rows={2}
                    placeholder="e.g. Verified CNIC copy matched with Admission Form #NC-2026-088"
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <button
                    type="button"
                    onClick={() => setStep(3)}
                    style={{ padding: '8px 16px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', cursor: 'pointer' }}
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    disabled={!isVerified || submittingWizard}
                    onClick={handleRegisterParent}
                    style={{
                      padding: '8px 20px',
                      background: isVerified ? '#16a34a' : '#94a3b8',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '13px',
                      fontWeight: 600,
                      cursor: isVerified ? 'pointer' : 'not-allowed'
                    }}
                  >
                    {submittingWizard ? 'Registering...' : 'Complete Registration'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* SENSITIVE REVEAL MODAL                                        */}
      {/* ------------------------------------------------------------- */}
      {revealingGuardian && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }}>
          <div style={{ background: '#fff', borderRadius: '12px', width: '100%', maxWidth: '440px', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#b45309', fontWeight: 700 }}>
                <Shield size={20} />
                <span>Sensitive Identity Verification</span>
              </div>
              <button onClick={() => setRevealingGuardian(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>
                <X size={18} />
              </button>
            </div>

            <p style={{ fontSize: '13px', color: '#475569', marginBottom: '16px' }}>
              Access to full national identity documents is restricted to authorised campus administrators. This decryption event has been recorded in the security audit log.
            </p>

            <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '8px', border: '1px solid #cbd5e1', textAlign: 'center', marginBottom: '18px' }}>
              <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>
                {revealingGuardian.identity_type} Number
              </div>
              <div style={{ fontSize: '20px', fontWeight: 800, color: '#0f172a', fontFamily: 'monospace', letterSpacing: '0.05em', marginTop: '4px' }}>
                {revealedNumber || 'Loading...'}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setRevealingGuardian(null)}
                style={{ padding: '6px 14px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* CREDENTIALS RECEIPT MODAL                                      */}
      {/* ------------------------------------------------------------- */}
      {credentialsReceipt && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }}>
          <div style={{ background: '#fff', borderRadius: '12px', width: '100%', maxWidth: '500px', padding: '28px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#166534' }}>
                Parent Access Credentials
              </h3>
              <button onClick={() => setCredentialsReceipt(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>
                <X size={18} />
              </button>
            </div>

            <p style={{ fontSize: '13px', color: '#334155', marginBottom: '16px' }}>
              Hand this slip or send these credentials to the parent. They will be prompted to set a permanent password upon first login.
            </p>

            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '16px', marginBottom: '20px' }}>
              <div style={{ marginBottom: '8px', fontSize: '13px' }}>
                <b>Portal URL:</b> <span style={{ fontFamily: 'monospace' }}>https://optimus-orien.edu/login</span>
              </div>
              <div style={{ marginBottom: '8px', fontSize: '13px' }}>
                <b>Username:</b> <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{credentialsReceipt.username}</span>
              </div>
              <div style={{ fontSize: '13px' }}>
                <b>Temporary Password:</b> <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#16a34a' }}>{credentialsReceipt.temporary_password}</span>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <button
                onClick={() => window.print()}
                style={{ padding: '6px 14px', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Printer size={15} />
                <span>Print Slip</span>
              </button>

              <button
                onClick={() => setCredentialsReceipt(null)}
                style={{ padding: '6px 16px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* PARENT DETAILS DRAWER / MODAL                                 */}
      {/* ------------------------------------------------------------- */}
      {activeParent && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'flex-end', zIndex: 1000 }}>
          <div style={{ background: '#fff', width: '100%', maxWidth: '540px', height: '100%', overflowY: 'auto', padding: '24px', boxShadow: '-4px 0 15px rgba(0,0,0,0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #e2e8f0', paddingBottom: '14px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>{activeParent.first_name} {activeParent.last_name}</h3>
                <div style={{ fontSize: '12px', color: '#64748b' }}>Parent Account Profile</div>
              </div>
              <button onClick={() => setActiveParent(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>
                <X size={20} />
              </button>
            </div>

            {/* Profile Info Card */}
            <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '20px', fontSize: '13px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
                <div><b>Email:</b> {activeParent.email}</div>
                <div><b>Mobile:</b> {activeParent.mobile}</div>
                <div><b>National ID:</b> {activeParent.identity_masked}</div>
                <div><b>Language:</b> {activeParent.preferred_language === 'ur' ? 'Urdu' : 'English'}</div>
              </div>
            </div>

            {/* Actions Bar */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
              <button
                onClick={() => handleResetPassword(activeParent.id)}
                style={{ padding: '6px 12px', background: '#eff6ff', color: '#1e40af', border: '1px solid #bfdbfe', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
              >
                Reset Password
              </button>
            </div>

            {/* Linked Children List */}
            <h4 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '12px' }}>
              Authorised Children ({activeParent.children?.length || 0})
            </h4>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {activeParent.children?.map((c: any) => (
                <div key={c.relationship_id} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '14px', color: '#0f172a' }}>{c.student_name}</div>
                      <div style={{ fontSize: '12px', color: '#64748b' }}>
                        Roll: {c.admission_number} • Class: {c.class_name} • {c.relationship}
                      </div>
                    </div>

                    <span style={{
                      padding: '2px 8px',
                      borderRadius: '6px',
                      fontSize: '11px',
                      fontWeight: 600,
                      background: c.status === 'active' ? '#dcfce7' : '#fee2e2',
                      color: c.status === 'active' ? '#15803d' : '#b91c1c'
                    }}>
                      {c.status}
                    </span>
                  </div>

                  {c.status === 'active' && (
                    <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'flex-end' }}>
                      <button
                        onClick={() => handleRevokeRelationship(c.relationship_id, c.student_name)}
                        style={{
                          padding: '4px 10px',
                          background: '#fff',
                          color: '#dc2626',
                          border: '1px solid #fecaca',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                      >
                        Revoke Child Access
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
