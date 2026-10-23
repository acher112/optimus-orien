import React, { useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  KeyRound,
  Lock,
  Moon,
  Paintbrush,
  Palette,
  Save,
  School,
  ShieldCheck,
  SlidersHorizontal,
  Sun,
  UserRound,
} from 'lucide-react';
import { updateProfile, type User } from './api';
import { applyTheme, getStoredTheme, THEME_COLORS, type ThemeColor, type ThemeMode } from './theme';
import './style.css';

interface SettingsProps {
  user: User;
  onUserUpdated: (u: User) => void;
  notify: (msg: string) => void;
}

const AVATAR_COLORS = [
  '#715ee8',
  '#10b981',
  '#2563eb',
  '#e11d48',
  '#f59e0b',
  '#8b5cf6',
  '#06b6d4',
  '#475569',
];

export default function Settings({ user, onUserUpdated, notify }: SettingsProps) {
  const stored = getStoredTheme();
  const [mode, setMode] = useState<ThemeMode>(stored.mode);
  const [accent, setAccent] = useState<ThemeColor>(stored.color);

  // Profile state
  const [firstName, setFirstName] = useState(user.first_name || user.name.split(' ')[0] || '');
  const [lastName, setLastName] = useState(user.last_name || user.name.split(' ').slice(1).join(' ') || '');
  const [email, setEmail] = useState(user.email || '');
  const [avatarColor, setAvatarColor] = useState(user.avatar_color || '#715ee8');

  // Password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [profileMsg, setProfileMsg] = useState('');
  const [passwordMsg, setPasswordMsg] = useState('');
  const [profileErr, setProfileErr] = useState('');
  const [passwordErr, setPasswordErr] = useState('');

  const handleModeChange = (newMode: ThemeMode) => {
    setMode(newMode);
    applyTheme(newMode, accent);
    notify(`Theme mode switched to ${newMode}`);
  };

  const handleColorChange = (newColor: ThemeColor) => {
    setAccent(newColor);
    applyTheme(mode, newColor);
    notify(`Accent color theme updated`);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    setProfileErr('');
    setProfileMsg('');
    try {
      const updated = await updateProfile({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim(),
        avatar_color: avatarColor,
      });
      onUserUpdated(updated);
      setProfileMsg('Profile updated successfully');
      notify('Profile updated successfully');
    } catch (err) {
      setProfileErr(err instanceof Error ? err.message : 'Could not update profile');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSavePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordErr('');
    setPasswordMsg('');

    if (newPassword.length < 8) {
      setPasswordErr('New password must be at least 8 characters long');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordErr('New password and confirmation do not match');
      return;
    }

    setSavingPassword(true);
    try {
      await updateProfile({
        current_password: currentPassword,
        password: newPassword,
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordMsg('Password changed successfully');
      notify('Password changed successfully');
    } catch (err) {
      setPasswordErr(err instanceof Error ? err.message : 'Could not change password');
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <div className="eyebrow">PREFERENCES / WORKSPACE</div>
          <h1>Settings &amp; Preferences</h1>
          <p>Customise your profile details, personal color themes, and workspace experience.</p>
        </div>
      </div>

      <div className="settings-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))' }}>
        {/* Appearance & Themes Section */}
        <section className="panel setting-card" style={{ gridColumn: '1 / -1' }}>
          <div className="setting-icon">
            <Palette size={23} />
          </div>
          <h3>Appearance &amp; Theme Customisation</h3>
          <p>
            Choose your preferred theme mode and primary color palette. Your selection is automatically remembered
            across all sessions and page refreshes.
          </p>

          <div style={{ marginTop: 18, marginBottom: 20 }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: '#6c7489', textTransform: 'uppercase', letterSpacing: 0.8 }}>
              Theme Mode
            </span>
            <div className="login-tabs" style={{ marginTop: 8, maxWidth: 380 }}>
              <button
                type="button"
                className={`login-tab ${mode === 'light' ? 'on' : ''}`}
                onClick={() => handleModeChange('light')}
              >
                <Sun size={15} /> Light
              </button>
              <button
                type="button"
                className={`login-tab ${mode === 'dark' ? 'on' : ''}`}
                onClick={() => handleModeChange('dark')}
              >
                <Moon size={15} /> Dark
              </button>
              <button
                type="button"
                className={`login-tab ${mode === 'system' ? 'on' : ''}`}
                onClick={() => handleModeChange('system')}
              >
                <SlidersHorizontal size={15} /> System
              </button>
            </div>
          </div>

          <div>
            <span style={{ fontSize: 11, fontWeight: 800, color: '#6c7489', textTransform: 'uppercase', letterSpacing: 0.8 }}>
              Workspace Accent Color
            </span>
            <div className="theme-color-grid">
              {THEME_COLORS.map(tc => {
                const isSelected = accent === tc.id;
                return (
                  <button
                    key={tc.id}
                    type="button"
                    className={`theme-color-card ${isSelected ? 'active' : ''}`}
                    onClick={() => handleColorChange(tc.id)}
                  >
                    <div className="theme-swatch" style={{ background: tc.primary }}>
                      {isSelected && <Check size={16} color="#fff" strokeWidth={3} />}
                    </div>
                    <div className="theme-color-info">
                      <strong>{tc.name}</strong>
                      <span style={{ color: tc.primary }}>{tc.primary}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* Profile Information Section */}
        <section className="panel setting-card">
          <div className="setting-icon">
            <UserRound size={23} />
          </div>
          <h3>Profile details</h3>
          <p>Update your personal name, email address, and profile avatar color.</p>

          {profileMsg && (
            <div className="setup-success" role="status" style={{ margin: '10px 0' }}>
              <CheckCircle2 size={16} /> {profileMsg}
            </div>
          )}
          {profileErr && (
            <div className="hr-error" style={{ margin: '10px 0' }}>
              <AlertCircle size={16} /> {profileErr}
            </div>
          )}

          <form onSubmit={handleSaveProfile} style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <label className="settings-field-label">
                First name
                <input
                  type="text"
                  required
                  className="fx-select"
                  value={firstName}
                  onChange={e => setFirstName(e.target.value)}
                />
              </label>
              <label className="settings-field-label">
                Last name
                <input
                  type="text"
                  required
                  className="fx-select"
                  value={lastName}
                  onChange={e => setLastName(e.target.value)}
                />
              </label>
            </div>

            <label className="settings-field-label">
              Email address
              <input
                type="email"
                className="fx-select"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </label>

            <div>
              <span className="settings-field-label" style={{ display: 'block', marginBottom: 6 }}>
                Avatar Color
              </span>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {AVATAR_COLORS.map(c => (
                  <button
                    key={c}
                    type="button"
                    className={`avatar-swatch ${avatarColor === c ? 'selected' : ''}`}
                    style={{ background: c }}
                    onClick={() => setAvatarColor(c)}
                  >
                    {avatarColor === c && <Check size={14} color="#fff" strokeWidth={3} />}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginTop: 10 }}>
              <button type="submit" className="primary-btn" disabled={savingProfile}>
                <Save size={15} /> {savingProfile ? 'Saving...' : 'Save Profile'}
              </button>
            </div>
          </form>
        </section>

        {/* Change Password Section */}
        <section className="panel setting-card">
          <div className="setting-icon">
            <Lock size={23} />
          </div>
          <h3>Change password</h3>
          <p>Protect your account with a secure password of at least 8 characters.</p>

          {passwordMsg && (
            <div className="setup-success" role="status" style={{ margin: '10px 0' }}>
              <CheckCircle2 size={16} /> {passwordMsg}
            </div>
          )}
          {passwordErr && (
            <div className="hr-error" style={{ margin: '10px 0' }}>
              <AlertCircle size={16} /> {passwordErr}
            </div>
          )}

          <form onSubmit={handleSavePassword} style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 14 }}>
            <label className="settings-field-label">
              Current password
              <input
                type="password"
                required
                className="fx-select"
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
              />
            </label>

            <label className="settings-field-label">
              New password (min 8 chars)
              <input
                type="password"
                required
                minLength={8}
                className="fx-select"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
              />
            </label>

            <label className="settings-field-label">
              Confirm new password
              <input
                type="password"
                required
                minLength={8}
                className="fx-select"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
              />
            </label>

            <div style={{ marginTop: 10 }}>
              <button type="submit" className="primary-btn" disabled={savingPassword}>
                <KeyRound size={15} /> {savingPassword ? 'Updating...' : 'Update Password'}
              </button>
            </div>
          </form>
        </section>

        {/* Organisation & Governance */}
        <section className="panel setting-card">
          <div className="setting-icon">
            <School size={23} />
          </div>
          <h3>Workspace &amp; Organisation</h3>
          <p>Educational network governance and campus assignment details.</p>

          <div className="setting-detail">
            <span>Username</span>
            <strong>{user.username}</strong>
          </div>
          <div className="setting-detail">
            <span>Role</span>
            <strong style={{ textTransform: 'capitalize' }}>{user.role.replaceAll('_', ' ')}</strong>
          </div>
          {user.organisation_name && (
            <div className="setting-detail">
              <span>Organisation</span>
              <strong>{user.organisation_name}</strong>
            </div>
          )}
          {user.school_name && (
            <div className="setting-detail">
              <span>Campus</span>
              <strong>{user.school_name}</strong>
            </div>
          )}
          <div className="setting-detail">
            <span>Data Protection</span>
            <strong style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#10b981' }}>
              <ShieldCheck size={14} /> Active
            </strong>
          </div>
        </section>
      </div>
    </>
  );
}
