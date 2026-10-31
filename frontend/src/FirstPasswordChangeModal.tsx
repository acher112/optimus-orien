import React, { useState } from 'react';
import { KeyRound, ShieldAlert, CheckCircle2, Lock } from 'lucide-react';
import { request } from './api';

interface Props {
  onSuccess: () => void;
  notify?: (msg: string) => void;
}

export const FirstPasswordChangeModal: React.FC<Props> = ({ onSuccess, notify }) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.');
      return;
    }

    setSaving(true);
    try {
      await request('auth/password/', {
        method: 'POST',
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword
        })
      });

      if (notify) notify('Password set successfully! Welcome to your student portal.');
      onSuccess();
    } catch (err: any) {
      setError(err?.message || 'Could not update password. Please verify your temporary password.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(15, 23, 42, 0.85)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10000,
      padding: 20
    }}>
      <div style={{
        background: '#ffffff',
        borderRadius: 16,
        width: '100%',
        maxWidth: 480,
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.3)',
        overflow: 'hidden',
        border: '1px solid #e2e8f0'
      }}>
        {/* Header */}
        <div style={{
          background: 'linear-gradient(135deg, #4338ca 0%, #312e81 100%)',
          color: '#ffffff',
          padding: '24px 28px',
          textAlign: 'center'
        }}>
          <div style={{
            width: 48,
            height: 48,
            borderRadius: '50%',
            background: 'rgba(255, 255, 255, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 12px'
          }}>
            <Lock size={24} color="#ffffff" />
          </div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>Choose Your New Password</h2>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: '#c7d2fe', lineHeight: 1.4 }}>
            For your security, please replace your temporary password with a private password of your own.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {error && (
            <div style={{
              background: '#fef2f2',
              color: '#b91c1c',
              padding: '10px 14px',
              borderRadius: 8,
              fontSize: 13,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              border: '1px solid #fecaca'
            }}>
              <ShieldAlert size={16} />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 6 }}>
              Temporary Password <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              type="password"
              required
              placeholder="Enter current temporary password"
              value={currentPassword}
              onChange={e => setCurrentPassword(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: 8,
                border: '1px solid #cbd5e1',
                fontSize: 14,
                boxSizing: 'border-box'
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 6 }}>
              New Password (minimum 8 characters) <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              type="password"
              required
              minLength={8}
              placeholder="Enter new private password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: 8,
                border: '1px solid #cbd5e1',
                fontSize: 14,
                boxSizing: 'border-box'
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 6 }}>
              Confirm New Password <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              type="password"
              required
              minLength={8}
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: 8,
                border: '1px solid #cbd5e1',
                fontSize: 14,
                boxSizing: 'border-box'
              }}
            />
          </div>

          <div style={{
            background: '#f8fafc',
            padding: 12,
            borderRadius: 8,
            fontSize: 12,
            color: '#64748b',
            display: 'flex',
            flexDirection: 'column',
            gap: 4
          }}>
            <div style={{ fontWeight: 600, color: '#334155' }}>Password guidelines:</div>
            <div>• Must be at least 8 characters long</div>
            <div>• Mix uppercase letters, numbers, and symbols for best safety</div>
            <div>• Keep it private — never share your credentials with anyone</div>
          </div>

          <button
            type="submit"
            disabled={saving}
            style={{
              background: '#4f46e5',
              color: '#ffffff',
              border: 'none',
              borderRadius: 8,
              padding: '12px 18px',
              fontSize: 14,
              fontWeight: 700,
              cursor: saving ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              marginTop: 4
            }}
          >
            {saving ? 'Updating Password…' : (
              <>
                <CheckCircle2 size={18} /> Set Password & Continue
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
