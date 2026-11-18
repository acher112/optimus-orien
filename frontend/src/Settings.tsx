import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  KeyRound,
  Lock,
  Moon,
  Palette,
  Pipette,
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
import PasswordField from './PasswordField';
import { UserProfileView, type UserProfileData } from './UserProfileView';
import './style.css';

interface SettingsProps {
  user: User;
  onUserUpdated: (u: User) => void;
  notify: (msg: string) => void;
}

function getContrastColor(hex: string): string {
  const clean = hex.replace('#', '').trim();
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16);
    const g = parseInt(clean[1] + clean[1], 16);
    const b = parseInt(clean[2] + clean[2], 16);
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return lum > 0.62 ? '#1e2433' : '#ffffff';
  }
  if (clean.length === 6) {
    const r = parseInt(clean.substring(0, 2), 16);
    const g = parseInt(clean.substring(2, 4), 16);
    const b = parseInt(clean.substring(4, 6), 16);
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return lum > 0.62 ? '#1e2433' : '#ffffff';
  }
  return '#ffffff';
}

export default function Settings({ user, onUserUpdated, notify }: SettingsProps) {
  const stored = getStoredTheme();
  const [mode, setMode] = useState<ThemeMode>(stored.mode);
  const [accent, setAccent] = useState<string>(stored.colorHex);
  const [customHexInput, setCustomHexInput] = useState<string>(stored.colorHex);

  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<{ hex?: string; mode?: ThemeMode; isDark?: boolean }>;
      if (ce.detail?.mode) setMode(ce.detail.mode);
      if (ce.detail?.hex) {
        setAccent(ce.detail.hex);
        setCustomHexInput(ce.detail.hex);
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
    setCustomHexInput(hex);
    setAvatarColor(hex);
    applyTheme(mode, hex);
    const preset = THEME_PRESETS.find(p => p.hex.toLowerCase() === hex.toLowerCase());
    notify(`Theme color updated to ${preset?.name || hex.toUpperCase()}`);
  };

  const handleAvatarColorChange = (hexOrId: string) => {
    const hex = resolveHex(hexOrId);
    setAvatarColor(hex);
    setAccent(hex);
    setCustomHexInput(hex);
    applyTheme(mode, hex);
    const preset = THEME_PRESETS.find(p => p.hex.toLowerCase() === hex.toLowerCase());
    notify(`Profile avatar color set to ${preset?.name || hex.toUpperCase()}`);
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

  const [activeTab, setActiveTab] = useState<'profile' | 'settings'>('profile');

  const userProfileData: UserProfileData = {
    id: user.id,
    name: user.name || `${firstName} ${lastName}`.trim() || 'User Profile',
    role: user.role,
    registryId: user.role === 'teacher'
      ? `FACULTY-2024-${String(user.id).padStart(4, '0')}`
      : user.role === 'principal'
      ? `PRINCIPAL-2024-${String(user.id).padStart(4, '0')}`
      : `ADMIN-2024-${String(user.id).padStart(4, '0')}`,
    email: email || user.email,
    phone: (user as any).phone || '+1 (555) 019-2834',
    idNumber: (user as any).national_id || `SSM-${user.id}-9942`,
    location: user.school_name || 'Central Campus - Islamabad',
    avatarColor: avatarColor,
    avatarImage: avatarImage,
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1>{activeTab === 'profile' ? (user.role === 'teacher' ? 'Teacher Profile' : user.role === 'principal' ? 'Principal Profile' : 'Profile') : 'Settings'}</h1>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 24, borderBottom: '1px solid var(--border-color, #e2e8f0)', paddingBottom: 14 }}>
        <button
          type="button"
          onClick={() => setActiveTab('profile')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 18px',
            borderRadius: 12,
            border: 'none',
            cursor: 'pointer',
            fontSize: 14,
            fontWeight: 700,
            background: activeTab === 'profile' ? 'var(--primary-color, #4338ca)' : 'var(--bg-subtle, #f1f5f9)',
            color: activeTab === 'profile' ? '#ffffff' : 'var(--text-secondary, #64748b)',
            boxShadow: activeTab === 'profile' ? '0 4px 12px rgba(67, 56, 202, 0.25)' : 'none',
            transition: 'all 0.15s ease'
          }}
        >
          <UserRound size={16} />
          {user.role === 'teacher' ? 'Teacher 360° Profile' : user.role === 'principal' ? 'Principal 360° Profile' : '360° Career Profile'}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('settings')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 18px',
            borderRadius: 12,
            border: 'none',
            cursor: 'pointer',
            fontSize: 14,
            fontWeight: 700,
            background: activeTab === 'settings' ? 'var(--primary-color, #4338ca)' : 'var(--bg-subtle, #f1f5f9)',
            color: activeTab === 'settings' ? '#ffffff' : 'var(--text-secondary, #64748b)',
            boxShadow: activeTab === 'settings' ? '0 4px 12px rgba(67, 56, 202, 0.25)' : 'none',
            transition: 'all 0.15s ease'
          }}
        >
          <SlidersHorizontal size={16} />
          Settings & Preferences
        </button>
      </div>

      {activeTab === 'profile' ? (
        <div style={{ marginBottom: 30 }}>
          <UserProfileView
            profile={userProfileData}
            onEdit={() => setActiveTab('settings')}
          />
        </div>
      ) : (
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: '#6c7489', textTransform: 'uppercase', letterSpacing: 0.8 }}>
                Workspace Accent Color
              </span>
              <span style={{ fontSize: 12, fontWeight: 700, color: accent }}>
                {(() => {
                  const p = THEME_PRESETS.find(tc => tc.hex.toLowerCase() === accent.toLowerCase());
                  return p ? `${p.name} (${p.hex})` : `Custom (${accent.toUpperCase()})`;
                })()}
              </span>
            </div>
            <div className="theme-color-grid">
              {THEME_PRESETS.map(tc => {
                const isSelected = accent.toLowerCase() === tc.hex.toLowerCase();
                const isBright = getContrastColor(tc.hex) === '#1e2433';
                return (
                  <button
                    key={tc.id}
                    type="button"
                    className={`theme-color-card ${isSelected ? 'active' : ''}`}
                    onClick={() => handleColorChange(tc.hex)}
                  >
                    <div className="theme-swatch" style={{ background: tc.hex }}>
                      {isSelected && <Check size={16} color={isBright ? '#1e2433' : '#fff'} strokeWidth={3} />}
                    </div>
                    <div className="theme-color-info">
                      <strong>{tc.name}</strong>
                      <span style={{ color: tc.hex }}>{tc.hex}</span>
                    </div>
                  </button>
                );
              })}

              {/* Custom Color Card in Grid */}
              {(() => {
                const isCustomSelected = !THEME_PRESETS.some(
                  p => p.hex.toLowerCase() === accent.toLowerCase()
                );
                const contrastColor = getContrastColor(accent);
                return (
                  <label
                    className={`theme-color-card custom-card ${isCustomSelected ? 'active' : ''}`}
                    title="Click to open color picker for custom theme color"
                  >
                    <input
                      type="color"
                      value={accent.startsWith('#') && accent.length === 7 ? accent : '#715ee8'}
                      onChange={e => handleColorChange(e.target.value)}
                    />
                    <div
                      className="theme-swatch"
                      style={{
                        background: isCustomSelected
                          ? accent
                          : 'conic-gradient(from 180deg at 50% 50%, #ff0000 0deg, #ffa500 51deg, #ffff00 102deg, #008000 153deg, #0000ff 204deg, #4b0082 255deg, #ee82ee 306deg, #ff0000 360deg)',
                        boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.12)',
                      }}
                    >
                      {isCustomSelected ? (
                        <Check size={16} color={contrastColor} strokeWidth={3} />
                      ) : (
                        <Pipette size={14} color="#fff" style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.7))' }} />
                      )}
                    </div>
                    <div className="theme-color-info">
                      <strong>{isCustomSelected ? 'Custom Color' : 'Custom Picker'}</strong>
                      <span style={{ color: isCustomSelected ? accent : '#6c7489' }}>
                        {isCustomSelected ? accent.toUpperCase() : 'Choose any color'}
                      </span>
                    </div>
                  </label>
                );
              })()}
            </div>

            {/* Custom Accent Toolbar with Direct Hex Code & Color Spectrum */}
            <div className="custom-color-toolbar">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <label
                  style={{
                    position: 'relative',
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    overflow: 'hidden',
                    background: accent,
                    boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
                    border: '2px solid #fff',
                    flexShrink: 0,
                    cursor: 'pointer',
                    display: 'grid',
                    placeItems: 'center',
                  }}
                  title="Click to open color spectrum"
                >
                  <input
                    type="color"
                    value={accent.startsWith('#') && accent.length === 7 ? accent : '#715ee8'}
                    onChange={e => handleColorChange(e.target.value)}
                    style={{
                      position: 'absolute',
                      inset: -10,
                      width: '200%',
                      height: '200%',
                      opacity: 0,
                      cursor: 'pointer',
                    }}
                  />
                  <Pipette size={14} color={getContrastColor(accent)} />
                </label>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'inherit' }}>
                    Custom Color Fine-Tuning
                  </div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>
                    Pick any shade or enter an exact 6-character hex code
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <span
                    style={{
                      position: 'absolute',
                      left: 10,
                      fontSize: 13,
                      fontWeight: 700,
                      color: '#94a3b8',
                      pointerEvents: 'none',
                    }}
                  >
                    #
                  </span>
                  <input
                    type="text"
                    placeholder="715EE8"
                    maxLength={6}
                    value={customHexInput.replace('#', '')}
                    onChange={e => {
                      const val = e.target.value.replace(/[^0-9a-fA-F]/g, '');
                      setCustomHexInput(val);
                      if (val.length === 6) {
                        handleColorChange(`#${val}`);
                      }
                    }}
                    style={{
                      paddingLeft: 24,
                      paddingRight: 10,
                      paddingTop: 6,
                      paddingBottom: 6,
                      width: 105,
                      fontFamily: 'monospace',
                      fontSize: 13,
                      fontWeight: 700,
                      borderRadius: 8,
                      border: '1px solid #cbd5e1',
                      background: '#fff',
                      color: '#1e293b',
                      textTransform: 'uppercase',
                    }}
                  />
                </div>
                <label
                  className="action-btn-sm"
                  style={{
                    cursor: 'pointer',
                    position: 'relative',
                    margin: 0,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '7px 12px',
                    borderRadius: 8,
                    fontWeight: 600,
                    fontSize: 12,
                  }}
                >
                  <Pipette size={13} />
                  <span>Color Spectrum</span>
                  <input
                    type="color"
                    value={accent.startsWith('#') && accent.length === 7 ? accent : '#715ee8'}
                    onChange={e => handleColorChange(e.target.value)}
                    style={{
                      position: 'absolute',
                      opacity: 0,
                      inset: 0,
                      width: '100%',
                      height: '100%',
                      cursor: 'pointer',
                    }}
                  />
                </label>
              </div>
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span className="settings-field-label">
                  Avatar Color
                </span>
                <span style={{ fontSize: 11, fontWeight: 700, color: avatarColor }}>
                  {avatarColor.toUpperCase()}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap', alignItems: 'center' }}>
                {THEME_PRESETS.map(preset => {
                  const isSelected = avatarColor.toLowerCase() === preset.hex.toLowerCase();
                  const isBright = getContrastColor(preset.hex) === '#1e2433';
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      title={preset.name}
                      className={`avatar-swatch ${isSelected ? 'selected' : ''}`}
                      style={{ background: preset.hex }}
                      onClick={() => handleAvatarColorChange(preset.hex)}
                    >
                      {isSelected && <Check size={14} color={isBright ? '#1e2433' : '#fff'} strokeWidth={3} />}
                    </button>
                  );
                })}

                {/* Custom Avatar Swatch with Color Picker */}
                {(() => {
                  const isCustomAvatar = !THEME_PRESETS.some(
                    p => p.hex.toLowerCase() === avatarColor.toLowerCase()
                  );
                  const contrastColor = getContrastColor(avatarColor);
                  return (
                    <label
                      className={`avatar-swatch custom-swatch ${isCustomAvatar ? 'selected' : ''}`}
                      title={isCustomAvatar ? `Custom Color: ${avatarColor}` : 'Pick custom avatar color'}
                      style={{
                        cursor: 'pointer',
                        background: isCustomAvatar
                          ? avatarColor
                          : 'conic-gradient(from 180deg at 50% 50%, #ff0000 0deg, #ffa500 51deg, #ffff00 102deg, #008000 153deg, #0000ff 204deg, #4b0082 255deg, #ee82ee 306deg, #ff0000 360deg)',
                        boxShadow: isCustomAvatar ? undefined : 'inset 0 0 0 1px rgba(0,0,0,0.12)',
                        display: 'grid',
                        placeItems: 'center',
                      }}
                    >
                      <input
                        type="color"
                        value={avatarColor.startsWith('#') && avatarColor.length === 7 ? avatarColor : '#715ee8'}
                        onChange={e => handleAvatarColorChange(e.target.value)}
                      />
                      {isCustomAvatar ? (
                        <Check size={14} color={contrastColor} strokeWidth={3} />
                      ) : (
                        <Pipette size={13} color="#fff" style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.8))' }} />
                      )}
                    </label>
                  );
                })()}

                {/* Hex text input for direct entry */}
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 4 }}>
                  <span style={{ fontSize: 11, color: '#64748b', fontWeight: 700 }}>HEX</span>
                  <input
                    type="text"
                    maxLength={7}
                    placeholder="#715EE8"
                    value={avatarColor.toUpperCase()}
                    onChange={e => {
                      let val = e.target.value.trim();
                      if (!val.startsWith('#') && val.length > 0) val = '#' + val;
                      setAvatarColor(val);
                      if (/^#[0-9a-fA-F]{6}$/.test(val)) {
                        handleAvatarColorChange(val);
                      }
                    }}
                    style={{
                      width: 84,
                      padding: '4px 6px',
                      fontSize: 11,
                      fontFamily: 'monospace',
                      fontWeight: 700,
                      borderRadius: 6,
                      border: '1px solid #cbd5e1',
                      background: '#fff',
                      color: '#1e293b',
                    }}
                  />
                </div>
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
              <PasswordField
                required
                className="fx-select"
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
              />
            </label>

            <label className="settings-field-label">
              New password (min 8 chars)
              <PasswordField
                required
                minLength={8}
                className="fx-select"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
              />
            </label>

            <label className="settings-field-label">
              Confirm new password
              <PasswordField
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
      )}
    </>
  );
}
