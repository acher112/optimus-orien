import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle, Building2, Check, CheckCircle2, ChevronRight, Copy, Key,
  Mail, Plus, RefreshCw, Shield, ShieldAlert, ShieldCheck, UserCheck, Users, X
} from 'lucide-react';
import { request, type User } from './api';
import './hr.css';

type R = Record<string, any>;
type Tab = 'overview' | 'subscriptions' | 'support_grants' | 'invitations';

export default function PlatformOwner({ user, notify }: { user: User; notify: (m: string) => void }) {
  const [tab, setTab] = useState<Tab>('overview');
  const [data, setData] = useState<R | null>(null);
  const [grants, setGrants] = useState<R[]>([]);
  const [invites, setInvites] = useState<R[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [bump, setBump] = useState(0);

  // Modals
  const [planModal, setPlanModal] = useState(false);
  const [planName, setPlanName] = useState('');
  const [planBasis, setPlanBasis] = useState('per_student');
  const [planPrice, setPlanPrice] = useState('1.50');
  const [planCurrency, setPlanCurrency] = useState('USD');

  const [inviteModal, setInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('teacher');
  const [newInviteLink, setNewInviteLink] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (user.is_superuser) {
        const ov = await request<R>('platform/overview/');
        setData(ov);
      }
      const [grantsRes, invitesRes] = await Promise.all([
        request<R>('platform/support-grants/'),
        request<R>('invitations/')
      ]);
      setGrants(grantsRes.results || []);
      setInvites(invitesRes.results || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load platform owner data');
    } finally {
      setLoading(false);
    }
  }, [user.is_superuser]);

  useEffect(() => { loadData(); }, [loadData, bump]);

  const handleCreatePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await request<R>('platform/plans/', {
        method: 'POST',
        body: JSON.stringify({
          name: planName,
          billing_basis: planBasis,
          price_per_unit: planPrice,
          currency: planCurrency
        })
      });
      notify(`Plan '${planName}' created.`);
      setPlanModal(false);
      setBump(b => b + 1);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Plan creation failed');
    }
  };

  const handleIssueInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await request<R>('invitations/', {
        method: 'POST',
        body: JSON.stringify({
          email: inviteEmail,
          role: inviteRole
        })
      });
      notify(`Invitation generated for ${res.email}`);
      setNewInviteLink(`${window.location.origin}${res.invite_url}`);
      setInviteEmail('');
      setBump(b => b + 1);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to generate invitation');
    }
  };

  const handleRevokeGrant = async (id: number) => {
    try {
      await request<R>(`platform/support-grants/${id}/revoke/`, { method: 'POST' });
      notify('Support access grant revoked.');
      setBump(b => b + 1);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to revoke grant');
    }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <div className="eyebrow">PLATFORM GOVERNANCE & SAAS CONSOLE</div>
          <h1>Platform Owner</h1>
          <p>Tenant organisations, subscription tiers, audited support-access grants, and security invitations.</p>
        </div>
        <div className="fx-filters">
          <button className="outline-btn" onClick={() => setBump(b => b + 1)}><RefreshCw size={15} /> Refresh</button>
        </div>
      </div>

      <nav className="fx-tabs" aria-label="Platform sections">
        {user.is_superuser && (
          <button className={tab === 'overview' ? 'on' : ''} onClick={() => setTab('overview')}><Building2 size={15} /> Overview & Health</button>
        )}
        {user.is_superuser && (
          <button className={tab === 'subscriptions' ? 'on' : ''} onClick={() => setTab('subscriptions')}><ShieldCheck size={15} /> SaaS Subscriptions</button>
        )}
        <button className={tab === 'support_grants' ? 'on' : ''} onClick={() => setTab('support_grants')}><Key size={15} /> Support Grants</button>
        <button className={tab === 'invitations' ? 'on' : ''} onClick={() => setTab('invitations')}><Mail size={15} /> User Invitations</button>
      </nav>

      {error && <div className="error-bar"><AlertCircle size={17} /> {error}</div>}

      {/* OVERVIEW TAB */}
      {tab === 'overview' && data && user.is_superuser && (
        <div className="fx-body">
          <div className="fx-kpis" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
            <div className="fx-kpi"><span>Organisations</span><strong>{data.kpis.organisations_count}</strong></div>
            <div className="fx-kpi"><span>Campuses</span><strong>{data.kpis.schools_count}</strong></div>
            <div className="fx-kpi"><span>Students</span><strong style={{ color: '#2563eb' }}>{data.kpis.students_count.toLocaleString()}</strong></div>
            <div className="fx-kpi"><span>Active Staff</span><strong style={{ color: '#16a34a' }}>{data.kpis.active_staff_count.toLocaleString()}</strong></div>
          </div>

          <div className="fx-grid" style={{ marginTop: 20 }}>
            <section className="panel hr-panel fx-card">
              <div className="panel-head">
                <div><h3>Active Subscriptions</h3><p>Institutional contracts and seat counts</p></div>
              </div>
              <div className="table-scroll">
                <table className="data-table">
                  <thead><tr><th>ORGANISATION</th><th>PLAN</th><th>STUDENTS</th><th>MONTHLY</th><th>STATUS</th></tr></thead>
                  <tbody>
                    {data.subscriptions.map((s: R) => (
                      <tr key={s.id}>
                        <td><strong>{s.organisation_name}</strong></td>
                        <td>{s.plan_name}</td>
                        <td>{s.active_students_count} seats</td>
                        <td>${s.monthly_amount}</td>
                        <td><span className="pill green">{s.status}</span></td>
                      </tr>
                    ))}
                    {!data.subscriptions.length && (
                      <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24 }}>No institutional subscriptions active yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="panel hr-panel fx-card">
              <div className="panel-head">
                <div><h3>Recent Platform Audits</h3><p>Global security events across all tenants</p></div>
              </div>
              <div className="table-scroll" style={{ maxHeight: 260 }}>
                <table className="data-table">
                  <thead><tr><th>TIME</th><th>ACTOR</th><th>ACTION</th><th>TENANT</th></tr></thead>
                  <tbody>
                    {data.recent_audits.map((a: R) => (
                      <tr key={a.id}>
                        <td><small>{new Date(a.created_at).toLocaleTimeString()}</small></td>
                        <td><strong>{a.actor}</strong></td>
                        <td><span className="pill purple">{a.action}</span></td>
                        <td>{a.school_name}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </div>
      )}

      {/* SUBSCRIPTIONS TAB */}
      {tab === 'subscriptions' && data && user.is_superuser && (
        <section className="panel hr-panel">
          <div className="panel-head">
            <div><h3>Platform SaaS Tiers & Pricing</h3><p>Configure pricing plans for institutional tenants</p></div>
            <button className="primary-btn" onClick={() => setPlanModal(true)}><Plus size={15} /> Add Plan Tier</button>
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>PLAN NAME</th>
                  <th>BILLING BASIS</th>
                  <th>PRICE / UNIT</th>
                  <th>CURRENCY</th>
                  <th>SUBSCRIBERS</th>
                  <th>STATUS</th>
                </tr>
              </thead>
              <tbody>
                {data.plans.map((p: R) => (
                  <tr key={p.id}>
                    <td><strong>{p.name}</strong></td>
                    <td>{p.billing_basis}</td>
                    <td><strong>{p.price_per_unit}</strong></td>
                    <td>{p.currency}</td>
                    <td>{p.subscribers_count} orgs</td>
                    <td><span className="pill green">{p.active ? 'Active' : 'Inactive'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* SUPPORT GRANTS TAB */}
      {tab === 'support_grants' && (
        <section className="panel hr-panel">
          <div className="panel-head">
            <div>
              <h3>Audited Support-Access Grants</h3>
              <p>Time-limited access grants authorizing platform support into institution records</p>
            </div>
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>TENANT</th>
                  <th>CAMPUS</th>
                  <th>GRANTED BY</th>
                  <th>GRANTED TO (SUPPORT)</th>
                  <th>REASON</th>
                  <th>VALID UNTIL</th>
                  <th>STATUS</th>
                  <th>ACTION</th>
                </tr>
              </thead>
              <tbody>
                {grants.map(g => (
                  <tr key={g.id}>
                    <td><strong>{g.organisation_name}</strong></td>
                    <td>{g.school_name}</td>
                    <td>{g.granted_by}</td>
                    <td><strong>{g.granted_to}</strong></td>
                    <td>{g.reason}</td>
                    <td>{new Date(g.expires_at).toLocaleString()}</td>
                    <td>
                      <span className={`pill ${g.is_valid ? 'green' : 'red'}`}>
                        {g.is_valid ? 'Active' : g.revoked_at ? 'Revoked' : 'Expired'}
                      </span>
                    </td>
                    <td>
                      {g.is_valid && (
                        <button className="sm-btn" onClick={() => handleRevokeGrant(g.id)} style={{ color: '#dc2626' }}>
                          Revoke Access
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {!grants.length && (
                  <tr><td colSpan={8} style={{ textAlign: 'center', padding: 30 }}>No active support grants on record. Platform owner cannot access tenant data without a grant.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* INVITATIONS TAB */}
      {tab === 'invitations' && (
        <section className="panel hr-panel">
          <div className="panel-head">
            <div>
              <h3>Admin-Issued Invitations</h3>
              <p>Invitations replacing self-registration. New staff/students must be explicitly invited.</p>
            </div>
            <button className="primary-btn" onClick={() => { setNewInviteLink(''); setInviteModal(true); }}>
              <Plus size={15} /> Issue New Invitation
            </button>
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>EMAIL</th>
                  <th>ASSIGNED ROLE</th>
                  <th>CAMPUS</th>
                  <th>ISSUED BY</th>
                  <th>EXPIRES AT</th>
                  <th>STATUS</th>
                  <th>INVITE LINK</th>
                </tr>
              </thead>
              <tbody>
                {invites.map(inv => (
                  <tr key={inv.id}>
                    <td><strong>{inv.email}</strong></td>
                    <td><span className="pill purple">{inv.role}</span></td>
                    <td>{inv.school_name}</td>
                    <td>{inv.created_by}</td>
                    <td>{new Date(inv.expires_at).toLocaleDateString()}</td>
                    <td>
                      <span className={`pill ${inv.is_used ? 'green' : 'amber'}`}>
                        {inv.is_used ? 'Accepted' : 'Pending'}
                      </span>
                    </td>
                    <td>
                      {!inv.is_used && (
                        <button
                          className="sm-btn"
                          onClick={() => {
                            navigator.clipboard.writeText(`${window.location.origin}/accept-invite?token=${inv.token}`);
                            notify('Invitation link copied to clipboard!');
                          }}
                        >
                          <Copy size={13} /> Copy Link
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {!invites.length && (
                  <tr><td colSpan={7} style={{ textAlign: 'center', padding: 30 }}>No pending invitations. Click 'Issue New Invitation' to onboard staff or teachers.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* MODAL: Plan Tier */}
      {planModal && (
        <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setPlanModal(false); }}>
          <div className="modal-card">
            <div className="modal-head">
              <h3>Create SaaS Plan Tier</h3>
              <button onClick={() => setPlanModal(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleCreatePlan}>
              <div className="modal-fields">
                <label>Plan Name *
                  <input type="text" placeholder="e.g. Standard Campus, Enterprise Network" required value={planName} onChange={e => setPlanName(e.target.value)} />
                </label>
                <label>Billing Basis *
                  <select value={planBasis} onChange={e => setPlanBasis(e.target.value)}>
                    <option value="per_student">Per Student / Month</option>
                    <option value="per_campus">Per Campus / Month</option>
                    <option value="flat">Flat Subscription</option>
                  </select>
                </label>
                <label>Price per Unit *
                  <input type="number" step="0.01" min="0.01" required value={planPrice} onChange={e => setPlanPrice(e.target.value)} />
                </label>
                <label>Currency *
                  <select value={planCurrency} onChange={e => setPlanCurrency(e.target.value)}>
                    <option value="USD">USD ($)</option>
                    <option value="PKR">PKR (Rs)</option>
                    <option value="GBP">GBP (£)</option>
                    <option value="EUR">EUR (€)</option>
                    <option value="AED">AED (AED)</option>
                  </select>
                </label>
              </div>
              <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button type="button" className="outline-btn" onClick={() => setPlanModal(false)}>Cancel</button>
                <button type="submit" className="primary-btn">Save Plan</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Issue Invitation */}
      {inviteModal && (
        <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setInviteModal(false); }}>
          <div className="modal-card">
            <div className="modal-head">
              <h3>Issue User Invitation</h3>
              <button onClick={() => setInviteModal(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleIssueInvite}>
              <div className="modal-fields">
                <label>User Email Address *
                  <input type="email" placeholder="user@school.org" required value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} />
                </label>
                <label>System Role *
                  <select value={inviteRole} onChange={e => setInviteRole(e.target.value)}>
                    <option value="teacher">Teacher</option>
                    <option value="school_admin">School Admin</option>
                    <option value="principal">Principal</option>
                    <option value="organisation_admin">Organisation Admin</option>
                    <option value="student">Student</option>
                    <option value="parent">Parent</option>
                  </select>
                </label>
              </div>
              {newInviteLink && (
                <div style={{ margin: '14px 0', padding: 12, background: 'rgba(59, 130, 246, 0.08)', borderRadius: 6, border: '1px solid #93c5fd' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <small style={{ fontWeight: 600 }}>Share this onboarding link with the user:</small>
                    <button
                      type="button"
                      className="sm-btn"
                      onClick={() => {
                        navigator.clipboard.writeText(newInviteLink);
                        notify('Link copied!');
                      }}
                    >
                      <Copy size={13} /> Copy
                    </button>
                  </div>
                  <input type="text" readOnly value={newInviteLink} style={{ width: '100%', marginTop: 6, fontSize: 12 }} />
                </div>
              )}
              <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button type="button" className="outline-btn" onClick={() => setInviteModal(false)}>Close</button>
                <button type="submit" className="primary-btn">Generate Invitation</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
