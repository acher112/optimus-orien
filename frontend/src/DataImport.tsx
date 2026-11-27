import React, { useState, useEffect } from 'react';
import {
  AlertCircle, CheckCircle2, Download, FileText, RefreshCw,
  ShieldAlert, ShieldCheck, Upload, UploadCloud, FileSpreadsheet,
  X, Check, Info, Layers, BookOpen, GraduationCap, Users, School as SchoolIcon,
  Calendar, Award, Package
} from 'lucide-react';
import { list, request, type User } from './api';
import './hr.css';

type R = Record<string, any>;
type EntityType = 'students' | 'staff' | 'classes' | 'subjects' | 'attendance' | 'marks' | 'full_school';

interface EntityTabConfig {
  id: EntityType;
  label: string;
  icon: React.ReactNode;
  description: string;
}

const TABS: EntityTabConfig[] = [
  { id: 'students', label: 'Students', icon: <GraduationCap size={15} />, description: 'Student rosters, admission numbers, dates of birth, parents & phone contacts' },
  { id: 'staff', label: 'Staff & Faculty', icon: <Users size={15} />, description: 'Teachers, administrators, positions, emails, and hiring dates' },
  { id: 'classes', label: 'Classes & Sections', icon: <SchoolIcon size={15} />, description: 'Class grades, sections (A, B, etc.), grade levels and curricula' },
  { id: 'subjects', label: 'Campus Subjects', icon: <BookOpen size={15} />, description: 'Curriculum subjects, subject titles, and course codes' },
  { id: 'attendance', label: 'Attendance', icon: <Calendar size={15} />, description: 'Daily attendance logs (Present, Absent, Late, Excused)' },
  { id: 'marks', label: 'Exam Marks', icon: <Award size={15} />, description: 'Student examination scores, grades, and feedback remarks' },
  { id: 'full_school', label: 'Full School Workbook (All Tabs)', icon: <Package size={15} />, description: 'Master multi-sheet Excel workbook importing Classes, Subjects, Staff & Students all at once' },
];

const SAMPLE_CSV_TEMPLATES: Record<string, string> = {
  students: `first_name,last_name,admission_number,roll_number,date_of_birth,gender,class,section,father_name,guardian_phone,address
Hamza,Ali,STU-2026-001,1,2012-05-14,male,Grade 8,A,Ali Raza,03001234567,123 Main Blvd
Ayesha,Khan,STU-2026-002,2,2012-08-22,female,Grade 8,A,Tariq Khan,03007654321,45 Garden Town
Zainab,Tariq,STU-2026-003,3,2012-11-05,female,Grade 8,B,Tariq Mehmood,03009988776,78 Model Town`,

  staff: `first_name,last_name,position,role,email,phone,hired_on,address
Bilal,Ahmed,Mathematics Teacher,teacher,bilal.ahmed@school.edu,03001234567,2024-08-15,Gulberg III
Fatima,Noor,Head of Science,teacher,fatima.noor@school.edu,03007654321,2023-01-10,DHA Phase 5
Dr. Asim,Farooq,Campus Principal,principal,asim.farooq@school.edu,03005544332,2022-06-01,Johar Town`,

  classes: `name,section,grade_level,curriculum,building
Grade 6,A,Middle School,Matriculation,Main Block
Grade 7,A,Middle School,Matriculation,Main Block
Grade 8,A,Middle School,Matriculation,North Wing
Grade 9,A,High School,Cambridge O-Levels,Science Block
Grade 10,A,High School,Cambridge O-Levels,Science Block`,

  subjects: `name,code,department
Mathematics,MATH-101,Sciences
English Literature,ENG-102,Humanities
Computer Science & AI,CS-103,Technology
Physics,PHY-104,Sciences
Chemistry,CHEM-105,Sciences`,

  attendance: `admission_number,date,status,class_name
STU-2026-001,2026-11-26,present,Grade 8
STU-2026-002,2026-11-26,present,Grade 8
STU-2026-003,2026-11-26,late,Grade 8`,

  marks: `admission_number,marks,status,feedback
STU-2026-001,88.5,recorded,Excellent problem solving
STU-2026-002,92.0,recorded,Outstanding performance
STU-2026-003,0.0,absent,Medical leave`,

  full_school: `[Master Multi-Sheet Excel Workbook (.xlsx)]
Contains 4 individual sheets: Classes, Subjects, Staff, and Students.
Upload a multi-tab Excel file to set up all school entities in one click.`
};

export default function DataImport({ user, notify }: { user: User; notify: (m: string) => void }) {
  const [entityType, setEntityType] = useState<EntityType>('students');
  const [schools, setSchools] = useState<R[]>([]);
  const [school, setSchool] = useState('');
  const [csvData, setCsvData] = useState(SAMPLE_CSV_TEMPLATES['students']);
  const [papers, setPapers] = useState<R[]>([]);
  const [selectedPaper, setSelectedPaper] = useState('');

  // Uploaded file state (.xlsx or .csv)
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [availableSheets, setAvailableSheets] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [inspectingFile, setInspectingFile] = useState<boolean>(false);

  const [validationResult, setValidationResult] = useState<R | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    list<R>('schools').then(res => {
      setSchools(res);
      if (res.length) setSchool(String(res[0].id));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (entityType === 'marks') {
      request<R>('exams/papers/').then(res => setPapers(res.results || [])).catch(() => {});
    }
  }, [entityType]);

  const handleEntityChange = (e: EntityType) => {
    setEntityType(e);
    setCsvData(SAMPLE_CSV_TEMPLATES[e] || '');
    setSelectedFile(null);
    setAvailableSheets([]);
    setSelectedSheet('');
    setValidationResult(null);
    setError('');
  };

  // Download templates (Excel or CSV)
  const handleDownloadTemplate = (format: 'xlsx' | 'csv') => {
    const url = `/api/v1/imports/template/?entity_type=${entityType}&export_format=${format}`;
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `optimus_${entityType}_template.${format}`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // File selection
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setValidationResult(null);
    setError('');

    const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');

    if (isExcel) {
      // Inspect Excel file to get sheets & previews
      setInspectingFile(true);
      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('entity_type', entityType);

        const res = await request<R>('imports/inspect-file/', {
          method: 'POST',
          body: formData
        });

        if (res.available_sheets && res.available_sheets.length > 0) {
          setAvailableSheets(res.available_sheets);
          setSelectedSheet(res.active_sheet || res.available_sheets[0]);
        }
      } catch (err: any) {
        // Fallback gracefully
        setAvailableSheets(['Sheet1']);
        setSelectedSheet('Sheet1');
      } finally {
        setInspectingFile(false);
      }
    } else {
      // It's a CSV file, read text for display in textarea
      const reader = new FileReader();
      reader.onload = ev => {
        setCsvData(ev.target?.result as string || '');
      };
      reader.readAsText(file);
      setAvailableSheets([]);
      setSelectedSheet('');
    }
  };

  const handleClearFile = () => {
    setSelectedFile(null);
    setAvailableSheets([]);
    setSelectedSheet('');
    setCsvData(SAMPLE_CSV_TEMPLATES[entityType] || '');
    setValidationResult(null);
  };

  // Run dry run or commit
  const handleRunValidation = async (dryRun: boolean) => {
    setLoading(true);
    setError('');
    try {
      if (entityType === 'marks' && !selectedPaper) {
        setError('Please select an exam paper for marks import.');
        setLoading(false);
        return;
      }

      let res: R;

      if (selectedFile) {
        // Upload via FormData
        const formData = new FormData();
        formData.append('file', selectedFile);
        formData.append('entity_type', entityType);
        formData.append('dry_run', dryRun ? 'true' : 'false');
        if (school) formData.append('school', school);
        if (selectedSheet) formData.append('sheet_name', selectedSheet);
        if (entityType === 'marks' && selectedPaper) {
          formData.append('paper_id', selectedPaper);
        }

        res = await request<R>('imports/csv/', {
          method: 'POST',
          body: formData
        });
      } else {
        // Send JSON with csv_data
        const payload: R = {
          entity_type: entityType,
          csv_data: csvData,
          dry_run: dryRun,
          school: school || undefined
        };
        if (entityType === 'marks') {
          payload.paper_id = selectedPaper;
        }

        res = await request<R>('imports/csv/', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
      }

      if (dryRun) {
        setValidationResult(res);
        if (res.errors_count > 0) {
          notify(`Validation finished with ${res.errors_count} error(s). Please review.`);
        } else {
          notify(`All ${res.valid_rows_count || res.total_created || 0} records passed validation! Ready to commit.`);
        }
      } else {
        notify(`Success: ${res.created_count || res.total_created || 0} ${entityType} records imported successfully!`);
        setValidationResult(null);
        setSelectedFile(null);
      }
    } catch (err: any) {
      setError(err instanceof Error ? err.message : (err.headers || 'Import failed'));
      if (err.errors) {
        setValidationResult(err);
      }
    } finally {
      setLoading(false);
    }
  };

  const currentTab = TABS.find(t => t.id === entityType) || TABS[0];

  return (
    <>
      <div className="page-header">
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <UploadCloud size={28} color="#0284c7" /> Universal Data Import
          </h1>
          <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '0.92rem' }}>
            Seamlessly fetch and import records from Excel (.xlsx) or CSV files. Extra columns (like address) are safely skipped without errors.
          </p>
        </div>
        <div className="fx-filters" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {schools.length > 1 && (
            <label style={{ fontSize: 13, fontWeight: 600 }}>Campus:
              <select className="fx-select" value={school} onChange={e => setSchool(e.target.value)}>
                {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
          )}

          {/* Download Buttons */}
          <button
            type="button"
            className="outline-btn"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            onClick={() => handleDownloadTemplate('xlsx')}
            title="Download structured Excel template"
          >
            <FileSpreadsheet size={15} color="#16a34a" /> Download Excel (.xlsx)
          </button>
          <button
            type="button"
            className="outline-btn"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            onClick={() => handleDownloadTemplate('csv')}
            title="Download plain CSV template"
          >
            <Download size={15} /> Download CSV
          </button>
        </div>
      </div>

      {/* TABS NAVIGATION */}
      <nav className="fx-tabs" aria-label="Import types" style={{ overflowX: 'auto', display: 'flex', gap: 6, marginBottom: 18 }}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            type="button"
            className={entityType === tab.id ? 'on' : ''}
            onClick={() => handleEntityChange(tab.id)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </nav>

      {/* Tab description info banner */}
      <div style={{
        background: '#f0f9ff',
        border: '1px solid #bae6fd',
        borderRadius: 12,
        padding: '10px 16px',
        marginBottom: 20,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        fontSize: '0.88rem',
        color: '#0369a1'
      }}>
        <Info size={18} style={{ flexShrink: 0 }} />
        <div>
          <strong>{currentTab.label} Import: </strong>
          {currentTab.description}.
          <span style={{ color: '#0284c7', marginLeft: 6 }}>
            Extra columns (e.g. <i>Address</i>, <i>City</i>, <i>Blood Group</i>) will be automatically skipped without causing errors.
          </span>
        </div>
      </div>

      {error && <div className="error-bar"><AlertCircle size={17} /> {error}</div>}

      <div className="fx-grid data-import-grid">
        {/* ================================================================= */}
        {/* LEFT COLUMN: FILE UPLOAD & SOURCE DATA                            */}
        {/* ================================================================= */}
        <section className="panel hr-panel">
          <div className="panel-head" style={{ flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h3>Source File or Content</h3>
              <p>Upload an Excel spreadsheet (.xlsx), CSV file, or paste text</p>
            </div>
            <label className="primary-btn" style={{ cursor: 'pointer', margin: 0, whiteSpace: 'nowrap', background: '#0284c7' }}>
              <Upload size={14} /> Upload Excel / CSV
              <input
                type="file"
                accept=".xlsx,.xls,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />
            </label>
          </div>

          <div style={{ padding: '16px 20px' }}>
            {/* If an Excel / CSV file is chosen */}
            {selectedFile ? (
              <div style={{
                background: '#f8fafc',
                border: '2px dashed #0284c7',
                borderRadius: 12,
                padding: '16px 20px',
                marginBottom: 16
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    {selectedFile.name.endsWith('.xlsx') || selectedFile.name.endsWith('.xls') ? (
                      <div style={{ background: '#ecfdf5', color: '#16a34a', padding: 10, borderRadius: 10 }}>
                        <FileSpreadsheet size={24} />
                      </div>
                    ) : (
                      <div style={{ background: '#f1f5f9', color: '#0284c7', padding: 10, borderRadius: 10 }}>
                        <FileText size={24} />
                      </div>
                    )}
                    <div>
                      <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.96rem' }}>{selectedFile.name}</div>
                      <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
                        {(selectedFile.size / 1024).toFixed(1)} KB • {selectedFile.name.endsWith('.xlsx') ? 'Excel Spreadsheet' : 'CSV Data'}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleClearFile}
                    style={{ background: '#fee2e2', border: 'none', color: '#dc2626', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.8rem', fontWeight: 600 }}
                  >
                    <X size={14} /> Remove
                  </button>
                </div>

                {/* Multi-Sheet Selection for Excel */}
                {availableSheets.length > 1 && (
                  <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid #e2e8f0' }}>
                    <label style={{ fontSize: '0.84rem', fontWeight: 700, color: '#334155' }}>
                      Target Sheet from Excel Workbook:
                      <select
                        className="fx-select"
                        style={{ marginLeft: 8, padding: '4px 8px', fontSize: '0.84rem' }}
                        value={selectedSheet}
                        onChange={e => { setSelectedSheet(e.target.value); setValidationResult(null); }}
                      >
                        {availableSheets.map(s => (
                          <option key={s} value={s}>
                            {s} {s.toLowerCase() === entityType.toLowerCase() ? '★ (Matches Tab)' : ''}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                )}
              </div>
            ) : null}

            {entityType === 'marks' && (
              <label style={{ display: 'block', marginBottom: 16 }}>Target Exam Paper *
                <select className="fx-select" style={{ width: '100%', marginTop: 4 }} value={selectedPaper} onChange={e => setSelectedPaper(e.target.value)}>
                  <option value="">Select paper…</option>
                  {papers.map(p => <option key={p.id} value={p.id}>{p.class_name} - {p.subject_name} ({p.date})</option>)}
                </select>
              </label>
            )}

            {!selectedFile && (
              <>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                  Paste CSV or Inspect Data Content:
                </label>
                <textarea
                  rows={13}
                  style={{
                    width: '100%',
                    fontFamily: 'monospace',
                    fontSize: 12,
                    padding: 12,
                    borderRadius: 8,
                    border: '1px solid var(--border-color, #cbd5e1)',
                    background: 'var(--bg-input, #fff)',
                    color: 'inherit',
                    boxSizing: 'border-box'
                  }}
                  value={csvData}
                  onChange={e => { setCsvData(e.target.value); setValidationResult(null); }}
                />
              </>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="outline-btn"
                style={{ flex: '1 1 180px', minWidth: 160, justifyContent: 'center' }}
                onClick={() => handleRunValidation(true)}
                disabled={Boolean(loading || (!selectedFile && !csvData.trim()))}
              >
                <ShieldCheck size={16} /> {loading ? 'Validating…' : 'Run Dry-Run Validation'}
              </button>

              <button
                type="button"
                className="primary-btn"
                style={{ flex: '1 1 180px', minWidth: 160, justifyContent: 'center', background: '#0284c7' }}
                onClick={() => handleRunValidation(false)}
                disabled={Boolean(loading || (!selectedFile && !csvData.trim()) || (validationResult && validationResult.errors_count > 0))}
              >
                <UploadCloud size={16} /> Commit & Import Records
              </button>
            </div>
          </div>
        </section>

        {/* ================================================================= */}
        {/* RIGHT COLUMN: VALIDATION RESULTS & SCHEMA CHECK                   */}
        {/* ================================================================= */}
        <section className="panel hr-panel">
          <div className="panel-head">
            <div>
              <h3>Validation & Preview Results</h3>
              <p>Inspected columns, extra fields, duplicate checks, and data preview</p>
            </div>
          </div>

          <div style={{ padding: '16px 20px' }}>
            {!validationResult && (
              <div className="rp-empty" style={{ padding: '40px 20px', textAlign: 'center' }}>
                <FileSpreadsheet size={36} color="#94a3b8" style={{ marginBottom: 12 }} />
                <div style={{ fontWeight: 600, color: '#334155' }}>Ready for Inspection</div>
                <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: 4 }}>
                  Select an Excel (.xlsx) file or paste CSV on the left, then click <b>'Run Dry-Run Validation'</b> to inspect records before committing.
                </div>
              </div>
            )}

            {validationResult && (
              <>
                {/* Result Summary Bar */}
                <div style={{
                  padding: 14,
                  borderRadius: 10,
                  marginBottom: 16,
                  background: validationResult.errors_count > 0 ? 'rgba(220, 38, 38, 0.08)' : 'rgba(22, 163, 74, 0.08)',
                  border: `1px solid ${validationResult.errors_count > 0 ? '#fca5a5' : '#86efac'}`
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, color: validationResult.errors_count > 0 ? '#dc2626' : '#16a34a' }}>
                    {validationResult.errors_count > 0 ? <ShieldAlert size={19} /> : <CheckCircle2 size={19} />}
                    {validationResult.errors_count > 0
                      ? `Found ${validationResult.errors_count} validation issue(s).`
                      : `Validation Passed! All ${validationResult.valid_rows_count || validationResult.total_created || 0} row(s) are valid.`}
                  </div>
                  <div style={{ fontSize: 13, marginTop: 4, color: '#64748b' }}>
                    Total rows processed: {validationResult.total_rows || validationResult.valid_rows_count || 0} · Valid: {validationResult.valid_rows_count || validationResult.total_created || 0}
                  </div>
                </div>

                {/* SKIPPED UNMAPPED COLUMNS CALLOUT (Addresses User Request 1) */}
                {validationResult.skipped_columns && validationResult.skipped_columns.length > 0 && (
                  <div style={{
                    background: '#fffbeb',
                    border: '1px solid #fde68a',
                    borderRadius: 10,
                    padding: '12px 16px',
                    marginBottom: 16,
                    fontSize: '0.85rem',
                    color: '#92400e'
                  }}>
                    <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <Check size={16} color="#d97706" /> Safe Column Skipping Active
                    </div>
                    <div>
                      {validationResult.skipped_columns_note || (
                        `The column(s) ${validationResult.skipped_columns.join(', ')} were detected in your sheet and safely ignored because they are not part of ${entityType} schema. All recognized fields will import cleanly without errors.`
                      )}
                    </div>
                  </div>
                )}

                {/* Errors List */}
                {validationResult.errors?.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <h5 style={{ color: '#dc2626', margin: '0 0 8px' }}>Errors Detected:</h5>
                    <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid #fee2e2', borderRadius: 8 }}>
                      <table className="data-table" style={{ fontSize: 12 }}>
                        <thead><tr><th>ROW</th><th>COLUMN</th><th>ISSUE</th></tr></thead>
                        <tbody>
                          {validationResult.errors.map((err: R, idx: number) => (
                            <tr key={idx}>
                              <td><strong>Row {err.row || idx + 1}</strong></td>
                              <td>{err.column || 'General'}</td>
                              <td style={{ color: '#dc2626' }}>{err.message}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Multi-Tab Results Breakdown for Full School */}
                {validationResult.results_per_tab && (
                  <div style={{ marginBottom: 16 }}>
                    <h5 style={{ margin: '0 0 8px' }}>Multi-Tab Breakdown:</h5>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
                      {Object.entries(validationResult.results_per_tab).map(([k, v]: [string, any]) => (
                        <div key={k} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 10 }}>
                          <div style={{ textTransform: 'capitalize', fontWeight: 700, fontSize: '0.84rem' }}>{k}</div>
                          <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0284c7' }}>{v.valid_rows_count || v.created_count || 0}</div>
                          <div style={{ fontSize: '0.74rem', color: '#64748b' }}>records</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Preview Sample Table */}
                {validationResult.preview?.length > 0 && (
                  <div>
                    <h5 style={{ margin: '0 0 8px' }}>Preview Sample (First Rows):</h5>
                    <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                      <table className="data-table" style={{ fontSize: 12 }}>
                        <thead>
                          <tr>
                            {Object.keys(validationResult.preview[0] || {}).map(k => (
                              <th key={k}>{k.replace(/_/g, ' ').toUpperCase()}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {validationResult.preview.map((row: R, i: number) => (
                            <tr key={i}>
                              {Object.values(row).map((v: any, j: number) => (
                                <td key={j}>{typeof v === 'object' && v ? (v.full_name || v.name || JSON.stringify(v)) : String(v || '—')}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
