import React, { useEffect, useState, useRef } from 'react';
import {
  AlertCircle, ArrowLeft, ArrowRight, BookOpenCheck, CalendarDays, Check, CheckCircle2,
  ChevronDown, ClipboardCheck, Clock3, Crown, FileCheck2, Globe2, GraduationCap, Info, LoaderCircle,
  MapPin, Plus, Save, School, ShieldCheck, Trash2
} from 'lucide-react';
import { list, request, type Resource, type User } from './api';
import LocationMapModal from './LocationMapModal';
import CurriculumSelect from './CurriculumSelect';
import { ALL_LOCALES, ALL_CURRENCIES } from './localeData';
import './setup.css';

type Period = { name: string; start: string; end: string };
type Config = {
  country: string;
  jurisdiction: string;
  timezone: string;
  language: string;
  locale: string;
  programmes: string[];
  academic_year_name: string;
  academic_start: string | null;
  academic_end: string | null;
  reporting_periods: Period[];
  grading_policy: { approach?: string; description?: string; passing_percentage?: number | string };
  attendance_policy: { recording_basis?: string; description?: string; required_percentage?: number | string };
  school_settings: Record<string, unknown>;
  status: 'draft' | 'active';
  active_version: number;
  activated_at: string | null;
  updated_at: string | null;
};
type SetupResponse = {
  school: { id: number; name: string; code: string; organisation: number };
  configuration: Config | null;
  readiness: { complete: boolean; issues: Record<string, string> };
  versions: { version: number; activated_at: string }[];
};

const EMPTY: Config = {
  country: '',
  jurisdiction: '',
  timezone: '',
  language: '',
  locale: '',
  programmes: [],
  academic_year_name: '',
  academic_start: null,
  academic_end: null,
  reporting_periods: [],
  grading_policy: {},
  attendance_policy: {},
  school_settings: {},
  status: 'draft',
  active_version: 0,
  activated_at: null,
  updated_at: null,
};

const STEPS = [
  { name: 'Identity', icon: School, subtitle: 'Campus & location' },
  { name: 'Language', icon: Globe2, subtitle: 'Time zone & locale' },
  { name: 'Curriculum', icon: BookOpenCheck, subtitle: 'Curricula being taught' },
  { name: 'Calendar', icon: CalendarDays, subtitle: 'Dates & reporting' },
  { name: 'Policies', icon: ClipboardCheck, subtitle: 'Grading & attendance' },
  { name: 'Review', icon: FileCheck2, subtitle: 'Validate & activate' },
];

const Input = ({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) => (
  <label className="setup-field">
    <span>{label}</span>
    {children}
    {description && <small>{description}</small>}
  </label>
);

const languageOptions = [
  ['en', 'English'],
  ['ur', 'Urdu'],
  ['ar', 'Arabic'],
  ['fr', 'French'],
  ['es', 'Spanish'],
  ['other', 'Other (specify separately)']
];

export default function SchoolSetup({ user, initialSchool, onBack }: { user: User; initialSchool?: number | null; onBack: () => void }) {
  const [schools, setSchools] = useState<Resource[]>([]);
  const [schoolId, setSchoolId] = useState<number | null>(initialSchool || user.school || null);
  const [data, setData] = useState<SetupResponse | null>(null);
  const [form, setForm] = useState<Config>(EMPTY);
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [mapModalOpen, setMapModalOpen] = useState(false);
  const campusSelectRef = useRef<HTMLSelectElement>(null);

  const canManage = user.role === 'organisation_admin' || user.role === 'school_admin';
  const currentSchool = schools.find(s => Number(s.id) === Number(schoolId));

  const triggerCampusDropdown = () => {
    if (campusSelectRef.current) {
      if (typeof (campusSelectRef.current as any).showPicker === 'function') {
        try {
          (campusSelectRef.current as any).showPicker();
          return;
        } catch {}
      }
      campusSelectRef.current.focus();
      campusSelectRef.current.click();
    }
  };

  useEffect(() => {
    list<Resource>('schools')
      .then(s => {
        setSchools(s);
        setSchoolId(prev => prev ?? (s[0] ? Number(s[0].id) : null));
      })
      .catch(e => setError(String(e)));
  }, []);

  useEffect(() => {
    if (!schoolId) return;
    setLoading(true);
    setError('');
    setStep(0);
    request<SetupResponse>(`schools/${schoolId}/setup/`)
      .then(r => {
        setData(r);
        setForm({ ...EMPTY, ...r.configuration });
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Unable to load setup'))
      .finally(() => setLoading(false));
  }, [schoolId]);

  const field = <K extends keyof Config>(k: K, value: Config[K]) => setForm(f => ({ ...f, [k]: value }));
  const grading = (k: string, value: any) =>
    setForm(f => {
      const gp = { ...f.grading_policy, [k]: value };
      return { ...f, grading_policy: gp };
    });
  const attendance = (k: string, value: any) =>
    setForm(f => {
      const ap = { ...f.attendance_policy, [k]: value };
      return { ...f, attendance_policy: ap };
    });
  const setPeriod = (idx: number, k: keyof Period, v: string) =>
    field('reporting_periods', form.reporting_periods.map((p, i) => (i === idx ? { ...p, [k]: v } : p)));

  const save = async () => {
    if (!schoolId) return;
    setSaving(true);
    setMessage('');
    setError('');
    try {
      const { status, active_version, activated_at, updated_at, ...draft } = form;
      void status; void active_version; void activated_at; void updated_at;
      const result = await request<SetupResponse>(`schools/${schoolId}/setup/`, { method: 'PATCH', body: JSON.stringify(draft) });
      setData(result);
      setForm({ ...EMPTY, ...result.configuration });
      setMessage('Draft saved successfully. Your changes are not active until you review and activate them.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save draft');
    } finally {
      setSaving(false);
    }
  };

  const activate = async () => {
    if (!schoolId) return;
    setSaving(true);
    setMessage('');
    setError('');
    try {
      const result = await request<SetupResponse>(`schools/${schoolId}/setup/activate/`, { method: 'POST', body: JSON.stringify({}) });
      setData(result);
      setForm({ ...EMPTY, ...result.configuration });
      setMessage(`Configuration version ${result.configuration?.active_version} activated. Historical snapshot preserved.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Activation failed; review required settings');
    } finally {
      setSaving(false);
    }
  };

  const clean = (v: string | null | undefined) => v?.trim() || 'Not provided';

  return (
    <div className="setup-root">
      <div className="setup-intro">
        <div>
          <button className="setup-back" onClick={onBack}>
            <ArrowLeft size={16} /> Back to campuses
          </button>
          <div className="eyebrow"><span className="eyebrow-dot" /> ADMINISTRATIVE ONBOARDING</div>
          <h1>Campus configuration</h1>
          <p>A guided setup for the learning environment your campus actually uses.</p>
        </div>
        <div className="setup-header-identity">
          <span className="setup-header-icon"><GraduationCap size={23} /></span>
          <span><b>Optimus Orien</b><small>Authorised campus onboarding</small></span>
        </div>
      </div>

      <div className="setup-notice">
        <ShieldCheck size={20} />
        <span><strong>Controlled activation.</strong> Only authorised administrators can modify or activate school setup. Public self-registration is not enabled. Configuration does not grant access to private student records.</span>
      </div>

      {error && <div className="setup-error" role="alert"><AlertCircle size={17} />{error}<button onClick={() => setError('')}>Dismiss</button></div>}
      {message && <div className="setup-success" role="status"><CheckCircle2 size={17} />{message}<button onClick={() => setMessage('')}>Dismiss</button></div>}

      <div className="setup-picker">
        <div className="setup-picker-text">
          <span>YOUR AUTHORISED CAMPUS</span>
          <div className="setup-picker-row" onClick={triggerCampusDropdown} title="Click to choose campus">
            <School size={18} />
            <select
              ref={campusSelectRef}
              aria-label="Select campus for configuration"
              value={schoolId ?? ''}
              onChange={e => setSchoolId(Number(e.target.value))}
              onClick={e => e.stopPropagation()}
            >
              <option value="" disabled>Select a campus</option>
              {schools.map(s => (
                <option key={s.id} value={s.id}>
                  {String(s.name)} ({String(s.code)}){(s as any).principal_name ? ` — Principal: ${(s as any).principal_name}` : ''}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="setup-picker-chevron-btn"
              onClick={(e) => {
                e.stopPropagation();
                triggerCampusDropdown();
              }}
              title="Select campus"
              aria-label="Select campus"
            >
              <ChevronDown size={17} />
            </button>
          </div>
          {(currentSchool as any)?.principal_name && (
            <div style={{ fontSize: 12, color: '#6366f1', marginTop: 4, display: 'flex', alignItems: 'center', gap: 5, fontWeight: 600 }}>
              <Crown size={13} color="#f59e0b" /> Principal: {(currentSchool as any).principal_name}
            </div>
          )}
        </div>
        <div className="setup-state">
          {data?.configuration?.status === 'active' ? (
            <span className="setup-status active"><CheckCircle2 size={15} /> Active · v{data.configuration.active_version}</span>
          ) : (
            <span className="setup-status draft"><Clock3 size={15} /> Draft · Not active</span>
          )}
        </div>
      </div>

      {!schools.length && !loading ? (
        <div className="setup-empty">
          <School size={25} />
          <h3>No authorised campuses found.</h3>
          <p>Ask your organisation administrator to create a school record first. Public school self-registration is not part of the approved workflow.</p>
          <button className="setup-btn outline" onClick={onBack}>Back to campuses</button>
        </div>
      ) : null}

      {loading ? (
        <div className="setup-loading"><LoaderCircle size={30} /> Loading campus settings…</div>
      ) : !!schoolId && (
        <div className="setup-layout">
          <aside className="setup-side">
            <div className="setup-side-top">
              <span>SETUP PROGRESS</span>
              <strong>{data?.configuration?.status === 'active' ? 'Configuration active' : 'Draft configuration'}</strong>
              <div className="setup-progress-track">
                <i style={{ width: `${Math.round(((step + 1) / STEPS.length) * 100)}%` }} />
              </div>
              <small>Step {step + 1} of {STEPS.length}</small>
            </div>
            <nav aria-label="Campus setup steps">
              {STEPS.map((s, i) => {
                const Icon = s.icon;
                return (
                  <button key={s.name} className={i === step ? 'active' : ''} onClick={() => setStep(i)} aria-current={i === step ? 'step' : undefined}>
                    <span className="setup-step-icon">{i < step ? <Check size={17} /> : <Icon size={19} />}</span>
                    <span><b>{s.name}</b><small>{s.subtitle}</small></span>
                    {i === step && <ArrowRight size={16} />}
                  </button>
                );
              })}
            </nav>
            <div className="setup-side-foot">
              <ShieldCheck size={20} />
              <p>Drafts stay private. Activation is checked on the server and recorded in an immutable version history.</p>
            </div>
          </aside>

          <section className="setup-stage">
            <div className="setup-stage-header">
              <div>
                <span className="setup-stage-index">STEP {String(step + 1).padStart(2, '0')} / 06</span>
                <h2>
                  {[
                    'Campus identity',
                    'Language & location',
                    'Curriculum Being Taught In This School',
                    'Academic calendar',
                    'Academic policies',
                    'Review & activate'
                  ][step]}
                </h2>
                <p>
                  {[
                    'Confirm the campus this setup belongs to, and specify its location.',
                    'Choose the language and local formatting context that applies to this school.',
                    'Select the curricula and educational programmes taught at this school.',
                    'Define the academic year and each reporting period explicitly.',
                    'Describe your own approved grading and attendance methods.',
                    'Check what is still missing before publishing a versioned configuration.'
                  ][step]}
                </p>
              </div>
              <div className="setup-stage-symbol">{React.createElement(STEPS[step].icon, { size: 27 })}</div>
            </div>

            <div className="setup-form-content">
              {/* STEP 0: CAMPUS IDENTITY */}
              {step === 0 && (
                <div className="setup-form-grid">
                  <Input label="Campus name" description="Campus identity is established by an authorised organisation administrator.">
                    <input readOnly value={data?.school.name || ''} />
                  </Input>

                  <Input label="Campus code">
                    <input readOnly value={data?.school.code || ''} />
                  </Input>

                  <Input label="Country code *" description="ISO 3166-1 alpha-2, for example PK, GB, US. Selecting a country is not a guarantee of jurisdiction-specific compliance.">
                    <input maxLength={2} placeholder="e.g. PK" value={form.country} onChange={e => field('country', e.target.value.toUpperCase())} />
                  </Input>

                  <Input label="Location *" description="Specify the campus location or choose it directly on the interactive map.">
                    <div className="setup-location-input-row">
                      <input
                        placeholder="e.g. Clifton, Karachi, Pakistan"
                        value={form.jurisdiction}
                        onChange={e => field('jurisdiction', e.target.value)}
                      />
                      <button
                        type="button"
                        className="setup-map-trigger-btn"
                        onClick={() => setMapModalOpen(true)}
                        title="Click to open interactive map and select location"
                      >
                        <MapPin size={15} /> Open Map
                      </button>
                    </div>
                  </Input>

                  <div className="setup-inline-help">
                    <Info size={18} /> You cannot create an organisation or school anonymously. An authorised organisation administrator creates the school record first.
                  </div>
                </div>
              )}

              {/* STEP 1: LANGUAGE & LOCATION */}
              {step === 1 && (
                <div className="setup-form-grid">
                  <Input label="Campus time zone *" description="Enter a valid IANA time zone such as Asia/Karachi or Europe/London.">
                    <input placeholder="Asia/Karachi" list="timezones" value={form.timezone} onChange={e => field('timezone', e.target.value)} />
                    <datalist id="timezones">
                      <option value="Asia/Karachi" />
                      <option value="Europe/London" />
                      <option value="Asia/Dubai" />
                      <option value="America/New_York" />
                      <option value="Asia/Singapore" />
                    </datalist>
                  </Input>

                  <Input label="Preferred language *">
                    <select value={form.language} onChange={e => field('language', e.target.value)}>
                      <option value="">Choose language</option>
                      {languageOptions.map(([v, l]) => (
                        <option value={v} key={v}>{l}</option>
                      ))}
                    </select>
                  </Input>

                  <Input label="Locale *" description="Select locale identifier used for date, calendar, and number formatting.">
                    <select value={form.locale} onChange={e => field('locale', e.target.value)}>
                      <option value="">Select locale...</option>
                      {ALL_LOCALES.map(loc => (
                        <option key={loc.value} value={loc.value}>
                          {loc.label} ({loc.value})
                        </option>
                      ))}
                    </select>
                  </Input>

                  <Input label="Campus Currency *" description="Official operational currency for student fees, invoices, payroll, and financials.">
                    <select
                      value={((form.school_settings as any)?.currency) || (data?.school as any)?.currency || 'PKR'}
                      onChange={e => {
                        const val = e.target.value;
                        setForm(f => ({
                          ...f,
                          school_settings: {
                            ...(f.school_settings || {}),
                            currency: val
                          }
                        }));
                      }}
                    >
                      {ALL_CURRENCIES.map(cur => (
                        <option key={cur.code} value={cur.code}>
                          {cur.code} — {cur.name} ({cur.symbol})
                        </option>
                      ))}
                    </select>
                  </Input>

                  <div className="setup-inline-help">
                    <Globe2 size={18} /> Interface translation, RTL layouts, and locale-specific exports require additional implementation. This step records the school's preferences.
                  </div>
                </div>
              )}

              {/* STEP 2: CURRICULUM BEING TAUGHT IN THIS SCHOOL */}
              {step === 2 && (
                <div className="setup-form-grid one">
                  <Input
                    label="Curriculum Being Taught In This School *"
                    description="Choose one or multiple curricula from the dropdown menu, or search and add custom curricula."
                  >
                    <CurriculumSelect
                      selected={form.programmes}
                      onChange={curricula => field('programmes', curricula)}
                    />
                  </Input>
                  <div className="setup-example">
                    <strong>Multiple pathways, one school.</strong>
                    <p>Curriculum names are saved with your campus configuration. Academic assessment modules link their rubrics and grade thresholds to each active curriculum.</p>
                  </div>
                </div>
              )}

              {/* STEP 3: ACADEMIC CALENDAR */}
              {step === 3 && (
                <div className="setup-form-grid">
                  <Input label="Academic year name *">
                    <input placeholder="2026–2027" value={form.academic_year_name} onChange={e => field('academic_year_name', e.target.value)} />
                  </Input>
                  <div />
                  <Input label="Academic year starts *">
                    <input type="date" value={form.academic_start || ''} onChange={e => field('academic_start', e.target.value || null)} />
                  </Input>
                  <Input label="Academic year ends *">
                    <input type="date" value={form.academic_end || ''} onChange={e => field('academic_end', e.target.value || null)} />
                  </Input>
                  <div className="setup-periods">
                    <div className="setup-period-head">
                      <div>
                        <b>Reporting periods *</b>
                        <small>Term, semester, quarter or your school-defined period for report cards. Dates must not overlap.</small>
                      </div>
                      <button onClick={() => field('reporting_periods', [...form.reporting_periods, { name: '', start: '', end: '' }])}>
                        <Plus size={16} /> Add period
                      </button>
                    </div>
                    {form.reporting_periods.map((p, i) => (
                      <div className="setup-period-row" key={i}>
                        <input aria-label={`Period ${i + 1} name`} placeholder="Term name (e.g. First Term)" value={p.name} onChange={e => setPeriod(i, 'name', e.target.value)} />
                        <input aria-label={`Period ${i + 1} start`} type="date" value={p.start} onChange={e => setPeriod(i, 'start', e.target.value)} />
                        <input aria-label={`Period ${i + 1} end`} type="date" value={p.end} onChange={e => setPeriod(i, 'end', e.target.value)} />
                        <button aria-label={`Remove period ${i + 1}`} onClick={() => field('reporting_periods', form.reporting_periods.filter((_, j) => i !== j))}>
                          <Trash2 size={17} />
                        </button>
                      </div>
                    ))}
                    {!form.reporting_periods.length && (
                      <p className="setup-period-empty">No reporting periods added. Add the school's actual reporting structure.</p>
                    )}
                  </div>
                </div>
              )}

              {/* STEP 4: POLICIES */}
              {step === 4 && (
                <div className="setup-form-grid">
                  <div className="setup-policy">
                    <span className="setup-policy-icon lavender"><GraduationCap size={22} /></span>
                    <h3>Passing Grade Criteria *</h3>
                    <p>Specify passing marks percentage and describe the school's approved evaluation criteria.</p>
                    <Input label="Passing marks required (%) *" description="Minimum percentage marks required to pass a grade or assessment (e.g. 40 or 50).">
                      <div className="setup-input-with-suffix">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          placeholder="e.g. 40"
                          value={form.grading_policy.passing_percentage ?? ''}
                          onChange={e => {
                            const val = e.target.value;
                            setForm(f => {
                              const gp = { ...f.grading_policy, passing_percentage: val };
                              if (!gp.description || (gp.description.startsWith('Minimum ') && gp.description.endsWith('% marks required to pass a grade.'))) {
                                gp.description = val ? `Minimum ${val}% marks required to pass a grade.` : '';
                              }
                              return { ...f, grading_policy: gp };
                            });
                          }}
                        />
                        <span className="input-suffix">%</span>
                      </div>
                    </Input>
                    <Input label="Approach">
                      <select value={form.grading_policy.approach || ''} onChange={e => grading('approach', e.target.value)}>
                        <option value="">Choose approach</option>
                        <option value="percentage">Percentage-based</option>
                        <option value="weighted">Weighted assessments</option>
                        <option value="custom">School-defined / custom</option>
                      </select>
                    </Input>
                  </div>
                  <div className="setup-policy">
                    <span className="setup-policy-icon green"><ClipboardCheck size={22} /></span>
                    <h3>Attendance Criteria *</h3>
                    <p>Specify required attendance percentage and eligible attendance recording policies.</p>
                    <Input label="Minimum attendance required (%) *" description="Minimum percentage attendance required for students (e.g. 75 or 80).">
                      <div className="setup-input-with-suffix">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          placeholder="e.g. 75"
                          value={form.attendance_policy.required_percentage ?? ''}
                          onChange={e => {
                            const val = e.target.value;
                            setForm(f => {
                              const ap = { ...f.attendance_policy, required_percentage: val };
                              if (!ap.description || (ap.description.startsWith('Minimum ') && ap.description.endsWith('% attendance required.'))) {
                                ap.description = val ? `Minimum ${val}% attendance required.` : '';
                              }
                              return { ...f, attendance_policy: ap };
                            });
                          }}
                        />
                        <span className="input-suffix">%</span>
                      </div>
                    </Input>
                    <Input label="Attendance recording basis">
                      <select value={form.attendance_policy.recording_basis || ''} onChange={e => attendance('recording_basis', e.target.value)}>
                        <option value="">Choose basis</option>
                        <option value="daily">Daily</option>
                        <option value="session">Per session</option>
                        <option value="custom">School-defined / custom</option>
                      </select>
                    </Input>
                  </div>
                </div>
              )}

              {/* STEP 5: REVIEW & ACTIVATE */}
              {step === 5 && (
                <div className="setup-review">
                  <div className="setup-review-top">
                    <div className="setup-review-emblem"><FileCheck2 size={28} /></div>
                    <div>
                      <h3>Ready for review</h3>
                      <p>Save any edits before activation. The backend checks the full configuration and preserves an activation snapshot.</p>
                    </div>
                  </div>
                  <div className="setup-review-grid">
                    <div><span>School</span><b>{data?.school.name}</b></div>
                    <div><span>Country</span><b>{clean(form.country)}</b></div>
                    <div><span>Time zone</span><b>{clean(form.timezone)}</b></div>
                    <div><span>Locale</span><b>{clean(form.locale)}</b></div>
                    <div><span>Campus Currency</span><b>{((form.school_settings as any)?.currency) || (data?.school as any)?.currency || 'PKR'}</b></div>
                    <div><span>Location</span><b>{clean(form.jurisdiction)}</b></div>
                    <div><span>Curriculum</span><b>{form.programmes.length ? form.programmes.join(', ') : 'None added'}</b></div>
                    <div><span>Academic year</span><b>{clean(form.academic_year_name)}</b></div>
                    <div><span>Reporting periods</span><b>{form.reporting_periods.length}</b></div>
                    <div><span>Passing grade criteria</span><b>{form.grading_policy.passing_percentage ? `${form.grading_policy.passing_percentage}% passing` : clean(form.grading_policy.approach)}</b></div>
                    <div><span>Attendance criteria</span><b>{form.attendance_policy.required_percentage ? `${form.attendance_policy.required_percentage}% attendance` : clean(form.attendance_policy.recording_basis)}</b></div>
                    <div><span>Previous active version</span><b>{data?.configuration?.active_version || 'None'}</b></div>
                  </div>
                  <div className="setup-validation">
                    <h4><ShieldCheck size={18} /> Last saved validation result</h4>
                    {data?.readiness.complete ? (
                      <div className="setup-valid"><CheckCircle2 size={18} /> All required fields were valid when this draft was last saved.</div>
                    ) : (
                      <div className="setup-issues">
                        {Object.entries(data?.readiness.issues || {}).map(([k, v]) => (
                          <div key={k}>
                            <AlertCircle size={15} />
                            <span><b>{k.replaceAll('_', ' ')}</b> — {v}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <p>Unsaved changes are not checked until you save the draft.</p>
                  </div>
                  <div className="setup-activation">
                    <div>
                      <h4>Activate campus setup</h4>
                      <p>Only a valid saved draft can be activated. This preserves the previous approved snapshot for historical reference.</p>
                    </div>
                    <button disabled={saving || data?.configuration?.status === 'active' || !data?.readiness.complete} onClick={activate}>
                      <ShieldCheck size={17} />{saving ? 'Working…' : 'Activate configuration'}
                    </button>
                  </div>
                  {data?.versions.length ? (
                    <div className="setup-versions">
                      <h4>Activation history</h4>
                      {data.versions.map(v => (
                        <div key={v.version}>
                          <span>Version {v.version}</span>
                          <span>{new Date(v.activated_at).toLocaleDateString()}</span>
                          <CheckCircle2 size={16} />
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              )}
            </div>

            <div className="setup-actions">
              <div className="setup-autosave"><Info size={16} /> Drafts are saved only when you click Save draft.</div>
              <div className="setup-action-buttons">
                <button className="setup-btn outline" disabled={step === 0} onClick={() => setStep(x => Math.max(0, x - 1))}>
                  <ArrowLeft size={16} /> Back
                </button>
                {canManage && (
                  <button className="setup-btn muted" disabled={saving} onClick={save}>
                    {saving ? <LoaderCircle size={16} /> : <Save size={16} />} Save draft
                  </button>
                )}
                {step < STEPS.length - 1 && (
                  <button className="setup-btn primary" onClick={() => setStep(x => Math.min(STEPS.length - 1, x + 1))}>
                    Continue <ArrowRight size={16} />
                  </button>
                )}
              </div>
            </div>
          </section>
        </div>
      )}

      {/* Map Location Picker Modal */}
      {mapModalOpen && (
        <LocationMapModal
          currentLocation={form.jurisdiction}
          onClose={() => setMapModalOpen(false)}
          onSelect={(loc, coords) => {
            field('jurisdiction', loc);
            if (coords) {
              field('school_settings', {
                ...form.school_settings,
                location: loc,
                lat: coords.lat,
                lng: coords.lng,
              });
            }
          }}
        />
      )}
    </div>
  );
}
