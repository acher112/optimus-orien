import { useState, useEffect } from 'react';
import {
  AlertCircle, CheckCircle2, Download, FileText, RefreshCw,
  ShieldAlert, ShieldCheck, Upload, UploadCloud
} from 'lucide-react';
import { list, request, type User } from './api';
import './hr.css';

type R = Record<string, any>;
type EntityType = 'students' | 'staff' | 'marks';

const SAMPLE_TEMPLATES: Record<EntityType, string> = {
  students: `first_name,last_name,admission_number,roll_number,date_of_birth,gender,class
Hamza,Ali,STU-2026-001,1,2012-05-14,male,Grade 8A
Ayesha,Khan,STU-2026-002,2,2012-08-22,female,Grade 8A
Zainab,Tariq,STU-2026-003,3,2012-11-05,female,Grade 8A`,

  staff: `first_name,last_name,position,role,email,phone,hired_on
Bilal,Ahmed,Mathematics Teacher,teacher,bilal.ahmed@school.edu,03001234567,2024-08-15
Fatima,Noor,Head of Science,teacher,fatima.noor@school.edu,03007654321,2023-01-10`,

  marks: `admission_number,marks,status,feedback
STU-2026-001,88.5,recorded,Excellent problem solving
STU-2026-002,92.0,recorded,Outstanding performance
STU-2026-003,0.0,absent,Medical leave`
};

export default function DataImport({ user, notify }: { user: User; notify: (m: string) => void }) {
  const [entityType, setEntityType] = useState<EntityType>('students');
  const [schools, setSchools] = useState<R[]>([]);
  const [school, setSchool] = useState('');
  const [csvData, setCsvData] = useState(SAMPLE_TEMPLATES['students']);
  const [papers, setPapers] = useState<R[]>([]);
  const [selectedPaper, setSelectedPaper] = useState('');

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
    setCsvData(SAMPLE_TEMPLATES[e]);
    setValidationResult(null);
    setError('');
  };

  const downloadSampleCSV = () => {
    const csvContent = 'data:text/csv;charset=utf-8,' + encodeURIComponent(SAMPLE_TEMPLATES[entityType]);
    const link = document.createElement('a');
    link.setAttribute('href', csvContent);
    link.setAttribute('download', `sample_${entityType}_import.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      setCsvData(ev.target?.result as string || '');
      setValidationResult(null);
    };
    reader.readAsText(file);
  };

  const handleRunValidation = async (dryRun: boolean) => {
    setLoading(true);
    setError('');
    try {
      const payload: R = {
        entity_type: entityType,
        csv_data: csvData,
        dry_run: dryRun,
        school: school || undefined
      };
      if (entityType === 'marks') {
        if (!selectedPaper) {
          setError('Please select an exam paper for marks import.');
          setLoading(false);
          return;
        }
        payload.paper_id = selectedPaper;
      }

      const res = await request<R>('imports/csv/', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      if (dryRun) {
        setValidationResult(res);
        if (res.errors_count > 0) {
          notify(`Validation finished with ${res.errors_count} error(s). Please review.`);
        } else {
          notify(`All ${res.valid_rows_count} rows passed validation! Ready to commit.`);
        }
      } else {
        notify(`Success: ${res.created_count} ${entityType} records imported successfully!`);
        setValidationResult(null);
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

  return (
    <>
      <div className="page-header">
        <div>
          <div className="eyebrow">ADMINISTRATION / BULK DATA INGESTION</div>
          <h1>Data Import</h1>
          <p>Import students, staff, or exam marks with dry-run validation preview and duplicate checks.</p>
        </div>
        <div className="fx-filters">
          {schools.length > 1 && (
            <label>Campus
              <select className="fx-select" value={school} onChange={e => setSchool(e.target.value)}>
                {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
          )}
          <button className="outline-btn" onClick={downloadSampleCSV}><Download size={15} /> Download Sample CSV</button>
        </div>
      </div>

      <nav className="fx-tabs" aria-label="Import types">
        <button className={entityType === 'students' ? 'on' : ''} onClick={() => handleEntityChange('students')}>
          Import Students
        </button>
        <button className={entityType === 'staff' ? 'on' : ''} onClick={() => handleEntityChange('staff')}>
          Import Staff
        </button>
        <button className={entityType === 'marks' ? 'on' : ''} onClick={() => handleEntityChange('marks')}>
          Import Exam Marks
        </button>
      </nav>

      {error && <div className="error-bar"><AlertCircle size={17} /> {error}</div>}

      <div className="fx-grid data-import-grid">
        <section className="panel hr-panel">
          <div className="panel-head" style={{ flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h3>CSV Source Data</h3>
              <p>Upload a file or paste comma-separated values directly</p>
            </div>
            <label className="outline-btn" style={{ cursor: 'pointer', margin: 0, whiteSpace: 'nowrap' }}>
              <Upload size={14} /> Upload CSV File
              <input type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={handleFileUpload} />
            </label>
          </div>

          <div style={{ padding: '16px 20px' }}>
            {entityType === 'marks' && (
              <label style={{ display: 'block', marginBottom: 16 }}>Target Exam Paper *
                <select className="fx-select" style={{ width: '100%', marginTop: 4 }} value={selectedPaper} onChange={e => setSelectedPaper(e.target.value)}>
                  <option value="">Select paper…</option>
                  {papers.map(p => <option key={p.id} value={p.id}>{p.class_name} - {p.subject_name} ({p.date})</option>)}
                </select>
              </label>
            )}

            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
              CSV Content:
            </label>
            <textarea
              rows={14}
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

            <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
              <button
                className="outline-btn"
                style={{ flex: '1 1 180px', minWidth: 160, justifyContent: 'center' }}
                onClick={() => handleRunValidation(true)}
                disabled={loading || !csvData.trim()}
              >
                <ShieldCheck size={16} /> {loading ? 'Validating…' : 'Run Dry-Run Validation'}
              </button>

              <button
                className="primary-btn"
                style={{ flex: '1 1 180px', minWidth: 160, justifyContent: 'center' }}
                onClick={() => handleRunValidation(false)}
                disabled={Boolean(loading || !csvData.trim() || (validationResult && validationResult.errors_count > 0))}
              >
                <UploadCloud size={16} /> Commit & Import Records
              </button>
            </div>
          </div>
        </section>

        <section className="panel hr-panel">
          <div className="panel-head">
            <div>
              <h3>Validation & Preview Results</h3>
              <p>Inspected schema, duplicate checks, and data preview</p>
            </div>
          </div>

          <div style={{ padding: '16px 20px' }}>
            {!validationResult && (
              <div className="rp-empty">
                Paste your CSV or upload a file on the left, then click <b>'Run Dry-Run Validation'</b> to inspect records before committing.
              </div>
            )}

            {validationResult && (
              <>
                <div style={{
                  padding: 14,
                  borderRadius: 8,
                  marginBottom: 16,
                  background: validationResult.errors_count > 0 ? 'rgba(220, 38, 38, 0.08)' : 'rgba(22, 163, 74, 0.08)',
                  border: `1px solid ${validationResult.errors_count > 0 ? '#fca5a5' : '#86efac'}`
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, color: validationResult.errors_count > 0 ? '#dc2626' : '#16a34a' }}>
                    {validationResult.errors_count > 0 ? <ShieldAlert size={19} /> : <CheckCircle2 size={19} />}
                    {validationResult.errors_count > 0
                      ? `Found ${validationResult.errors_count} validation error(s).`
                      : `Validation Passed! All ${validationResult.valid_rows_count} row(s) are valid.`}
                  </div>
                  <div style={{ fontSize: 13, marginTop: 4, color: '#64748b' }}>
                    Total rows processed: {validationResult.total_rows} · Valid: {validationResult.valid_rows_count}
                  </div>
                </div>

                {validationResult.errors?.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <h5 style={{ color: '#dc2626', margin: '0 0 8px' }}>Errors Detected:</h5>
                    <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid #fee2e2', borderRadius: 6 }}>
                      <table className="data-table" style={{ fontSize: 12 }}>
                        <thead><tr><th>ROW</th><th>COLUMN</th><th>ISSUE</th></tr></thead>
                        <tbody>
                          {validationResult.errors.map((err: R, idx: number) => (
                            <tr key={idx}>
                              <td><strong>Row {err.row}</strong></td>
                              <td>{err.column}</td>
                              <td style={{ color: '#dc2626' }}>{err.message}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {validationResult.preview?.length > 0 && (
                  <div>
                    <h5 style={{ margin: '0 0 8px' }}>Preview Sample (First 10 Rows):</h5>
                    <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                      <table className="data-table" style={{ fontSize: 12 }}>
                        <thead>
                          <tr>
                            {Object.keys(validationResult.preview[0] || {}).map(k => (
                              <th key={k}>{k.toUpperCase()}</th>
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
