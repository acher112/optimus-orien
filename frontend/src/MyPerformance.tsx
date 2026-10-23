import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, RefreshCw, ShieldCheck } from 'lucide-react';
import { request } from './api';
import { BOY, GIRL, ME, GenderGrouped, PrivacyNote } from './GenderCharts';
import './reports.css';

type R = Record<string, any>;
const pct = (n: number | null | undefined) => (n === null || n === undefined ? '—' : `${n}%`);

/** Student / parent view: own marks in gray, next to the class boys (blue) and girls (pink) averages. */
export default function MyPerformance() {
  const [data, setData] = useState<R | null>(null);
  const [ward, setWard] = useState('');
  const [period, setPeriod] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const q = new URLSearchParams();
      if (ward) q.set('student', ward);
      if (period) q.set('period', period);
      setData(await request<R>(`reports/me/?${q.toString()}`));
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : 'Could not load performance');
    } finally {
      setLoading(false);
    }
  }, [ward, period]);
  useEffect(() => { load(); }, [load]);

  const rows: R[] = data?.subjects || [];
  const chart = rows.map(r => ({ name: r.name as string, mine: r.mine as number | null, boys: r.boys as number | null, girls: r.girls as number | null }));
  const o: R = data?.overall || {};
  const hidden = !!o.hidden || rows.some(r => r.hidden);

  return (
    <>
      <div className="page-header">
        <div>
          <div className="eyebrow">INSIGHTS / MY PERFORMANCE</div>
          <h1>{data?.student?.name ? `${data.student.name}’s performance` : 'My performance'}</h1>
          <p>Your marks (gray) compared with the boys (blue) and girls (pink) averages in your class.</p>
        </div>
        <div className="rp-controls">
          {data && (data.wards?.length ?? 0) > 1 && (
            <label className="rp-period"><span>Child</span>
              <select value={ward || data.student.id} onChange={e => setWard(e.target.value)}>
                {data.wards.map((w: R) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </label>
          )}
          <label className="rp-period"><span>Reporting period</span>
            <select value={period} onChange={e => setPeriod(e.target.value)}>
              <option value="">Whole academic record</option>
              {(data?.period?.options || []).map((p: string) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <button className="outline-btn" onClick={load}><RefreshCw size={16} /> Refresh</button>
        </div>
      </div>

      {error && <div className="error-bar"><AlertCircle size={17} /> {error}</div>}
      {loading && !data && <div className="rp-empty">Loading…</div>}

      {data && !data.class && <div className="rp-empty">This student is not enrolled in a class yet, so there is nothing to compare.</div>}
      {data?.class && (
        <div className={loading ? 'rp-body rp-loading' : 'rp-body'}>
          <div className="rp-kpis rp-kpis-3">
            <div className="rp-kpi rp-kpi-me"><span>You · overall</span><strong style={{ color: ME }}>{pct(o.mine)}</strong><small>{data.class.name} · {data.class.school}</small></div>
            <div className="rp-kpi"><span>Boys average</span><strong style={{ color: BOY }}>{pct(o.boys)}</strong><small>Same class</small></div>
            <div className="rp-kpi"><span>Girls average</span><strong style={{ color: GIRL }}>{pct(o.girls)}</strong><small>Same class</small></div>
          </div>

          <section className="panel rp-panel">
            <div className="panel-head">
              <div><h3>Subject by subject</h3><p>{data.period?.label || 'Whole academic record'}</p></div>
              <span className="rp-legend"><i style={{ background: ME }} /> You <i style={{ background: BOY }} /> Boys <i style={{ background: GIRL }} /> Girls</span>
            </div>
            <PrivacyNote split={hidden ? { hidden: true, min_group: data.min_group, boys: { students: 0, average: null }, girls: { students: 0, average: null } } : undefined} />
            {chart.length ? <GenderGrouped rows={chart} showMe /> : <div className="rp-empty">No published results yet.</div>}
            <div className="table-scroll"><table className="data-table">
              <thead><tr><th>SUBJECT</th><th>YOU</th><th>BOYS</th><th>GIRLS</th><th>CLASS</th></tr></thead>
              <tbody>{rows.map(r => (
                <tr key={r.code}><td>{r.name}</td><td style={{ color: '#6b7280', fontWeight: 800 }}>{pct(r.mine)}</td><td style={{ color: BOY, fontWeight: 700 }}>{pct(r.boys)}</td><td style={{ color: GIRL, fontWeight: 700 }}>{pct(r.girls)}</td><td>{pct(r.class_average)}</td></tr>
              ))}</tbody>
            </table></div>
          </section>

          <div className="report-note"><ShieldCheck size={19} /><span>Only averages are shown. No other student is named. {data.method?.basis} {data.method?.missing}</span></div>
        </div>
      )}
    </>
  );
}
