import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  KeyRound,
  Lock,
  Moon,
  Palette,
  Save,
  School,
  ShieldCheck,
  SlidersHorizontal,
  Sun,
  Trash2,
  Upload,
  UserRound,
} from 'lucide-react';
import { updateProfile, changePassword, type User } from './api';
import { applyTheme, getStoredTheme, resolveHex, THEME_PRESETS, type ThemeMode } from './theme';
import './style.css';

interface SettingsProps {
  user: User;
  onUserUpdated: (u: User) => void;
  notify: (msg: string) => void;
}

export default function Settings({ user, onUserUpdated, notify }: SettingsProps) {
  const stored = getStoredTheme();
  const [mode, setMode] = useState<ThemeMode>(stored.mode);
  const [accent, setAccent] = useState<string>(stored.colorHex);

  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<{ hex?: string; mode?: ThemeMode; isDark?: boolean }>;
      if (ce.detail?.mode) setMode(ce.detail.mode);
      if (ce.detail?.hex) {
        setAccent(ce.detail.hex);
        setAvatarColor(ce.detail.hex);
      }
    };
    window.addEventListener('optimus_theme_change', handler);
    return () => window.removeEventListener('optimus_theme_change', handler);
  }, []);

  // Profile state
  const [firstName, setFirstName] = useState(user.first_name || user.name.split(' ')[0] || '');
  const [lastName, setLastName] = useState(user.last_name || user.name.split(' ').slice(1).join(' ') || '');
  const [email, setEmail] = useState(user.email || '');
  const [avatarColor, setAvatarColor] = useState(user.avatar_color ? resolveHex(user.avatar_color) : stored.colorHex);
  const [avatarImage, setAvatarImage] = useState(user.avatar_image || '');

  const handleImageFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      notify('Image must be under 5MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxDim = 400;
        let w = img.width, h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) { h = Math.round((h * maxDim) / w); w = maxDim; }
          else { w = Math.round((w * maxDim) / h); h = maxDim; }
        }
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, w, h);
          setAvatarImage(canvas.toDataURL('image/jpeg', 0.88));
          notify('Photo ready to save');
        }
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

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

  const handleColorChange = (hexOrId: string) => {
    const hex = resolveHex(hexOrId);
    setAccent(hex);
    setAvatarColor(hex);
    applyTheme(mode, hex);
    const preset = THEME_PRESETS.find(p => p.hex.toLowerCase() === hex.toLowerCase());
    notify(`Theme color updated to ${preset?.name || hex}`);
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
        avatar_image: avatarImage,
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
      await changePassword({
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
            Choose your preferred theme mode and primary color palette. Changing color transforms all primary
            buttons, sidebar tabs, highlights, and your profile avatar across the entire system.
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
              {THEME_PRESETS.map(tc => {
                const isSelected = accent.toLowerCase() === tc.hex.toLowerCase();
                const isYellow = tc.hex === '#eab308';
                return (
                  <button
                    key={tc.id}
                    type="button"
                    className={`theme-color-card ${isSelected ? 'active' : ''}`}
                    onClick={() => handleColorChange(tc.hex)}
                  >
                    <div className="theme-swatch" style={{ background: tc.hex }}>
                      {isSelected && <Check size={16} color={isYellow ? '#1e2433' : '#fff'} strokeWidth={3} />}
                    </div>
                    <div className="theme-color-info">
                      <strong>{tc.name}</strong>
                      <span style={{ color: tc.hex }}>{tc.hex}</span>
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 8, padding: 12, background: 'var(--brand-primary-light, #f7f6fe)', borderRadius: 14 }}>
              <div style={{ width: 64, height: 64, borderRadius: 16, background: avatarColor, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 22, fontWeight: 800, overflow: 'hidden', flexShrink: 0, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                {avatarImage ? <img src={avatarImage} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (firstName[0] || 'U') + (lastName[0] || '')}
              </div>
              <div>
                <label className="action-btn-sm" style={{ cursor: 'pointer', display: 'inline-flex' }}>
                  <Upload size={13} /> Upload profile photo
                  <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageFile} />
                </label>
                {avatarImage && (
                  <button type="button" className="action-btn-sm delete-btn" style={{ marginLeft: 8 }} onClick={() => setAvatarImage('')}>
                    <Trash2 size={13} /> Remove
                  </button>
                )}
                <p style={{ fontSize: 11, color: '#888', margin: '5px 0 0' }}>JPG, PNG or WebP image. Stored with your account profile.</p>
              </div>
            </div>
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
              <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
                {THEME_PRESETS.map(preset => {
                  const isSelected = avatarColor.toLowerCase() === preset.hex.toLowerCase();
                  const isYellow = preset.hex === '#eab308';
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      title={preset.name}
                      className={`avatar-swatch ${isSelected ? 'selected' : ''}`}
                      style={{ background: preset.hex }}
                      onClick={() => handleColorChange(preset.hex)}
                    >
                      {isSelected && <Check size={14} color={isYellow ? '#1e2433' : '#fff'} strokeWidth={3} />}
                    </button>
                  );
                })}
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
