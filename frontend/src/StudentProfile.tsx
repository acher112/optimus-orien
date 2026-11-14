import React, { useEffect, useState } from 'react';
import { User, Shield, Lock, Phone, Calendar, School, KeyRound, CheckCircle2 } from 'lucide-react';
import { request } from './api';
import UserProfileView, { type UserProfileData } from './UserProfileView';

interface Props {
  user: any;
  notify?: (msg: string) => void;
}

export const StudentProfile: React.FC<Props> = ({ user, notify }) => {
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPwdCard, setShowPwdCard] = useState(false);

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

  const profileData: UserProfileData = {
    id: profile.id,
    name: profile.full_name || `Student-ID-${profile.id}`,
    role: 'student',
    registryId: `REGISTRY ID: STUDENT-${profile.admission_number || profile.id}`,
    email: `${profile.username || `student-id-${profile.id}`}@${profile.school_name ? profile.school_name.toLowerCase().replace(/[^a-z0-9]/g, '') : 'edu'}.us`,
    phone: profile.guardian_phone || '+1 (555) 000-0000',
    idNumber: `ID-${profile.admission_number || '776141'}`,
    location: profile.school_name ? `${profile.school_name}, ${profile.city || 'Campus'}` : 'Philadelphia, Philadelphia',
    avatarLetter: profile.first_name ? profile.first_name[0].toUpperCase() : 'S',
    avatarColor: '#f1f5f9',
    trajectory: profile.performance_trajectory,
    historyItems: profile.grade_history,
    transferRecord: profile.transfer_record,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, paddingBottom: 40 }}>
      <UserProfileView
        profile={profileData}
        extraActions={
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button
              type="button"
              className="outline-btn"
              style={{ width: '100%', justifyContent: 'center', fontSize: 12 }}
              onClick={() => setShowPwdCard(v => !v)}
            >
              <KeyRound size={14} /> {showPwdCard ? 'Hide Password Settings' : 'Change Password & Security'}
            </button>
          </div>
        }
      />

      {/* Optional Password Change Card */}
      {showPwdCard && (
        <div style={{
          background: '#ffffff',
          borderRadius: 20,
          padding: 24,
          border: '1px solid #e2e8f0',
          maxWidth: 520,
        }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: 16, fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
            <KeyRound size={18} color="#4f46e5" /> Security & Password
          </h3>

          {pwdMsg && (
            <div style={{
              background: pwdMsg.type === 'success' ? '#f0fdf4' : '#fef2f2',
              border: pwdMsg.type === 'success' ? '1px solid #bbf7d0' : '1px solid #fecaca',
              color: pwdMsg.type === 'success' ? '#166534' : '#b91c1c',
              padding: '10px 14px',
              borderRadius: 8,
              fontSize: 13,
              marginBottom: 14,
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
      )}
    </div>
  );
};
