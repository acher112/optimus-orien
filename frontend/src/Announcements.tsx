import { useState, useEffect } from 'react';
import {
  AlertCircle, Bell, Calendar, CheckCircle2, ChevronRight,
  Filter, Megaphone, Pencil, Pin, Plus, Search, ShieldAlert,
  Trash2, User, Users, X
} from 'lucide-react';
import { list, request, type User as AuthUser } from './api';
import './hr.css';

type R = Record<string, any>;

interface AnnouncementItem {
  id: number;
  school_id: number | null;
  school_name: string;
  title: string;
  content: string;
  target_role: string;
  priority: 'normal' | 'important' | 'urgent';
  pinned: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
  expires_at: string | null;
}

const AUDIENCE_TABS = [
  { key: '', label: 'All Announcements', icon: Megaphone },
  { key: 'students', label: 'Students', icon: Users },
  { key: 'staff', label: 'Staff', icon: Users },
  { key: 'teachers', label: 'Teachers', icon: Users },
  { key: 'principals', label: 'Principals', icon: Users },
  { key: 'parents', label: 'Parents', icon: Users },
];

export default function Announcements({ user, notify }: { user: AuthUser; notify: (m: string) => void }) {
  const isManager = ['organisation_admin', 'school_admin', 'principal'].includes(user.role);

  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('');
  const [search, setSearch] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [schools, setSchools] = useState<R[]>([]);
  const [selectedSchool, setSelectedSchool] = useState('');

  // Modals
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<AnnouncementItem | null>(null);
  const [busy, setBusy] = useState(false);

  // Form state
  const [form, setForm] = useState({
    title: '',
    content: '',
    target_role: 'all',
    priority: 'normal',
    pinned: false,
    school: '',
    expires_at: ''
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (activeTab) params.target = activeTab;
      if (priorityFilter) params.priority = priorityFilter;
      if (selectedSchool) params.school = selectedSchool;
      if (search.trim()) params.q = search.trim();

      const res = await request<any>('announcements/', {
        method: 'GET',
        headers: {}
      });
      setAnnouncements(res.results || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load announcements');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeTab, priorityFilter, selectedSchool]);

  useEffect(() => {
    list<R>('schools').then(setSchools).catch(() => {});
  }, []);

  const openCreateModal = () => {
    setEditingItem(null);
    setForm({
      title: '',
      content: '',
      target_role: activeTab || 'all',
      priority: 'normal',
      pinned: false,
      school: user.school ? String(user.school) : (schools[0]?.id ? String(schools[0].id) : ''),
      expires_at: ''
    });
    setShowModal(true);
  };

  const openEditModal = (item: AnnouncementItem) => {
    setEditingItem(item);
    setForm({
      title: item.title,
      content: item.content,
      target_role: item.target_role,
      priority: item.priority,
      pinned: item.pinned,
      school: item.school_id ? String(item.school_id) : '',
      expires_at: item.expires_at || ''
    });
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const payload: Record<string, any> = {
        title: form.title.trim(),
        content: form.content.trim(),
        target_role: form.target_role,
        priority: form.priority,
        pinned: form.pinned,
        school: form.school ? Number(form.school) : null,
        expires_at: form.expires_at || null
      };

      if (editingItem) {
        await request(`announcements/${editingItem.id}/`, {
          method: 'PATCH',
          body: JSON.stringify(payload)
        });
        notify('Announcement updated successfully');
      } else {
        await request('announcements/', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        notify('Announcement published successfully');
      }
      setShowModal(false);
      await loadData();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to save announcement');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (item: AnnouncementItem) => {
    if (!window.confirm(`Delete announcement "${item.title}"?`)) return;
    try {
      await request(`announcements/${item.id}/`, { method: 'DELETE' });
      notify('Announcement deleted');
      await loadData();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not delete announcement');
    }
  };

  const filtered = announcements.filter(a => {
    if (activeTab && a.target_role !== activeTab && a.target_role !== 'all') return false;
    if (priorityFilter && a.priority !== priorityFilter) return false;
    if (selectedSchool && a.school_id && String(a.school_id) !== selectedSchool) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return a.title.toLowerCase().includes(q) || a.content.toLowerCase().includes(q);
    }
    return true;
  });

  const pinnedItems = filtered.filter(a => a.pinned);
  const regularItems = filtered.filter(a => !a.pinned);

  return (
    <>
      <div className="page-header" style={{ marginBottom: 20 }}>
        <div>
          <div className="eyebrow"><Megaphone size={13} /> CAMPUS BROADCASTS</div>
          <h1>Announcements</h1>
          <p>Targeted notices and institutional updates for students, staff, teachers, leadership, and parents.</p>
        </div>
        {isManager && (
          <button className="primary-btn" onClick={openCreateModal}>
            <Plus size={16} /> New Announcement
          </button>
        )}
      </div>

      {/* AUDIENCE TABS */}
      <nav className="fx-tabs" aria-label="Audience filter" style={{ overflowX: 'auto', flexWrap: 'wrap' }}>
        {AUDIENCE_TABS.map(t => (
          <button
            key={t.key}
            className={activeTab === t.key ? 'on' : ''}
            onClick={() => setActiveTab(t.key)}
          >
            <t.icon size={15} /> {t.label}
          </button>
        ))}
      </nav>

      {/* TOOLBAR */}
      <div className="toolbar" style={{ background: '#fff', borderRadius: 14, marginBottom: 20, padding: '14px 18px', border: '1px solid #eff0f6' }}>
        <div className="searchbox" style={{ maxWidth: 320 }}>
          <Search size={15} />
          <input
            type="text"
            placeholder="Search announcements…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && <button onClick={() => setSearch('')}><X size={13} /></button>}
        </div>

        <div className="toolbar-right" style={{ flexWrap: 'wrap', gap: 10 }}>
          <select
            className="fx-select"
            value={priorityFilter}
            onChange={e => setPriorityFilter(e.target.value)}
          >
            <option value="">All Priorities</option>
            <option value="urgent">Urgent Only</option>
            <option value="important">Important</option>
            <option value="normal">Normal</option>
          </select>

          {schools.length > 1 && (
            <select
              className="fx-select"
              value={selectedSchool}
              onChange={e => setSelectedSchool(e.target.value)}
            >
              <option value="">All Campuses</option>
              {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}

          <button className="outline-btn" onClick={loadData}>
            <Filter size={14} /> Refresh
          </button>
        </div>
      </div>

      {error && <div className="error-bar"><AlertCircle size={16} /> {error}</div>}

      {/* ANNOUNCEMENT CARDS */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* PINNED SECTION */}
        {pinnedItems.length > 0 && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 800, color: '#7c3aed', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 10 }}>
              <Pin size={14} /> Pinned Notices
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {pinnedItems.map(item => (
                <AnnouncementCard
                  key={item.id}
                  item={item}
                  isManager={isManager}
                  onEdit={() => openEditModal(item)}
                  onDelete={() => handleDelete(item)}
                />
              ))}
            </div>
          </div>
        )}

        {/* REGULAR SECTION */}
        {regularItems.length > 0 && (
          <div>
            {pinnedItems.length > 0 && (
              <div style={{ fontSize: 12, fontWeight: 800, color: '#64748b', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 10, marginTop: 10 }}>
                Recent Announcements
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {regularItems.map(item => (
                <AnnouncementCard
                  key={item.id}
                  item={item}
                  isManager={isManager}
                  onEdit={() => openEditModal(item)}
                  onDelete={() => handleDelete(item)}
                />
              ))}
            </div>
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="panel hr-panel" style={{ textAlign: 'center', padding: '60px 20px' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#f5f3ff', color: '#7c3aed', display: 'grid', placeItems: 'center', margin: '0 auto 16px' }}>
              <Megaphone size={26} />
            </div>
            <h3 style={{ fontSize: 16, margin: '0 0 6px' }}>No announcements found</h3>
            <p style={{ color: '#94a3b8', fontSize: 13, maxWidth: 360, margin: '0 auto' }}>
              {search || activeTab || priorityFilter ? 'Try clearing your filters or search terms.' : 'No announcements have been published yet.'}
            </p>
            {isManager && (
              <button className="primary-btn" style={{ marginTop: 18 }} onClick={openCreateModal}>
                <Plus size={15} /> Create First Announcement
              </button>
            )}
          </div>
        )}
      </div>

      {/* CREATE / EDIT MODAL */}
      {showModal && (
        <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setShowModal(false); }}>
          <div className="modal-card" style={{ maxWidth: 560 }}>
            <div className="modal-head">
              <div className="modal-icon"><Megaphone size={20} /></div>
              <div>
                <h3>{editingItem ? 'Edit Announcement' : 'Publish Announcement'}</h3>
                <p>Broadcast messaging to specific educational roles or campus-wide</p>
              </div>
              <button onClick={() => setShowModal(false)}><X size={20} /></button>
            </div>

            <form onSubmit={handleSave}>
              <div className="modal-fields hr-fields" style={{ padding: '20px 24px' }}>
                <label className="wide">
                  Title *
                  <input
                    required
                    placeholder="e.g. Mid-term Exam Schedule & Revision Guidelines"
                    value={form.title}
                    onChange={e => setForm(s => ({ ...s, title: e.target.value }))}
                  />
                </label>

                <label>
                  Target Audience *
                  <select
                    value={form.target_role}
                    onChange={e => setForm(s => ({ ...s, target_role: e.target.value }))}
                  >
                    <option value="all">Everyone (All Roles)</option>
                    <option value="students">Students Only</option>
                    <option value="staff">Staff Only</option>
                    <option value="teachers">Teachers Only</option>
                    <option value="principals">Principals Only</option>
                    <option value="parents">Parents Only</option>
                  </select>
                </label>

                <label>
                  Priority *
                  <select
                    value={form.priority}
                    onChange={e => setForm(s => ({ ...s, priority: e.target.value }))}
                  >
                    <option value="normal">Normal</option>
                    <option value="important">Important (Sends Notifications)</option>
                    <option value="urgent">Urgent (High Priority Alert)</option>
                  </select>
                </label>

                <label>
                  Campus Scope
                  <select
                    value={form.school}
                    onChange={e => setForm(s => ({ ...s, school: e.target.value }))}
                  >
                    <option value="">All Campuses (Organisation-wide)</option>
                    {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </label>

                <label>
                  Expiry Date (Optional)
                  <input
                    type="date"
                    value={form.expires_at}
                    onChange={e => setForm(s => ({ ...s, expires_at: e.target.value }))}
                  />
                </label>

                <label className="wide">
                  Content & Message *
                  <textarea
                    required
                    rows={6}
                    placeholder="Write your announcement message here…"
                    style={{
                      width: '100%',
                      marginTop: 8,
                      border: '1px solid #e2e8f0',
                      borderRadius: 10,
                      padding: 12,
                      fontSize: 13,
                      fontFamily: 'inherit',
                      boxSizing: 'border-box',
                      resize: 'vertical'
                    }}
                    value={form.content}
                    onChange={e => setForm(s => ({ ...s, content: e.target.value }))}
                  />
                </label>

                <label className="wide" style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer', fontSize: 13, fontWeight: 700, color: '#475569', marginTop: 4 }}>
                  <input
                    type="checkbox"
                    checked={form.pinned}
                    onChange={e => setForm(s => ({ ...s, pinned: e.target.checked }))}
                    style={{ width: 'auto', margin: 0 }}
                  />
                  <span>Pin this announcement to top of feed</span>
                </label>
              </div>

              <div className="modal-footer">
                <button type="button" className="outline-btn" onClick={() => setShowModal(false)}>Cancel</button>
                <button className="primary-btn" disabled={busy}>
                  {busy ? 'Saving…' : (editingItem ? 'Save Changes' : 'Publish Announcement')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

function AnnouncementCard({
  item,
  isManager,
  onEdit,
  onDelete
}: {
  item: AnnouncementItem;
  isManager: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const priorityColor = item.priority === 'urgent'
    ? { bg: '#fef2f2', border: '#fecaca', text: '#dc2626' }
    : item.priority === 'important'
    ? { bg: '#fffbeb', border: '#fde68a', text: '#d97706' }
    : { bg: '#f5f3ff', border: '#ddd6fe', text: '#7c3aed' };

  return (
    <div
      className="panel"
      style={{
        padding: '20px 24px',
        borderLeft: `4px solid ${priorityColor.text}`,
        position: 'relative',
        transition: 'all 0.15s ease'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            {item.pinned && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#ede9fe', color: '#6d28d9', fontSize: 11, fontWeight: 800, padding: '3px 8px', borderRadius: 6 }}>
                <Pin size={11} /> Pinned
              </span>
            )}
            <span style={{ background: priorityColor.bg, color: priorityColor.text, border: `1px solid ${priorityColor.border}`, fontSize: 11, fontWeight: 800, padding: '3px 8px', borderRadius: 6, textTransform: 'uppercase' }}>
              {item.priority}
            </span>
            <span style={{ background: '#f1f5f9', color: '#475569', fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6 }}>
              Target: {item.target_role === 'all' ? 'Everyone' : item.target_role.charAt(0).toUpperCase() + item.target_role.slice(1)}
            </span>
            <span style={{ fontSize: 11, color: '#94a3b8' }}>
              Campus: <b>{item.school_name}</b>
            </span>
          </div>

          <h3 style={{ fontSize: 17, fontWeight: 800, margin: '0 0 10px', color: '#1e293b' }}>
            {item.title}
          </h3>

          <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.6, whiteSpace: 'pre-wrap', marginBottom: 14 }}>
            {item.content}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 11, color: '#94a3b8', flexWrap: 'wrap' }}>
            <span>Posted by <b>{item.created_by}</b></span>
            <span>·</span>
            <span>{new Date(item.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
            {item.expires_at && (
              <>
                <span>·</span>
                <span style={{ color: '#ea580c' }}>Expires on {item.expires_at}</span>
              </>
            )}
          </div>
        </div>

        {isManager && (
          <div style={{ display: 'flex', gap: 6, alignSelf: 'flex-start' }}>
            <button className="hr-mini" title="Edit announcement" onClick={onEdit}>
              <Pencil size={12} /> Edit
            </button>
            <button className="hr-mini danger" title="Delete announcement" onClick={onDelete}>
              <Trash2 size={12} /> Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
