import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Shield, ShieldCheck, KeyRound, Search, X, RotateCcw, Check, CheckCircle2,
  AlertCircle, Building2, Users, Award, GraduationCap, HeartHandshake, BookOpen,
  ClipboardCheck, ClipboardList, FileBarChart, Receipt, Briefcase, Wallet,
  MessageSquare, Settings2, RefreshCw, Filter, Sparkles, HelpCircle, Save, CheckCheck
} from 'lucide-react';
import { list, request, type User } from './api';

interface RoleMeta {
  key: string;
  label: string;
  description: string;
  badge: string;
  icon: string;
  priority: number;
}

interface PermissionItem {
  key: string;
  name: string;
  description: string;
  default_roles: string[];
}

interface PermissionModule {
  id: string;
  name: string;
  icon: string;
  description: string;
  permissions: PermissionItem[];
}

interface PermissionsResponse {
  success: boolean;
  school_id: number | null;
  school_name: string;
  roles: RoleMeta[];
  modules: PermissionModule[];
  effective_by_role: Record<string, Record<string, boolean>>;
  defaults_by_role: Record<string, Record<string, boolean>>;
  override_counts: Record<string, number>;
  total_permissions_count: number;
}

interface PermissionsProps {
  user: User;
  notify: (msg: string) => void;
}

export default function Permissions({ user, notify }: PermissionsProps) {
  const isPrincipal = user.role === 'principal';
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [schools, setSchools] = useState<any[]>([]);
  const [selectedSchool, setSelectedSchool] = useState<number | string>(user.school || '');

  const [roles, setRoles] = useState<RoleMeta[]>([]);
  const [modules, setModules] = useState<PermissionModule[]>([]);
  const [selectedRole, setSelectedRole] = useState<string>('teacher');
  const [permissionsState, setPermissionsState] = useState<Record<string, Record<string, boolean>>>({});
  const [defaultsState, setDefaultsState] = useState<Record<string, Record<string, boolean>>>({});
  const [savedPermissionsState, setSavedPermissionsState] = useState<Record<string, Record<string, boolean>>>({});
  const [overrideCounts, setOverrideCounts] = useState<Record<string, number>>({});

  const [search, setSearch] = useState('');
  const [activeModuleFilter, setActiveModuleFilter] = useState<string>('all');
  const [resetModalOpen, setResetModalOpen] = useState(false);

  const visibleRoles = useMemo(() => {
    if (isPrincipal) {
      return roles.filter(r => !['organisation_admin', 'school_admin', 'principal'].includes(r.key));
    }
    return roles;
  }, [roles, isPrincipal]);

  // Load campuses
  useEffect(() => {
    list<any>('schools')
      .then(res => {
        setSchools(res);
        if (isPrincipal && user.school) {
          setSelectedSchool(user.school);
        } else if (res.length > 0 && !selectedSchool) {
          const defaultSch = user.school || res[0].id;
          setSelectedSchool(defaultSch);
        }
      })
      .catch(() => {});
  }, [user.school, isPrincipal]);

  // Load permissions matrix
  const fetchPermissions = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const effectiveSchool = isPrincipal && user.school ? user.school : selectedSchool;
      const qs = effectiveSchool ? `?school=${effectiveSchool}` : '';
      const data = await request<PermissionsResponse>(`permissions/${qs}`);
      if (data && data.success) {
        setRoles(data.roles || []);
        setModules(data.modules || []);
        setPermissionsState(data.effective_by_role || {});
        setSavedPermissionsState(JSON.parse(JSON.stringify(data.effective_by_role || {})));
        setDefaultsState(data.defaults_by_role || {});
        setOverrideCounts(data.override_counts || {});
        const allowedRoles = isPrincipal
          ? (data.roles || []).filter(r => !['organisation_admin', 'school_admin', 'principal'].includes(r.key))
          : (data.roles || []);
        if (!allowedRoles.some(r => r.key === selectedRole) && allowedRoles.length > 0) {
          setSelectedRole(allowedRoles[0].key);
        }
      }
    } catch (e: any) {
      setError(e.message || 'Could not load permissions catalog.');
    } finally {
      setLoading(false);
    }
  }, [selectedSchool]);

  useEffect(() => {
    fetchPermissions();
  }, [fetchPermissions]);

  // Current role metadata
  const currentRoleMeta = useMemo(() => {
    return roles.find(r => r.key === selectedRole) || roles[0];
  }, [roles, selectedRole]);

  // Check if current role has unsaved changes
  const hasUnsavedChanges = useMemo(() => {
    if (!selectedRole || !permissionsState[selectedRole] || !savedPermissionsState[selectedRole]) {
      return false;
    }
    const current = permissionsState[selectedRole];
    const saved = savedPermissionsState[selectedRole];
    return Object.keys(current).some(k => current[k] !== saved[k]);
  }, [selectedRole, permissionsState, savedPermissionsState]);

  // Toggle single permission
  const handleToggle = (permKey: string) => {
    setPermissionsState(prev => {
      const rolePerms = { ...(prev[selectedRole] || {}) };
      rolePerms[permKey] = !rolePerms[permKey];
      return { ...prev, [selectedRole]: rolePerms };
    });
  };

  // Toggle all permissions within a specific module
  const handleToggleModule = (moduleObj: PermissionModule, grantAll: boolean) => {
    setPermissionsState(prev => {
      const rolePerms = { ...(prev[selectedRole] || {}) };
      moduleObj.permissions.forEach(p => {
        rolePerms[p.key] = grantAll;
      });
      return { ...prev, [selectedRole]: rolePerms };
    });
  };

  // Grant all or revoke all for current role
  const handleBulkRoleAction = (grantAll: boolean) => {
    setPermissionsState(prev => {
      const rolePerms = { ...(prev[selectedRole] || {}) };
      modules.forEach(m => {
        m.permissions.forEach(p => {
          rolePerms[p.key] = grantAll;
        });
      });
      return { ...prev, [selectedRole]: rolePerms };
    });
  };

  // Save changes for current role
  const handleSave = async () => {
    if (!selectedRole) return;
    setSaving(true);
    setError('');
    try {
      const payload = {
        role: selectedRole,
        permissions: permissionsState[selectedRole] || {},
        school: selectedSchool || null,
      };
      const res = await request<any>('permissions/', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      if (res.success) {
        notify(`Permissions updated for ${currentRoleMeta?.label || selectedRole}`);
        setSavedPermissionsState(prev => ({
          ...prev,
          [selectedRole]: { ...(permissionsState[selectedRole] || {}) },
        }));
        // Refresh override statistics
        const qs = selectedSchool ? `?school=${selectedSchool}` : '';
        const fresh = await request<PermissionsResponse>(`permissions/${qs}`);
        if (fresh && fresh.override_counts) {
          setOverrideCounts(fresh.override_counts);
        }
      }
    } catch (e: any) {
      setError(e.message || 'Failed to save permissions.');
    } finally {
      setSaving(false);
    }
  };

  // Discard changes
  const handleDiscard = () => {
    setPermissionsState(prev => ({
      ...prev,
      [selectedRole]: { ...(savedPermissionsState[selectedRole] || {}) },
    }));
    notify('Changes discarded.');
  };

  // Reset current role to default baseline
  const handleResetToDefaults = async () => {
    setSaving(true);
    setError('');
    try {
      const payload = {
        role: selectedRole,
        school: selectedSchool || null,
      };
      const res = await request<any>('permissions/reset/', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (res.success) {
        notify(`Permissions for ${currentRoleMeta?.label} reset to system defaults.`);
        setResetModalOpen(false);
        fetchPermissions();
      }
    } catch (e: any) {
      setError(e.message || 'Failed to reset permissions.');
    } finally {
      setSaving(false);
    }
  };

  // Role icon helper
  const getRoleIcon = (iconName: string) => {
    switch (iconName) {
      case 'Building2': return <Building2 size={16} />;
      case 'Shield': return <Shield size={16} />;
      case 'Award': return <Award size={16} />;
      case 'Users': return <Users size={16} />;
      case 'GraduationCap': return <GraduationCap size={16} />;
      case 'HeartHandshake': return <HeartHandshake size={16} />;
      default: return <ShieldCheck size={16} />;
    }
  };

  // Module icon helper
  const getModuleIcon = (iconName: string) => {
    switch (iconName) {
      case 'GraduationCap': return <GraduationCap size={18} />;
      case 'BookOpen': return <BookOpen size={18} />;
      case 'ClipboardCheck': return <ClipboardCheck size={18} />;
      case 'FileBarChart': return <FileBarChart size={18} />;
      case 'ClipboardList': return <ClipboardList size={18} />;
      case 'Award': return <Award size={18} />;
      case 'Receipt': return <Receipt size={18} />;
      case 'Briefcase': return <Briefcase size={18} />;
      case 'Wallet': return <Wallet size={18} />;
      case 'HeartHandshake': return <HeartHandshake size={18} />;
      case 'MessageSquare': return <MessageSquare size={18} />;
      default: return <ShieldCheck size={18} />;
    }
  };

  // Filter modules and permissions based on search and active filter
  const filteredModules = useMemo(() => {
    const q = search.trim().toLowerCase();
    return modules
      .filter(m => activeModuleFilter === 'all' || m.id === activeModuleFilter)
      .map(m => {
        if (!q) return m;
        const matchingPerms = m.permissions.filter(p =>
          p.name.toLowerCase().includes(q) ||
          p.key.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q)
        );
        return {
          ...m,
          permissions: matchingPerms,
        };
      })
      .filter(m => m.permissions.length > 0);
  }, [modules, search, activeModuleFilter]);

  // Compute active permission counts for current role
  const currentRoleGrantedCount = useMemo(() => {
    const roleMap = permissionsState[selectedRole] || {};
    return Object.values(roleMap).filter(Boolean).length;
  }, [permissionsState, selectedRole]);

  const totalPermissionsCount = useMemo(() => {
    return modules.reduce((acc, m) => acc + m.permissions.length, 0);
  }, [modules]);

  const isRoleOverridden = (overrideCounts[selectedRole] || 0) > 0;

  return (
    <div className="permissions-page">
      {/* Top Header */}
      <div className="permissions-header">
        <div>
          <div className="eyebrow">
            <span className="eyebrow-dot" /> ACCESS CONTROL & GOVERNANCE
          </div>
          <h1>Role Permissions Manager</h1>
          <p>
            Configure granular access capabilities across institutional roles.
            Permissions take effect instantly across all campus workflows.
          </p>
        </div>

        <div className="permissions-header-actions">
          {!isPrincipal && schools.length > 1 && (
            <div className="campus-select-wrap">
              <Building2 size={15} />
              <select
                aria-label="Select Campus"
                value={selectedSchool}
                onChange={e => setSelectedSchool(e.target.value)}
              >
                {schools.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.code || `ID:${s.id}`})
                  </option>
                ))}
              </select>
            </div>
          )}

          <button className="outline-btn" onClick={fetchPermissions} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="error-bar">
          <AlertCircle size={18} />
          <span>{error}</span>
          <button onClick={() => setError('')}><X size={15} /></button>
        </div>
      )}

      {/* Role Selector Tabs (Segmented Navigation) */}
      <div className="role-selector-bar">
        <div className="role-tabs-scroll">
          {visibleRoles.map(r => {
            const isSelected = r.key === selectedRole;
            const grantedForThisRole = Object.values(permissionsState[r.key] || {}).filter(Boolean).length;
            const hasOverrides = (overrideCounts[r.key] || 0) > 0;

            return (
              <button
                key={r.key}
                className={`role-tab-btn ${isSelected ? 'active' : ''}`}
                onClick={() => setSelectedRole(r.key)}
              >
                <span className="role-tab-icon">{getRoleIcon(r.icon)}</span>
                <span className="role-tab-label">{r.label}</span>
                <span className="role-tab-count">
                  {grantedForThisRole}/{totalPermissionsCount}
                </span>
                {hasOverrides && (
                  <span className="role-override-dot" title="Customized vs standard defaults" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Role Overview & Toolbar Card */}
      {currentRoleMeta && (
        <div className="role-hero-card">
          <div className="role-hero-left">
            <div className="role-avatar-badge">
              {getRoleIcon(currentRoleMeta.icon)}
            </div>
            <div>
              <div className="role-title-row">
                <h2>{currentRoleMeta.label}</h2>
                <span className="role-tag-pill">{currentRoleMeta.badge}</span>
                {isRoleOverridden && (
                  <span className="override-badge">
                    <Sparkles size={12} /> {overrideCounts[selectedRole]} Custom Overrides Active
                  </span>
                )}
              </div>
              <p className="role-description-text">{currentRoleMeta.description}</p>
            </div>
          </div>

          <div className="role-hero-right">
            <div className="role-stat-chip">
              <strong>{currentRoleGrantedCount}</strong>
              <span>Granted Permissions</span>
            </div>
            <div className="role-stat-chip">
              <strong>{totalPermissionsCount - currentRoleGrantedCount}</strong>
              <span>Restricted</span>
            </div>

            <div className="role-actions-group">
              <button
                className="outline-btn-sm"
                onClick={() => handleBulkRoleAction(true)}
                title="Grant all permissions for this role"
              >
                <CheckCheck size={14} /> Grant All
              </button>
              <button
                className="outline-btn-sm"
                onClick={() => handleBulkRoleAction(false)}
                title="Revoke all permissions for this role"
              >
                <X size={14} /> Revoke All
              </button>
              <button
                className="outline-btn-sm reset-btn"
                onClick={() => setResetModalOpen(true)}
                title="Reset this role to system defaults"
              >
                <RotateCcw size={14} /> Reset Defaults
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filter & Search Bar */}
      <div className="permissions-filter-bar">
        <div className="searchbox">
          <Search size={16} />
          <input
            type="text"
            placeholder={`Search permissions for ${currentRoleMeta?.label || 'role'}...`}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button onClick={() => setSearch('')}>
              <X size={14} />
            </button>
          )}
        </div>

        <div className="module-filter-pills">
          <button
            className={`filter-pill ${activeModuleFilter === 'all' ? 'active' : ''}`}
            onClick={() => setActiveModuleFilter('all')}
          >
            All Modules ({modules.length})
          </button>
          {modules.map(m => (
            <button
              key={m.id}
              className={`filter-pill ${activeModuleFilter === m.id ? 'active' : ''}`}
              onClick={() => setActiveModuleFilter(m.id)}
            >
              {m.name}
            </button>
          ))}
        </div>
      </div>

      {/* Permission Modules Cards Grid */}
      {loading ? (
        <div className="permissions-loading">
          <RefreshCw size={26} className="spin" />
          <p>Loading permissions catalog…</p>
        </div>
      ) : filteredModules.length === 0 ? (
        <div className="permissions-empty">
          <Search size={32} />
          <h3>No matching permissions found</h3>
          <p>Try clearing your search query or choosing another module.</p>
          <button className="outline-btn" onClick={() => { setSearch(''); setActiveModuleFilter('all'); }}>
            Clear search filters
          </button>
        </div>
      ) : (
        <div className="permissions-modules-grid">
          {filteredModules.map(moduleObj => {
            const rolePerms = permissionsState[selectedRole] || {};
            const defaults = defaultsState[selectedRole] || {};
            const activeInModule = moduleObj.permissions.filter(p => rolePerms[p.key]).length;
            const allActive = activeInModule === moduleObj.permissions.length;

            return (
              <div className="permission-module-card" key={moduleObj.id}>
                <div className="module-card-header">
                  <div className="module-title-group">
                    <div className="module-icon-wrap">
                      {getModuleIcon(moduleObj.icon)}
                    </div>
                    <div>
                      <h3>{moduleObj.name}</h3>
                      <p>{moduleObj.description}</p>
                    </div>
                  </div>

                  <div className="module-header-actions">
                    <span className="module-count-badge">
                      {activeInModule} of {moduleObj.permissions.length} active
                    </span>
                    <button
                      className="text-btn-sm"
                      onClick={() => handleToggleModule(moduleObj, !allActive)}
                    >
                      {allActive ? 'Disable All' : 'Enable All'}
                    </button>
                  </div>
                </div>

                <div className="module-permissions-list">
                  {moduleObj.permissions.map(perm => {
                    const isGranted = Boolean(rolePerms[perm.key]);
                    const isDefault = Boolean(defaults[perm.key]);
                    const isOverridden = isGranted !== isDefault;

                    return (
                      <div
                        className={`permission-row ${isGranted ? 'granted' : 'denied'} ${isOverridden ? 'customized' : ''}`}
                        key={perm.key}
                        onClick={() => handleToggle(perm.key)}
                      >
                        <div className="permission-row-info">
                          <div className="permission-row-title">
                            <strong>{perm.name}</strong>
                            <code className="permission-key-pill">{perm.key}</code>
                            {isOverridden && (
                              <span className="override-indicator" title={`Standard default was ${isDefault ? 'Enabled' : 'Disabled'}`}>
                                Custom
                              </span>
                            )}
                          </div>
                          <p className="permission-row-desc">{perm.description}</p>
                        </div>

                        <div className="permission-row-toggle">
                          <label
                            className="toggle-switch"
                            onClick={e => e.stopPropagation()}
                          >
                            <input
                              type="checkbox"
                              checked={isGranted}
                              onChange={() => handleToggle(perm.key)}
                            />
                            <span className="toggle-slider" />
                          </label>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Floating Unsaved Changes Bar */}
      {hasUnsavedChanges && (
        <div className="permissions-floating-bar">
          <div className="floating-bar-content">
            <div className="floating-bar-info">
              <AlertCircle size={18} className="pulse-icon" />
              <span>
                You have unsaved permission modifications for <strong>{currentRoleMeta?.label}</strong>.
              </span>
            </div>

            <div className="floating-bar-actions">
              <button
                className="outline-btn discard-btn"
                onClick={handleDiscard}
                disabled={saving}
              >
                Discard
              </button>
              <button
                className="primary-btn save-btn"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? (
                  <>
                    <RefreshCw size={14} className="spin" /> Saving…
                  </>
                ) : (
                  <>
                    <Save size={14} /> Save Permissions
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Confirmation Modal */}
      {resetModalOpen && (
        <div className="modal-backdrop" onClick={() => setResetModalOpen(false)}>
          <div className="modal-card reset-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-icon-warning">
                <RotateCcw size={22} />
              </div>
              <div>
                <h3>Reset Role Permissions</h3>
                <p>Confirm restoring system baseline defaults</p>
              </div>
            </div>

            <div className="modal-body">
              <p>
                Are you sure you want to reset all permissions for <strong>{currentRoleMeta?.label}</strong> back to standard documented defaults?
              </p>
              <div className="modal-alert-box">
                Any custom overrides saved for this role at campus <strong>{schools.find(s => s.id === Number(selectedSchool))?.name || 'All'}</strong> will be removed.
              </div>
            </div>

            <div className="modal-footer">
              <button
                className="outline-btn"
                onClick={() => setResetModalOpen(false)}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                className="primary-btn danger-btn"
                onClick={handleResetToDefaults}
                disabled={saving}
              >
                {saving ? 'Resetting…' : 'Yes, Reset to Defaults'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
