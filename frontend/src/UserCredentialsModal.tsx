import React, { useState, useEffect } from 'react';
import {
  X, Copy, Check, Eye, EyeOff, RefreshCw, KeyRound, Mail, UserRound,
  ShieldCheck, Printer, Search, Building2, School, GraduationCap, AlertCircle
} from 'lucide-react';
import { request } from './api';

export interface UserCredentialsData {
  user_id?: number;
  student_id?: number;
  admission_number?: string;
  full_name: string;
  email: string;
  username: string;
  password: string;
  role: string;
  school_name?: string;
  school_code?: string;
  class_name?: string;
  guardian_phone?: string;
  login_url?: string;
}

interface Props {
  studentId?: number | null;
  userId?: number | null;
  initialData?: UserCredentialsData | null;
  onClose: () => void;
  notify?: (msg: string) => void;
}

export const UserCredentialsModal: React.FC<Props> = ({
  studentId,
  userId,
  initialData,
  onClose,
  notify = () => {}
}) => {
  const [data, setData] = useState<UserCredentialsData | null>(initialData || null);
  const [loading, setLoading] = useState<boolean>(!initialData && Boolean(studentId || userId));
  const [error, setError] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState<boolean>(false);

  // Search feature for looking up any user
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState<boolean>(false);

  const fetchCredentials = async (sId?: number | null, uId?: number | null) => {
    setLoading(true);
    setError('');
    try {
      let endpoint = '';
      if (sId) {
        endpoint = `students/${sId}/credentials/`;
      } else if (uId) {
        endpoint = `users/${uId}/credentials/`;
      } else {
        setLoading(false);
        return;
      }
      const res = await request<UserCredentialsData>(endpoint);
      setData(res);
    } catch (err: any) {
      setError(err?.message || 'Could not retrieve user credentials.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!initialData && (studentId || userId)) {
      fetchCredentials(studentId, userId);
    }
  }, [studentId, userId]);

  const copyToClipboard = (text: string, fieldName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    notify(`${fieldName} copied to clipboard.`);
    setTimeout(() => setCopiedField(null), 2200);
  };

  const copyAll = () => {
    if (!data) return;
    const origin = window.location.origin;
    const slip = [
      '==========================================',
      '      OPTIMUS ORIEN PORTAL CREDENTIALS    ',
      '==========================================',
      `Full Name  : ${data.full_name}`,
      `Role       : ${data.role.toUpperCase()}`,
      data.class_name ? `Class      : ${data.class_name}` : null,
      data.school_name ? `Campus     : ${data.school_name}` : null,
      data.admission_number ? `Admission #: ${data.admission_number}` : null,
      '------------------------------------------',
      `Email      : ${data.email}`,
      `Username   : ${data.username}`,
      `Password   : ${data.password}`,
      `Login URL  : ${origin}${data.login_url || '/app'}`,
      '=========================================='
    ].filter(Boolean).join('\n');

    copyToClipboard(slip, 'Complete Credentials');
  };

  const handleRegeneratePassword = async () => {
    if (!data) return;
    if (!window.confirm(`Generate and set a new secure password for ${data.full_name}? The old password will be replaced.`)) {
      return;
    }
    setRegenerating(true);
    try {
      let endpoint = '';
      if (data.student_id) {
        endpoint = `students/${data.student_id}/credentials/`;
      } else if (data.user_id) {
        endpoint = `users/${data.user_id}/credentials/`;
      }
      if (!endpoint) return;

      const res = await request<UserCredentialsData>(endpoint, {
        method: 'POST',
        body: JSON.stringify({ action: 'regenerate' })
      });
      setData(res);
      setShowPassword(true);
      notify('New password generated and updated successfully.');
    } catch (err: any) {
      notify(err?.message || 'Failed to regenerate password.');
    } finally {
      setRegenerating(false);
    }
  };

  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    if (!query.trim() || query.length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await request<{ results: any[] }>(`users/lookup-credentials/?q=${encodeURIComponent(query.trim())}`);
      setSearchResults(res.results || []);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const selectUser = (u: any) => {
    setData({
      user_id: u.user_id,
      full_name: u.full_name,
      email: u.email,
      username: u.username,
      password: u.password,
      role: u.role,
      school_name: u.school_name,
      login_url: u.login_url
    });
    setSearchResults([]);
    setSearchQuery('');
    setShowPassword(false);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.72)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 99999,
        padding: '16px',
        overflowY: 'auto'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <style>
        {`
          @media print {
            body * { visibility: hidden !important; }
            .printable-credentials-card, .printable-credentials-card * { visibility: visible !important; }
            .printable-credentials-card {
              position: fixed !important;
              left: 50% !important;
              top: 50% !important;
              transform: translate(-50%, -50%) !important;
              width: 100% !important;
              max-width: 460px !important;
              box-shadow: none !important;
              border: 1px solid #334155 !important;
              border-radius: 8px !important;
            }
            .no-print { display: none !important; }
          }
        `}
      </style>

      <div
        className="printable-credentials-card"
        style={{
          background: '#ffffff',
          borderRadius: 16,
          width: '100%',
          maxWidth: 540,
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
          overflow: 'hidden',
          border: '1px solid #cbd5e1',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '92vh'
        }}
      >
        {/* Header Bar */}
        <div
          style={{
            background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
            padding: '20px 24px',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid #334155'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
                boxShadow: '0 4px 10px rgba(2, 132, 199, 0.4)'
              }}
            >
              <KeyRound size={20} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#f8fafc', letterSpacing: '-0.01em' }}>
                  User Credentials
                </h3>
                {data?.role && (
                  <span
                    style={{
                      fontSize: 11,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      background: 'rgba(56, 189, 248, 0.2)',
                      color: '#38bdf8',
                      padding: '2px 8px',
                      borderRadius: 12,
                      fontWeight: 700
                    }}
                  >
                    {data.role}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                Optimus Orien Portal Sign-In Credentials
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="no-print"
            style={{
              background: 'rgba(255, 255, 255, 0.1)',
              border: 'none',
              borderRadius: 8,
              width: 32,
              height: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#cbd5e1',
              cursor: 'pointer',
              transition: 'background 0.15s ease'
            }}
            title="Close modal"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
          {/* Quick Search Bar for looking up any user */}
          <div className="no-print" style={{ marginBottom: 18, position: 'relative' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                background: '#f8fafc',
                border: '1px solid #cbd5e1',
                borderRadius: 10,
                padding: '6px 12px',
                gap: 8
              }}
            >
              <Search size={15} style={{ color: '#64748b' }} />
              <input
                type="text"
                placeholder="Search any user by name, username, email or roll #..."
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  outline: 'none',
                  width: '100%',
                  fontSize: 13,
                  color: '#1e293b'
                }}
              />
              {searching && <RefreshCw size={14} className="spin" style={{ color: '#0284c7' }} />}
            </div>

            {searchResults.length > 0 && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  background: '#ffffff',
                  border: '1px solid #cbd5e1',
                  borderRadius: 8,
                  marginTop: 4,
                  boxShadow: '0 10px 25px -5px rgba(0,0,0,0.15)',
                  zIndex: 10,
                  maxHeight: 200,
                  overflowY: 'auto'
                }}
              >
                {searchResults.map((sr) => (
                  <div
                    key={sr.user_id}
                    onClick={() => selectUser(sr)}
                    style={{
                      padding: '8px 12px',
                      borderBottom: '1px solid #f1f5f9',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: 12
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = '#ffffff')}
                  >
                    <div>
                      <div style={{ fontWeight: 600, color: '#0f172a' }}>{sr.full_name}</div>
                      <div style={{ color: '#64748b', fontSize: 11 }}>{sr.email} • @{sr.username}</div>
                    </div>
                    <span style={{ fontSize: 10, background: '#e2e8f0', padding: '2px 6px', borderRadius: 4, textTransform: 'capitalize' }}>
                      {sr.role}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#64748b' }}>
              <RefreshCw size={24} className="spin" style={{ margin: '0 auto 10px', color: '#0284c7' }} />
              <div style={{ fontSize: 13 }}>Retrieving credentials securely…</div>
            </div>
          ) : error ? (
            <div
              style={{
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: 10,
                padding: '16px',
                color: '#991b1b',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                fontSize: 13
              }}
            >
              <AlertCircle size={18} style={{ flexShrink: 0 }} />
              <div>{error}</div>
            </div>
          ) : !data ? (
            <div style={{ textAlign: 'center', padding: '30px 0', color: '#64748b', fontSize: 13 }}>
              Search for a user above to display their credentials.
            </div>
          ) : (
            <div>
              {/* User Identity Card */}
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: 12,
                  padding: '14px 16px',
                  marginBottom: 16,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 10
                }}
              >
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>
                    {data.full_name}
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    {data.school_name && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <Building2 size={12} /> {data.school_name}
                      </span>
                    )}
                    {data.class_name && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        • <GraduationCap size={12} /> {data.class_name}
                      </span>
                    )}
                    {data.admission_number && (
                      <span>• Roll/Adm: <strong>{data.admission_number}</strong></span>
                    )}
                  </div>
                </div>

                <div className="no-print">
                  <button
                    onClick={copyAll}
                    style={{
                      background: '#ffffff',
                      border: '1px solid #cbd5e1',
                      borderRadius: 8,
                      padding: '6px 12px',
                      fontSize: 12,
                      fontWeight: 600,
                      color: '#0f172a',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                    }}
                  >
                    {copiedField === 'Complete Credentials' ? (
                      <>
                        <Check size={13} style={{ color: '#16a34a' }} /> Copied All
                      </>
                    ) : (
                      <>
                        <Copy size={13} /> Copy All
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* 3 Main Credential Cards: Email, Username, Password */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {/* 1. EMAIL */}
                <div
                  style={{
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: 10,
                    padding: '12px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        background: '#eff6ff',
                        color: '#2563eb',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                      }}
                    >
                      <Mail size={16} />
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Email Address
                      </div>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: '#0f172a',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}
                      >
                        {data.email || 'No email registered'}
                      </div>
                    </div>
                  </div>

                  <button
                    className="no-print"
                    onClick={() => copyToClipboard(data.email, 'Email')}
                    style={{
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: 6,
                      padding: '5px 10px',
                      fontSize: 11,
                      fontWeight: 600,
                      color: '#475569',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4
                    }}
                    title="Copy email"
                  >
                    {copiedField === 'Email' ? <Check size={12} color="#16a34a" /> : <Copy size={12} />}
                    <span>{copiedField === 'Email' ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>

                {/* 2. USERNAME */}
                <div
                  style={{
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: 10,
                    padding: '12px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        background: '#f0fdf4',
                        color: '#16a34a',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                      }}
                    >
                      <UserRound size={16} />
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Portal Username
                      </div>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 700,
                          color: '#0f172a',
                          fontFamily: 'monospace',
                          letterSpacing: '0.02em'
                        }}
                      >
                        {data.username}
                      </div>
                    </div>
                  </div>

                  <button
                    className="no-print"
                    onClick={() => copyToClipboard(data.username, 'Username')}
                    style={{
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: 6,
                      padding: '5px 10px',
                      fontSize: 11,
                      fontWeight: 600,
                      color: '#475569',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4
                    }}
                    title="Copy username"
                  >
                    {copiedField === 'Username' ? <Check size={12} color="#16a34a" /> : <Copy size={12} />}
                    <span>{copiedField === 'Username' ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>

                {/* 3. PASSWORD */}
                <div
                  style={{
                    background: '#ffffff',
                    border: '1px solid #cbd5e1',
                    borderRadius: 10,
                    padding: '12px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.04)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        background: '#fef3c7',
                        color: '#d97706',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                      }}
                    >
                      <KeyRound size={16} />
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Password
                      </div>
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 700,
                          color: '#0f172a',
                          fontFamily: 'monospace',
                          letterSpacing: showPassword ? '0.04em' : '0.15em'
                        }}
                      >
                        {showPassword ? data.password : '••••••••••••'}
                      </div>
                    </div>
                  </div>

                  <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      style={{
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        borderRadius: 6,
                        padding: '5px 8px',
                        fontSize: 11,
                        color: '#475569',
                        cursor: 'pointer'
                      }}
                      title={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>

                    <button
                      type="button"
                      onClick={() => copyToClipboard(data.password, 'Password')}
                      style={{
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        borderRadius: 6,
                        padding: '5px 10px',
                        fontSize: 11,
                        fontWeight: 600,
                        color: '#475569',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4
                      }}
                      title="Copy password"
                    >
                      {copiedField === 'Password' ? <Check size={12} color="#16a34a" /> : <Copy size={12} />}
                      <span>{copiedField === 'Password' ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Instructions & Security Notice */}
              <div
                style={{
                  background: '#f1f5f9',
                  borderRadius: 10,
                  padding: '12px 14px',
                  marginTop: 16,
                  fontSize: 12,
                  color: '#475569',
                  lineHeight: '1.5'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                  <ShieldCheck size={14} style={{ color: '#0284c7' }} /> Login Portal:
                </div>
                Users can log in using either their <strong>Email</strong> or <strong>Username</strong> with the password above at{' '}
                <span style={{ color: '#0284c7', textDecoration: 'underline' }}>{window.location.origin}{data.login_url || '/app'}</span>.
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer Bar */}
        <div
          className="no-print"
          style={{
            padding: '14px 24px',
            background: '#f8fafc',
            borderTop: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 10
          }}
        >
          {data && (
            <button
              onClick={handleRegeneratePassword}
              disabled={regenerating}
              style={{
                background: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: 8,
                padding: '7px 12px',
                fontSize: 12,
                fontWeight: 600,
                color: '#475569',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6
              }}
              title="Reset and assign a fresh password"
            >
              <RefreshCw size={13} className={regenerating ? 'spin' : ''} />
              {regenerating ? 'Generating…' : 'Regenerate Password'}
            </button>
          )}

          <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
            {data && (
              <button
                onClick={handlePrint}
                style={{
                  background: '#ffffff',
                  border: '1px solid #cbd5e1',
                  borderRadius: 8,
                  padding: '7px 12px',
                  fontSize: 12,
                  fontWeight: 600,
                  color: '#0f172a',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                <Printer size={13} /> Print Slip
              </button>
            )}

            <button
              onClick={onClose}
              style={{
                background: '#0f172a',
                color: '#ffffff',
                border: 'none',
                borderRadius: 8,
                padding: '7px 16px',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserCredentialsModal;
