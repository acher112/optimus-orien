import React, { useEffect, useState } from 'react';
import { User, Shield, Lock, Phone, Calendar, School, KeyRound, CheckCircle2 } from 'lucide-react';
import { request } from './api';

interface Props {
  user: any;
  notify?: (msg: string) => void;
}

export const StudentProfile: React.FC<Props> = ({ user, notify }) => {
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Password Change state
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [pwdMsg, setPwdMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    setLoading(true);
    try {
      const res: any = await request('student/profile/');
      setProfile(res);
    } catch (err: any) {
      setError(err?.message || 'Could not load student profile.');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdMsg(null);

    if (newPassword.length < 8) {
      setPwdMsg({ type: 'error', text: 'New password must be at least 8 characters long.' });
      return;
    }

    if (newPassword !== confirmPassword) {
      setPwdMsg({ type: 'error', text: 'New passwords do not match.' });
      return;
    }

    setChangingPassword(true);
    try {
      await request('auth/password/', {
        method: 'POST',
        body: JSON.stringify({
          current_password: oldPassword,
          new_password: newPassword
        })
      });
      setPwdMsg({ type: 'success', text: 'Password updated successfully!' });
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      if (notify) notify('Password changed successfully.');
    } catch (err: any) {
      setPwdMsg({ type: 'error', text: err?.message || 'Failed to update password.' });
    } finally {
      setChangingPassword(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
        <div style={{ fontSize: 16, fontWeight: 600 }}>Loading profile…</div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#ef4444' }}>
        {error || 'Unable to load profile.'}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, paddingBottom: 40, maxWidth: 900 }}>
      {/* Header Banner */}
      <div style={{
        background: '#ffffff',
        borderRadius: 16,
        padding: '24px 28px',
        border: '1px solid #e2e8f0',
        display: 'flex',
        alignItems: 'center',
        gap: 20
      }}>
        <div style={{
          width: 64,
          height: 64,
          borderRadius: '50%',
          background: '#e0e7ff',
          color: '#4338ca',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 24,
          fontWeight: 800
        }}>
          {profile.first_name[0]}{profile.last_name ? profile.last_name[0] : ''}
        </div>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#0f172a' }}>
            {profile.full_name}
          </h2>
          <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
            Admission Number: <b>{profile.admission_number}</b> · Enrolled in <b>{profile.class_name}</b>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 20 }}>
        {/* Personal & Enrolment Information */}
        <div style={{
          background: '#ffffff',
          borderRadius: 16,
          padding: 24,
          border: '1px solid #e2e8f0',
          display: 'flex',
          flexDirection: 'column',
          gap: 16
        }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
            <User size={18} color="#4f46e5" /> Academic & Personal Details
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, fontSize: 13 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Full Name</div>
              <div style={{ fontWeight: 600, color: '#0f172a', marginTop: 2 }}>{profile.full_name}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Admission ID</div>
              <div style={{ fontWeight: 600, color: '#0f172a', marginTop: 2 }}>{profile.admission_number}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Campus</div>
              <div style={{ fontWeight: 600, color: '#0f172a', marginTop: 2 }}>{profile.school_name}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Class & Section</div>
              <div style={{ fontWeight: 600, color: '#0f172a', marginTop: 2 }}>{profile.class_name}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Father's Name</div>
              <div style={{ fontWeight: 600, color: '#0f172a', marginTop: 2 }}>{profile.father_name || '—'}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Gender</div>
              <div style={{ fontWeight: 600, color: '#0f172a', marginTop: 2, textTransform: 'capitalize' }}>{profile.gender}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Enrolment Date</div>
              <div style={{ fontWeight: 600, color: '#0f172a', marginTop: 2 }}>{profile.enrolled_on || '—'}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Portal Username</div>
              <div style={{ fontWeight: 700, color: '#4f46e5', marginTop: 2, fontFamily: 'monospace' }}>{profile.username || '—'}</div>
            </div>
          </div>

          {/* Guardian Info */}
          <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: 6 }}>
              Guardian Emergency Contact
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#334155' }}>
              <Phone size={15} color="#64748b" />
              <span>{profile.guardian_phone || 'No phone number on record'}</span>
            </div>
          </div>
        </div>

        {/* Change Password Card */}
        <div style={{
          background: '#ffffff',
          borderRadius: 16,
          padding: 24,
          border: '1px solid #e2e8f0',
          display: 'flex',
          flexDirection: 'column',
          gap: 16
        }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
            <KeyRound size={18} color="#4f46e5" /> Security & Password
          </h3>

          {pwdMsg && (
            <div style={{
              background: pwdMsg.type === 'success' ? '#f0fdf4' : '#fef2f2',
              border: pwdMsg.type === 'success' ? '1px solid #bbf7d0' : '1px solid #fecaca',
              color: pwdMsg.type === 'success' ? '#166534' : '#b91c1c',
              padding: '10px 14px',
              borderRadius: 8,
              fontSize: 13
            }}>
              {pwdMsg.text}
            </div>
          )}

          <form onSubmit={handlePasswordChange} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                Current Password <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="password"
                required
                value={oldPassword}
                onChange={e => setOldPassword(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, boxSizing: 'border-box' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                New Password (minimum 8 characters) <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="password"
                required
                minLength={8}
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, boxSizing: 'border-box' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                Confirm New Password <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="password"
                required
                minLength={8}
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, boxSizing: 'border-box' }}
              />
            </div>

            <button
              type="submit"
              disabled={changingPassword}
              style={{
                marginTop: 6,
                background: '#4f46e5',
                color: '#ffffff',
                border: 'none',
                borderRadius: 8,
                padding: '10px 16px',
                fontSize: 13,
                fontWeight: 700,
                cursor: changingPassword ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6
              }}
            >
              <Lock size={15} /> {changingPassword ? 'Updating…' : 'Update Password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
