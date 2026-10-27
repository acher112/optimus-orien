import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  BookOpen, Upload, Download, FileText, FileSpreadsheet, FileVideo,
  FileImage, FileArchive, Search, Plus, RefreshCw, AlertCircle,
  CheckCircle2, Clock, Trash2, Edit3, Archive, Eye, Users, Layers,
  ChevronDown, X, Sparkles, Filter, ShieldCheck, ArrowRight
} from 'lucide-react';
import { list, request, type User } from './api';
import ExportMenu, { type ExportColumn } from './ExportMenu';
import { FilterBar } from './FilterBar';

interface StudyMaterialItem {
  id: number;
  school_id: number;
  school_name: string;
  school_class_id: number;
  school_class_name: string;
  subject_id: number | null;
  subject_name: string | null;
  subject_code: string | null;
  title: string;
  description: string;
  original_filename: string;
  content_type: string;
  size_bytes: number;
  size_formatted: string;
  uploaded_by_id: number | null;
  uploaded_by_name: string | null;
  visible_from: string | null;
  status: 'draft' | 'published' | 'archived';
  download_count: number;
  version: number;
  created_at: string;
  updated_at: string;
}

export default function StudyMaterials({ user, notify }: { user: User; notify: (msg: string) => void }) {
  const [materials, setMaterials] = useState<StudyMaterialItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filterValues, setFilterValues] = useState<Record<string, any>>({});
  const [school, setSchool] = useState<string>('');

  // Dropdown reference data
  const [classes, setClasses] = useState<Array<{ id: number; name: string; school?: number }>>([]);
  const [subjects, setSubjects] = useState<Array<{ id: number; name: string; code?: string; school?: number }>>([]);
  const [schools, setSchools] = useState<Array<{ id: number; name: string }>>([]);

  // Upload modal state
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadDesc, setUploadDesc] = useState('');
  const [uploadClass, setUploadClass] = useState('');
  const [uploadSubject, setUploadSubject] = useState('');
  const [uploadStatus, setUploadStatus] = useState<'published' | 'draft'>('published');
  const [uploadVisibleFrom, setUploadVisibleFrom] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Replace file modal state
  const [replaceModalOpen, setReplaceModalOpen] = useState(false);
  const [replacingMaterial, setReplacingMaterial] = useState<StudyMaterialItem | null>(null);
  const [replaceFile, setReplaceFile] = useState<File | null>(null);

  // Edit details modal state
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<StudyMaterialItem | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editStatus, setEditStatus] = useState<'published' | 'draft' | 'archived'>('published');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceFileInputRef = useRef<HTMLInputElement>(null);

  const isStaffOrAdmin = ['organisation_admin', 'school_admin', 'principal', 'teacher'].includes(user.role);

  // Load reference data
  useEffect(() => {
    list<{ id: number; name: string }>('schools').then(setSchools).catch(() => {});
    list<{ id: number; name: string; school?: number }>('classes').then(setClasses).catch(() => {});
    list<{ id: number; name: string; code?: string; school?: number }>('subjects').then(setSubjects).catch(() => {});
  }, []);

  const loadMaterials = useCallback(async () => {
    setLoading(true);
    setError('');
    const params = new URLSearchParams();
    if (school) params.append('school', school);
    if (filterValues.class && filterValues.class !== 'all') params.append('class', filterValues.class);
    if (filterValues.subject && filterValues.subject !== 'all') params.append('subject', filterValues.subject);
    if (filterValues.status && filterValues.status !== 'all') params.append('status', filterValues.status);
    if (filterValues.q?.trim()) params.append('q', filterValues.q.trim());

    try {
      const res = await request<{ results: StudyMaterialItem[] }>(`materials/?${params.toString()}`);
      setMaterials(res.results || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load study materials');
    } finally {
      setLoading(false);
    }
  }, [school, filterValues]);

  useEffect(() => {
    loadMaterials();
  }, [loadMaterials]);

  // Handle direct file download
  const handleDownload = async (item: StudyMaterialItem) => {
    try {
      const res = await fetch(`/api/v1/materials/${item.id}/download/`, {
        credentials: 'include'
      });
      if (!res.ok) {
        throw new Error(`Download failed (${res.status})`);
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = item.original_filename || `${item.title}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => window.URL.revokeObjectURL(url), 10000);

      // Increment local download count
      setMaterials(prev => prev.map(m => m.id === item.id ? { ...m, download_count: m.download_count + 1 } : m));
      notify(`Downloading ${item.title}`);
    } catch (err: any) {
      notify(err.message || 'Failed to download file');
    }
  };

  // Handle upload submit
  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) {
      notify('Please select a file to upload');
      return;
    }
    if (!uploadTitle.trim()) {
      notify('Please provide a title');
      return;
    }
    if (!uploadClass) {
      notify('Please select a target class');
      return;
    }

    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('file', uploadFile);
      formData.append('title', uploadTitle.trim());
      formData.append('description', uploadDesc.trim());
      formData.append('school_class', uploadClass);
      if (uploadSubject) formData.append('subject', uploadSubject);
      formData.append('status', uploadStatus);
      if (uploadVisibleFrom) formData.append('visible_from', uploadVisibleFrom);

      const csrf = document.cookie.match(/(^|;)\s*csrftoken=([^;]+)/)?.[2] || '';
      const res = await fetch('/api/v1/materials/', {
        method: 'POST',
        credentials: 'include',
        headers: {
          ...(csrf ? { 'X-CSRFToken': decodeURIComponent(csrf) } : {})
        },
        body: formData
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        const msg = errJson.detail || (errJson.file ? errJson.file[0] : 'Upload failed');
        throw new Error(msg);
      }

      notify('Study material uploaded successfully');
      setUploadModalOpen(false);
      setUploadFile(null);
      setUploadTitle('');
      setUploadDesc('');
      setUploadClass('');
      setUploadSubject('');
      setUploadStatus('published');
      setUploadVisibleFrom('');
      loadMaterials();
    } catch (err: any) {
      notify(err.message || 'Upload failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle replace submit
  const handleReplaceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replacingMaterial || !replaceFile) {
      notify('Please select a new file version');
      return;
    }

    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('file', replaceFile);

      const csrf = document.cookie.match(/(^|;)\s*csrftoken=([^;]+)/)?.[2] || '';
      const res = await fetch(`/api/v1/materials/${replacingMaterial.id}/replace/`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          ...(csrf ? { 'X-CSRFToken': decodeURIComponent(csrf) } : {})
        },
        body: formData
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.detail || 'File replacement failed');
      }

      notify(`File replaced (Updated to v${replacingMaterial.version + 1})`);
      setReplaceModalOpen(false);
      setReplacingMaterial(null);
      setReplaceFile(null);
      loadMaterials();
    } catch (err: any) {
      notify(err.message || 'File replacement failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle edit details submit
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMaterial) return;

    setIsSubmitting(true);
    try {
      await request(`materials/${editingMaterial.id}/`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: editTitle.trim(),
          description: editDesc.trim(),
          status: editStatus
        })
      });

      notify('Material details updated');
      setEditModalOpen(false);
      setEditingMaterial(null);
      loadMaterials();
    } catch (err: any) {
      notify(err.message || 'Update failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle archive toggle
  const handleArchiveToggle = async (item: StudyMaterialItem) => {
    const action = item.status === 'archived' ? 'restore' : 'archive';
    if (!window.confirm(`Are you sure you want to ${action} '${item.title}'?`)) return;

    try {
      if (item.status === 'archived') {
        await request(`materials/${item.id}/`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'published' })
        });
        notify(`Restored '${item.title}'`);
      } else {
        await request(`materials/${item.id}/archive/`, { method: 'POST' });
        notify(`Archived '${item.title}'`);
      }
      loadMaterials();
    } catch (err: any) {
      notify(err.message || 'Action failed');
    }
  };

  // File icon helper
  const getFileIcon = (filename: string, contentType: string) => {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    if (ext === 'pdf' || contentType.includes('pdf')) return <FileText size={20} color="#e11d48" />;
    if (['doc', 'docx'].includes(ext) || contentType.includes('word')) return <FileText size={20} color="#2563eb" />;
    if (['xls', 'xlsx', 'csv'].includes(ext) || contentType.includes('spreadsheet') || contentType.includes('excel')) return <FileSpreadsheet size={20} color="#059669" />;
    if (['mp4', 'mov', 'avi'].includes(ext) || contentType.includes('video')) return <FileVideo size={20} color="#7c3aed" />;
    if (['png', 'jpg', 'jpeg'].includes(ext) || contentType.includes('image')) return <FileImage size={20} color="#d97706" />;
    if (['zip', 'rar'].includes(ext)) return <FileArchive size={20} color="#475569" />;
    return <BookOpen size={20} color="#64748b" />;
  };

  const exportColumns: ExportColumn[] = [
    { key: 'title', label: 'Material Title' },
    { key: 'school_class_name', label: 'Class' },
    { key: 'subject_name', label: 'Subject' },
    { key: 'original_filename', label: 'File Name' },
    { key: 'size_formatted', label: 'File Size' },
    { key: 'version', label: 'Version' },
    { key: 'status', label: 'Status' },
    { key: 'download_count', label: 'Total Downloads' },
    { key: 'uploaded_by_name', label: 'Uploaded By' },
    { key: 'created_at', label: 'Upload Date' },
  ];

  // Group materials by subject for student view
  const groupedBySubject = useMemo(() => {
    const groups: Record<string, StudyMaterialItem[]> = {};
    for (const m of materials) {
      const groupName = m.subject_name || 'General Resources';
      if (!groups[groupName]) groups[groupName] = [];
      groups[groupName].push(m);
    }
    return groups;
  }, [materials]);

  // Summary KPIs
  const stats = useMemo(() => {
    const total = materials.length;
    const published = materials.filter(m => m.status === 'published').length;
    const downloads = materials.reduce((acc, m) => acc + (m.download_count || 0), 0);
    const classesCount = new Set(materials.map(m => m.school_class_id)).size;
    return { total, published, downloads, classesCount };
  }, [materials]);

  return (
    <div className="study-materials-view">
      {/* Page Header */}
      <div className="page-header">
        <div>
          <div className="eyebrow">STUDENTS & LEARNING / STUDY MATERIALS</div>
          <h1>Study Materials</h1>
          <p>Institutional learning repository, class syllabus assets, notes, and versioned study documents.</p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <ExportMenu
            title="Study Materials Directory"
            filename="study-materials"
            endpoint={`materials/?${new URLSearchParams({
              ...(school ? { school } : {}),
              ...(filterValues.class && filterValues.class !== 'all' ? { class: filterValues.class } : {}),
              ...(filterValues.subject && filterValues.subject !== 'all' ? { subject: filterValues.subject } : {}),
              ...(filterValues.status && filterValues.status !== 'all' ? { status: filterValues.status } : {}),
              ...(filterValues.q ? { q: filterValues.q } : {})
            }).toString()}`}
            notify={notify}
          />

          {isStaffOrAdmin && (
            <button className="primary-btn" onClick={() => setUploadModalOpen(true)}>
              <Upload size={16} /> <span>Upload Material</span>
            </button>
          )}
        </div>
      </div>

      {/* KPI Cards for Teachers / Admins */}
      {isStaffOrAdmin && (
        <div className="stats-grid" style={{ marginBottom: '22px' }}>
          <div className="stat-card" style={{ padding: '16px 20px', background: 'var(--panel-bg, #fff)' }}>
            <div className="stat-label" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <BookOpen size={16} color="#6366f1" /> Total Materials
            </div>
            <div className="stat-value" style={{ fontSize: '24px', margin: '8px 0' }}>{stats.total}</div>
            <div className="stat-foot" style={{ fontSize: '12px', color: '#64748b' }}>Across all subjects</div>
          </div>
          <div className="stat-card" style={{ padding: '16px 20px', background: 'var(--panel-bg, #fff)' }}>
            <div className="stat-label" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CheckCircle2 size={16} color="#10b981" /> Published & Live
            </div>
            <div className="stat-value" style={{ fontSize: '24px', margin: '8px 0' }}>{stats.published}</div>
            <div className="stat-foot" style={{ fontSize: '12px', color: '#64748b' }}>Available to learners</div>
          </div>
          <div className="stat-card" style={{ padding: '16px 20px', background: 'var(--panel-bg, #fff)' }}>
            <div className="stat-label" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Download size={16} color="#0ea5e9" /> Total Downloads
            </div>
            <div className="stat-value" style={{ fontSize: '24px', margin: '8px 0' }}>{stats.downloads}</div>
            <div className="stat-foot" style={{ fontSize: '12px', color: '#64748b' }}>Learner engagement</div>
          </div>
          <div className="stat-card" style={{ padding: '16px 20px', background: 'var(--panel-bg, #fff)' }}>
            <div className="stat-label" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Users size={16} color="#f59e0b" /> Classes Covered
            </div>
            <div className="stat-value" style={{ fontSize: '24px', margin: '8px 0' }}>{stats.classesCount}</div>
            <div className="stat-foot" style={{ fontSize: '12px', color: '#64748b' }}>Cohorts with materials</div>
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div style={{ marginBottom: 16 }}>
        <FilterBar
          searchPlaceholder="Search materials by title, description, or file name..."
          filters={[
            ...(schools.length > 1 ? [{
              key: 'school',
              label: 'Campus',
              options: schools.map(s => ({ label: s.name, value: s.id }))
            }] : []),
            {
              key: 'class',
              label: 'Class',
              options: classes.map(c => ({
                label: (c as any).display_name || ((c as any).section ? `${c.name} – ${(c as any).section}` : c.name),
                value: c.id
              }))
            },
            {
              key: 'subject',
              label: 'Subject',
              options: subjects.map(s => ({
                label: `${s.name}${s.code ? ` (${s.code})` : ''}`,
                value: s.id
              }))
            },
            ...(isStaffOrAdmin ? [{
              key: 'status',
              label: 'Status',
              options: [
                { label: 'Published', value: 'published' },
                { label: 'Drafts', value: 'draft' },
                { label: 'Archived', value: 'archived' }
              ]
            }] : [])
          ]}
          values={filterValues}
          onChange={setFilterValues}
          onClear={() => setFilterValues({})}
          rightActions={
            <>
              <span className="result-count">{materials.length} learning resources</span>
              <button className="outline-btn" onClick={loadMaterials} title="Refresh list">
                <RefreshCw size={15} /> Refresh
              </button>
            </>
          }
        />
      </div>

      {error && <div className="error-bar"><AlertCircle size={17} /> {error}</div>}

      {/* Main Content Area */}
      {isStaffOrAdmin ? (
        /* Teacher / Admin Table View */
        <section className="panel resource-panel" style={{ padding: '0', overflow: 'hidden' }}>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: '40px' }}></th>
                  <th>Title & Description</th>
                  <th>Class & Subject</th>
                  <th>File Details</th>
                  <th>Version</th>
                  <th>Status</th>
                  <th>Downloads</th>
                  <th>Uploaded By</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {materials.map(m => (
                  <tr key={m.id}>
                    <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                      {getFileIcon(m.original_filename, m.content_type)}
                    </td>
                    <td>
                      <div>
                        <strong style={{ fontSize: '14px', color: 'var(--text-color, #1e293b)' }}>{m.title}</strong>
                        {m.description && (
                          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px', maxWidth: '300px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {m.description}
                          </div>
                        )}
                      </div>
                    </td>
                    <td>
                      <div>
                        <span className="pill" style={{ background: '#e0e7ff', color: '#3730a3', fontSize: '11px', fontWeight: 600 }}>
                          {m.school_class_name}
                        </span>
                        <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                          {m.subject_name || 'General'}
                        </div>
                      </div>
                    </td>
                    <td>
                      <div style={{ fontSize: '12px' }}>
                        <span style={{ fontWeight: 500 }}>{m.original_filename}</span>
                        <div style={{ color: '#64748b' }}>{m.size_formatted}</div>
                      </div>
                    </td>
                    <td>
                      <span className="pill" style={{ background: '#f1f5f9', color: '#475569', fontSize: '11px', fontWeight: 600 }}>
                        v{m.version}
                      </span>
                    </td>
                    <td>
                      <span className={`pill ${m.status === 'published' ? 'pill-success' : m.status === 'draft' ? 'pill-warning' : 'pill-muted'}`} style={{
                        fontSize: '11px',
                        textTransform: 'capitalize',
                        background: m.status === 'published' ? '#dcfce7' : m.status === 'draft' ? '#fef9c3' : '#f1f5f9',
                        color: m.status === 'published' ? '#15803d' : m.status === 'draft' ? '#a16207' : '#64748b'
                      }}>
                        {m.status}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: '#3b82f6' }}>
                        {m.download_count}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontSize: '12px' }}>
                        <div>{m.uploaded_by_name || 'System'}</div>
                        <small style={{ color: '#94a3b8' }}>{m.created_at.slice(0, 10)}</small>
                      </div>
                    </td>
                    <td>
                      <div className="table-actions" style={{ justifyContent: 'flex-end', gap: '6px' }}>
                        <button
                          className="action-btn-sm"
                          title="Download file"
                          onClick={() => handleDownload(m)}
                          style={{ padding: '6px 8px' }}
                        >
                          <Download size={14} />
                        </button>

                        <button
                          className="action-btn-sm"
                          title="Replace with newer version"
                          onClick={() => {
                            setReplacingMaterial(m);
                            setReplaceModalOpen(true);
                          }}
                          style={{ padding: '6px 8px' }}
                        >
                          <Upload size={14} />
                        </button>

                        <button
                          className="action-btn-sm"
                          title="Edit title & status"
                          onClick={() => {
                            setEditingMaterial(m);
                            setEditTitle(m.title);
                            setEditDesc(m.description || '');
                            setEditStatus(m.status);
                            setEditModalOpen(true);
                          }}
                          style={{ padding: '6px 8px' }}
                        >
                          <Edit3 size={14} />
                        </button>

                        <button
                          className="action-btn-sm"
                          title={m.status === 'archived' ? 'Restore material' : 'Archive material'}
                          onClick={() => handleArchiveToggle(m)}
                          style={{ padding: '6px 8px', color: m.status === 'archived' ? '#059669' : '#dc2626' }}
                        >
                          <Archive size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {!materials.length && !loading && (
              <div style={{ padding: '45px 20px', textAlign: 'center', color: '#64748b' }}>
                <BookOpen size={36} strokeWidth={1.5} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
                <h3 style={{ margin: '0 0 6px', fontSize: '16px' }}>No study materials found</h3>
                <p style={{ margin: 0, fontSize: '13px' }}>
                  {filterValues.q ? 'Try adjusting your filters or search keyword.' : 'Upload study notes, slides, or reading lists for your classes.'}
                </p>
              </div>
            )}
          </div>
          <div className="table-footer" style={{ padding: '12px 18px', display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border-color, #e2e8f0)', fontSize: '12px', color: '#64748b' }}>
            <span>Showing {materials.length} material records</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <ShieldCheck size={14} color="#10b981" /> Private & Scoped Repository
            </span>
          </div>
        </section>
      ) : (
        /* Student & Parent Grouped Card View */
        <div className="student-materials-view">
          {Object.keys(groupedBySubject).length === 0 && !loading && (
            <div className="panel" style={{ padding: '50px 20px', textAlign: 'center', color: '#64748b' }}>
              <BookOpen size={42} strokeWidth={1.5} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
              <h3 style={{ margin: '0 0 6px', fontSize: '17px' }}>No published materials available</h3>
              <p style={{ margin: 0, fontSize: '14px' }}>Materials assigned by your teachers will appear here automatically.</p>
            </div>
          )}

          {Object.entries(groupedBySubject).map(([subjectName, items]) => (
            <div key={subjectName} style={{ marginBottom: '28px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#6366f1' }} />
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>{subjectName}</h3>
                <span className="pill" style={{ background: '#f1f5f9', color: '#475569', fontSize: '11px', fontWeight: 600 }}>
                  {items.length} {items.length === 1 ? 'document' : 'documents'}
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
                {items.map(m => (
                  <div
                    key={m.id}
                    className="panel"
                    style={{
                      padding: '18px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      borderRadius: '12px',
                      transition: 'transform 0.15s, box-shadow 0.15s'
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px', marginBottom: '10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{ padding: '8px', background: '#f8fafc', borderRadius: '8px' }}>
                            {getFileIcon(m.original_filename, m.content_type)}
                          </div>
                          <div>
                            <span className="pill" style={{ background: '#e0e7ff', color: '#3730a3', fontSize: '11px', fontWeight: 600 }}>
                              {m.school_class_name}
                            </span>
                          </div>
                        </div>
                        <span className="pill" style={{ background: '#f1f5f9', color: '#475569', fontSize: '10px', fontWeight: 600 }}>
                          v{m.version}
                        </span>
                      </div>

                      <h4 style={{ margin: '0 0 6px', fontSize: '15px', fontWeight: 700, color: 'var(--text-color, #1e293b)' }}>
                        {m.title}
                      </h4>

                      {m.description && (
                        <p style={{ margin: '0 0 12px', fontSize: '12px', color: '#64748b', lineHeight: 1.5 }}>
                          {m.description}
                        </p>
                      )}
                    </div>

                    <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid var(--border-color, #e2e8f0)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#94a3b8', marginBottom: '12px' }}>
                        <span>{m.size_formatted} • {m.original_filename.split('.').pop()?.toUpperCase()}</span>
                        <span>By {m.uploaded_by_name || 'Teacher'}</span>
                      </div>

                      <button
                        className="primary-btn"
                        onClick={() => handleDownload(m)}
                        style={{ width: '100%', justifyContent: 'center', fontSize: '13px', padding: '9px 12px' }}
                      >
                        <Download size={15} /> <span>Download Resource</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload Material Modal */}
      {uploadModalOpen && (
        <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setUploadModalOpen(false); }}>
          <div className="modal-card" style={{ maxWidth: '540px' }}>
            <div className="modal-head">
              <div className="modal-icon"><Upload size={20} /></div>
              <div>
                <h3>Upload Study Material</h3>
                <p>Add reference notes, homework sheets, or slides for your students.</p>
              </div>
              <button onClick={() => setUploadModalOpen(false)}><X size={20} /></button>
            </div>

            <form onSubmit={handleUploadSubmit}>
              <div className="modal-fields" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {/* File Dropzone */}
                <div
                  style={{
                    border: '2px dashed var(--border-color, #cbd5e1)',
                    borderRadius: '10px',
                    padding: '24px',
                    textAlign: 'center',
                    cursor: 'pointer',
                    background: uploadFile ? '#f0fdf4' : 'var(--bg-subtle, #f8fafc)',
                    transition: 'border 0.2s'
                  }}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    style={{ display: 'none' }}
                    onChange={e => {
                      if (e.target.files && e.target.files[0]) {
                        setUploadFile(e.target.files[0]);
                        if (!uploadTitle) {
                          const baseName = e.target.files[0].name.replace(/\.[^/.]+$/, '');
                          setUploadTitle(baseName.replace(/[_-]/g, ' '));
                        }
                      }
                    }}
                  />
                  {uploadFile ? (
                    <div>
                      <CheckCircle2 size={32} color="#16a34a" style={{ margin: '0 auto 8px' }} />
                      <div style={{ fontWeight: 600, fontSize: '14px' }}>{uploadFile.name}</div>
                      <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                        {(uploadFile.size / (1024 * 1024)).toFixed(2)} MB • Click to replace
                      </div>
                    </div>
                  ) : (
                    <div>
                      <Upload size={32} color="#6366f1" style={{ margin: '0 auto 8px' }} />
                      <div style={{ fontWeight: 600, fontSize: '14px' }}>Click to browse or drag file here</div>
                      <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                        PDF, DOCX, XLSX, PPTX, MP4, PNG, JPG (Max 20 MB)
                      </div>
                    </div>
                  )}
                </div>

                <label>
                  Title <span className="required">*</span>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Chapter 4 Chemistry Revision Notes"
                    value={uploadTitle}
                    onChange={e => setUploadTitle(e.target.value)}
                  />
                </label>

                <label>
                  Description (Optional)
                  <textarea
                    rows={2}
                    placeholder="Key concepts, preparation guide, or instructions..."
                    value={uploadDesc}
                    onChange={e => setUploadDesc(e.target.value)}
                  />
                </label>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <label>
                    Target Class <span className="required">*</span>
                    <select
                      required
                      value={uploadClass}
                      onChange={e => setUploadClass(e.target.value)}
                    >
                      <option value="">Select class...</option>
                      {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </label>

                  <label>
                    Subject (Optional)
                    <select
                      value={uploadSubject}
                      onChange={e => setUploadSubject(e.target.value)}
                    >
                      <option value="">General / All Subjects</option>
                      {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </label>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <label>
                    Status
                    <select
                      value={uploadStatus}
                      onChange={e => setUploadStatus(e.target.value as any)}
                    >
                      <option value="published">Publish immediately</option>
                      <option value="draft">Save as Draft</option>
                    </select>
                  </label>

                  <label>
                    Release Date & Time (Optional)
                    <input
                      type="datetime-local"
                      value={uploadVisibleFrom}
                      onChange={e => setUploadVisibleFrom(e.target.value)}
                    />
                  </label>
                </div>
              </div>

              <div className="modal-actions" style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button type="button" className="outline-btn" onClick={() => setUploadModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="primary-btn" disabled={isSubmitting}>
                  {isSubmitting ? 'Uploading...' : 'Confirm & Upload'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Replace File Modal */}
      {replaceModalOpen && replacingMaterial && (
        <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setReplaceModalOpen(false); }}>
          <div className="modal-card" style={{ maxWidth: '480px' }}>
            <div className="modal-head">
              <div className="modal-icon"><Upload size={20} /></div>
              <div>
                <h3>Replace File Version</h3>
                <p>Upgrades '{replacingMaterial.title}' from v{replacingMaterial.version} to v{replacingMaterial.version + 1}.</p>
              </div>
              <button onClick={() => setReplaceModalOpen(false)}><X size={20} /></button>
            </div>

            <form onSubmit={handleReplaceSubmit}>
              <div style={{ padding: '16px 0' }}>
                <div
                  style={{
                    border: '2px dashed var(--border-color, #cbd5e1)',
                    borderRadius: '10px',
                    padding: '24px',
                    textAlign: 'center',
                    cursor: 'pointer',
                    background: replaceFile ? '#f0fdf4' : 'var(--bg-subtle, #f8fafc)'
                  }}
                  onClick={() => replaceFileInputRef.current?.click()}
                >
                  <input
                    type="file"
                    ref={replaceFileInputRef}
                    style={{ display: 'none' }}
                    onChange={e => {
                      if (e.target.files && e.target.files[0]) {
                        setReplaceFile(e.target.files[0]);
                      }
                    }}
                  />
                  {replaceFile ? (
                    <div>
                      <CheckCircle2 size={32} color="#16a34a" style={{ margin: '0 auto 8px' }} />
                      <div style={{ fontWeight: 600, fontSize: '14px' }}>{replaceFile.name}</div>
                      <div style={{ fontSize: '12px', color: '#64748b' }}>
                        {(replaceFile.size / (1024 * 1024)).toFixed(2)} MB • Ready to upgrade
                      </div>
                    </div>
                  ) : (
                    <div>
                      <Upload size={32} color="#6366f1" style={{ margin: '0 auto 8px' }} />
                      <div style={{ fontWeight: 600, fontSize: '14px' }}>Select replacement file</div>
                      <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                        Previous version will remain safely preserved in institutional history.
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="modal-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button type="button" className="outline-btn" onClick={() => setReplaceModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="primary-btn" disabled={isSubmitting || !replaceFile}>
                  {isSubmitting ? 'Replacing...' : `Upload v${replacingMaterial.version + 1}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Details Modal */}
      {editModalOpen && editingMaterial && (
        <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setEditModalOpen(false); }}>
          <div className="modal-card" style={{ maxWidth: '480px' }}>
            <div className="modal-head">
              <div className="modal-icon"><Edit3 size={20} /></div>
              <div>
                <h3>Edit Material Details</h3>
                <p>Update title, description, or release visibility.</p>
              </div>
              <button onClick={() => setEditModalOpen(false)}><X size={20} /></button>
            </div>

            <form onSubmit={handleEditSubmit}>
              <div className="modal-fields" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <label>
                  Title <span className="required">*</span>
                  <input
                    type="text"
                    required
                    value={editTitle}
                    onChange={e => setEditTitle(e.target.value)}
                  />
                </label>

                <label>
                  Description
                  <textarea
                    rows={3}
                    value={editDesc}
                    onChange={e => setEditDesc(e.target.value)}
                  />
                </label>

                <label>
                  Status
                  <select
                    value={editStatus}
                    onChange={e => setEditStatus(e.target.value as any)}
                  >
                    <option value="published">Published</option>
                    <option value="draft">Draft</option>
                    <option value="archived">Archived</option>
                  </select>
                </label>
              </div>

              <div className="modal-actions" style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button type="button" className="outline-btn" onClick={() => setEditModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="primary-btn" disabled={isSubmitting}>
                  {isSubmitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
