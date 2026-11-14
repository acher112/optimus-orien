import React from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts';

export interface TrajectoryPoint {
  year: string;
  avgScore: number;
}

interface PerformanceTrajectoryChartProps {
  data?: TrajectoryPoint[];
  title?: string;
  subtitle?: string;
  height?: number;
}

const DEFAULT_TRAJECTORY: TrajectoryPoint[] = [
  { year: '2021', avgScore: 65.4 },
  { year: '2022', avgScore: 69.1 },
  { year: '2023', avgScore: 68.16 },
  { year: '2024', avgScore: 78.4 },
  { year: '2025', avgScore: 74.2 },
];

export const PerformanceTrajectoryChart: React.FC<PerformanceTrajectoryChartProps> = ({
  data = DEFAULT_TRAJECTORY,
  title = '5-YEAR PERFORMANCE TRAJECTORY',
  subtitle = 'LONGITUDINAL SCORE CONSISTENCY',
  height = 280,
}) => {
  const chartData = data && data.length > 0 ? data : DEFAULT_TRAJECTORY;

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const val = payload[0].value;
      return (
        <div
          style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: 14,
            padding: '10px 16px',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.08)',
            fontSize: 12,
            fontFamily: 'inherit',
          }}
        >
          <div style={{ fontWeight: 800, color: '#1e293b', marginBottom: 2 }}>
            {label}
          </div>
          <div style={{ color: '#475569', fontWeight: 600 }}>
            avgScore : <span style={{ color: '#2563eb', fontWeight: 700 }}>{val}</span>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div
      style={{
        background: '#ffffff',
        borderRadius: 24,
        padding: '24px 28px',
        border: '1px solid #e2e8f0',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.02)',
      }}
    >
      <div style={{ marginBottom: 20 }}>
        <h3
          style={{
            margin: '0 0 4px 0',
            fontSize: 17,
            fontWeight: 900,
            fontStyle: 'italic',
            letterSpacing: '-0.3px',
            textTransform: 'uppercase',
            color: '#0f172a',
          }}
        >
          {title}
        </h3>
        <p
          style={{
            margin: 0,
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: '0.8px',
            textTransform: 'uppercase',
            color: '#64748b',
          }}
        >
          {subtitle}
        </p>
      </div>

      <div style={{ width: '100%', height }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={chartData}
            margin={{ top: 15, right: 20, left: -20, bottom: 5 }}
          >
            <defs>
              <linearGradient id="scoreTrajectoryGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.25} />
                <stop offset="90%" stopColor="#3b82f6" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="year"
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 600 }}
              dy={10}
            />
            <YAxis
              domain={[0, 100]}
              ticks={[0, 25, 50, 75, 100]}
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 600 }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="natural"
              dataKey="avgScore"
              stroke="#2563eb"
              strokeWidth={3}
              fill="url(#scoreTrajectoryGradient)"
              activeDot={{
                r: 6,
                fill: '#2563eb',
                stroke: '#ffffff',
                strokeWidth: 2,
              }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default PerformanceTrajectoryChart;
