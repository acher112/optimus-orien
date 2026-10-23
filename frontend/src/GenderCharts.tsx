import { Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ShieldCheck } from 'lucide-react';

/** Colour convention used on every chart: girls pink, boys blue, "you" gray. */
export const GIRL = '#ec4899';
export const BOY = '#3b82f6';
export const ME = '#9ca3af';

export type Split = {
  boys: { students: number; average: number | null };
  girls: { students: number; average: number | null };
  unspecified?: number;
  hidden?: boolean;
  min_group?: number;
};

const tick = { fontSize: 12, fill: '#8c96a7' };

export function PrivacyNote({ split }: { split?: Split }) {
  if (!split?.hidden) return null;
  return (
    <div className="rp-warn">
      <ShieldCheck size={17} />
      <span>Boys / girls averages are hidden because a group has fewer than {split.min_group ?? 3} students. This protects individual privacy.</span>
    </div>
  );
}

/** Two bars: boys (blue) and girls (pink), with student counts in the labels. */
export function GenderOverall({ split, label = 'Average' }: { split: Split; label?: string }) {
  const data = [
    { name: `Boys (${split.boys.students})`, value: split.boys.average, fill: BOY },
    { name: `Girls (${split.girls.students})`, value: split.girls.average, fill: GIRL },
  ];
  if (data.every(d => d.value === null)) return null;
  return (
    <div className="rp-chart rp-chart-sm" aria-label={`Boys and girls ${label}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 12, right: 16, bottom: 3, left: 0 }}>
          <CartesianGrid vertical={false} stroke="#edf0f6" strokeDasharray="4 6" />
          <XAxis dataKey="name" tickLine={false} axisLine={false} tick={tick} />
          <YAxis domain={[0, 100]} tickLine={false} axisLine={false} tick={tick} />
          <Tooltip formatter={v => `${v}%`} />
          <Bar dataKey="value" name={label} radius={[9, 9, 0, 0]} maxBarSize={72}>
            {data.map((d, i) => <Cell key={i} fill={d.fill} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Grouped bars per campus / class / subject: boys blue next to girls pink (and optionally "you" gray). */
export function GenderGrouped({ rows, showMe = false }: { rows: { name: string; boys: number | null; girls: number | null; mine?: number | null }[]; showMe?: boolean }) {
  const data = rows.filter(r => r.boys !== null || r.girls !== null || (showMe && r.mine != null));
  if (!data.length) return null;
  return (
    <div className="rp-chart" aria-label="Boys and girls by group">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 12, right: 24, bottom: 3, left: 0 }}>
          <CartesianGrid vertical={false} stroke="#edf0f6" strokeDasharray="4 6" />
          <XAxis dataKey="name" tickLine={false} axisLine={false} tick={tick} />
          <YAxis domain={[0, 100]} tickLine={false} axisLine={false} tick={tick} />
          <Tooltip formatter={v => `${v}%`} />
          <Legend />
          {showMe && <Bar dataKey="mine" name="You" fill={ME} radius={[7, 7, 0, 0]} maxBarSize={34} />}
          <Bar dataKey="boys" name="Boys" fill={BOY} radius={[7, 7, 0, 0]} maxBarSize={34} />
          <Bar dataKey="girls" name="Girls" fill={GIRL} radius={[7, 7, 0, 0]} maxBarSize={34} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Reports panel: overall boys vs girls plus a breakdown by the level below. */
export function GenderPanel({ title, subtitle, split, rows }: {
  title: string; subtitle: string; split?: Split;
  rows: { name: string; gender?: Split }[];
}) {
  if (!split) return null;
  const grouped = rows.map(r => ({ name: r.name, boys: r.gender?.boys.average ?? null, girls: r.gender?.girls.average ?? null }));
  return (
    <section className="panel rp-panel">
      <div className="panel-head">
        <div><h3>{title}</h3><p>{subtitle}</p></div>
        <span className="rp-legend"><i style={{ background: BOY }} /> Boys <i style={{ background: GIRL }} /> Girls</span>
      </div>
      <PrivacyNote split={split} />
      <div className="rp-gender-grid">
        <GenderOverall split={split} label="Academic average" />
        <GenderGrouped rows={grouped} />
      </div>
      {split.unspecified ? <small className="rp-sub">{split.unspecified} student(s) have no gender recorded and are not in these charts.</small> : null}
    </section>
  );
}
