import React from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts';
import { TrendingUp } from 'lucide-react';

export interface DivisionTrendData {
  city: string;
  divisionName: string;
  campusesCount: number;
  academicSpi: number;
  dailyAttendance: number;
}

interface LongitudinalPerformanceTrendsProps {
  data?: DivisionTrendData[];
  title?: string;
  subtitle?: string;
  campuses?: any[];
}

const DEFAULT_DIVISIONS: DivisionTrendData[] = [
  {
    city: 'Chicago',
    divisionName: 'Chicago Division',
    campusesCount: 4,
    academicSpi: 77.5,
    dailyAttendance: 88.2,
  },
  {
    city: 'San Jose',
    divisionName: 'San Jose Division',
    campusesCount: 4,
    academicSpi: 77.2,
    dailyAttendance: 84.3,
  },
  {
    city: 'New York',
    divisionName: 'New York Division',
    campusesCount: 4,
    academicSpi: 77.1,
    dailyAttendance: 86.5,
  },
  {
    city: 'San Antonio',
    divisionName: 'San Antonio Division',
    campusesCount: 4,
    academicSpi: 77.1,
    dailyAttendance: 86.8,
  },
  {
    city: 'Philadelphia',
    divisionName: 'Philadelphia Division',
    campusesCount: 4,
    academicSpi: 77.0,
    dailyAttendance: 87.0,
  },
  {
    city: 'Dallas',
    divisionName: 'Dallas Division',
    campusesCount: 3,
    academicSpi: 76.8,
    dailyAttendance: 85.9,
  },
];

export const LongitudinalPerformanceTrends: React.FC<LongitudinalPerformanceTrendsProps> = ({
  data,
  title = 'LONGITUDINAL PERFORMANCE TRENDS',
  subtitle = 'ORGANIZATION-WIDE COMPARATIVE AVERAGES ACROSS METROPOLIS SECTORS',
  campuses,
}) => {
  // If campuses are provided and have at least 2 items, we can derive dynamic division data
  let displayData: DivisionTrendData[] = DEFAULT_DIVISIONS;
  if (data && data.length > 0) {
    displayData = data;
  } else if (campuses && campuses.length >= 2) {
    displayData = campuses.map((c: any) => {
      const spi = c.academic_average != null ? Number(c.academic_average) : (c.grade_alert_threshold ? Number(c.grade_alert_threshold) : 76.5);
      const att = c.attendance_rate != null ? Number(c.attendance_rate) : (c.attendance_alert_threshold ? Number(c.attendance_alert_threshold) : 85.0);
      return {
        city: c.city || c.name || 'Campus',
        divisionName: `${c.city || c.name} Division`,
        campusesCount: 1,
        academicSpi: spi,
        dailyAttendance: att,
      };
    });
  }

  const CustomBarTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const row = displayData.find(d => d.city === label) || displayData[0];
      const spiVal = payload.find((p: any) => p.dataKey === 'academicSpi')?.value ?? row.academicSpi;
      const attVal = payload.find((p: any) => p.dataKey === 'dailyAttendance')?.value ?? row.dailyAttendance;

      return (
        <div
          style={{
            background: '#ffffff',
            border: '1px solid #cbd5e1',
            borderRadius: 12,
            padding: '12px 18px',
            boxShadow: '0 10px 28px rgba(0, 0, 0, 0.1)',
            fontSize: 12,
            fontFamily: 'inherit',
            lineHeight: 1.5,
          }}
        >
          <div style={{ fontWeight: 800, fontSize: 13, color: '#0f172a', marginBottom: 6 }}>
            {label}
          </div>
          <div style={{ color: '#4338ca', fontWeight: 700 }}>
            Aggregate Academic SPI % : {Number(spiVal).toFixed(1)}
          </div>
          <div style={{ color: '#0284c7', fontWeight: 700 }}>
            Daily Attendance % : {Number(attVal).toFixed(1)}
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
        padding: '28px 32px',
        border: '1px solid #e2e8f0',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.02)',
        marginBottom: 24,
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <TrendingUp size={20} color="#4f46e5" />
          <h2
            style={{
              margin: 0,
              fontSize: 19,
              fontWeight: 900,
              fontStyle: 'italic',
              letterSpacing: '-0.3px',
              textTransform: 'uppercase',
              color: '#0f172a',
            }}
          >
            {title}
          </h2>
        </div>
        <p
          style={{
            margin: 0,
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: '0.8px',
            textTransform: 'uppercase',
            color: '#64748b',
          }}
        >
          {subtitle}
        </p>
      </div>

      <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 20 }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(320px, 1.4fr) minmax(280px, 1fr)',
            gap: 28,
            alignItems: 'start',
          }}
        >
          {/* Left Column: Bar Chart */}
          <div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: '0.8px',
                textTransform: 'uppercase',
                color: '#64748b',
                marginBottom: 16,
              }}
            >
              SPI PERFORMANCE INDEX BY CITY
            </div>

            <div style={{ width: '100%', height: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={displayData}
                  margin={{ top: 10, right: 10, left: -20, bottom: 5 }}
                  barGap={4}
                >
                  <XAxis
                    dataKey="city"
                    axisLine={{ stroke: '#cbd5e1' }}
                    tickLine={false}
                    tick={{ fill: '#64748b', fontSize: 11, fontWeight: 700 }}
                    dy={8}
                  />
                  <YAxis
                    domain={[0, 100]}
                    ticks={[0, 25, 50, 75, 100]}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 600 }}
                  />
                  <Tooltip content={<CustomBarTooltip />} />
                  <Bar
                    dataKey="academicSpi"
                    name="Aggregate Academic SPI %"
                    fill="#6366f1"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={28}
                  />
                  <Bar
                    dataKey="dailyAttendance"
                    name="Daily Attendance %"
                    fill="#0ea5e9"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={28}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Right Column: Standings List */}
          <div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: '0.8px',
                textTransform: 'uppercase',
                color: '#64748b',
                marginBottom: 16,
              }}
            >
              NATIONAL OPERATIONAL COMPLIANCE STANDINGS
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {displayData.slice(0, 5).map((divItem) => (
                <div
                  key={divItem.city}
                  style={{
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: 14,
                    padding: '12px 18px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 800,
                        color: '#0f172a',
                        letterSpacing: '-0.2px',
                      }}
                    >
                      {divItem.divisionName}
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: '0.6px',
                        textTransform: 'uppercase',
                        color: '#64748b',
                        marginTop: 2,
                      }}
                    >
                      {divItem.campusesCount} CAMPUSES GOVERNED
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 900,
                        color: '#0f172a',
                        letterSpacing: '-0.2px',
                      }}
                    >
                      {divItem.academicSpi.toFixed(1)}% Average SPI
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        fontWeight: 800,
                        letterSpacing: '0.5px',
                        textTransform: 'uppercase',
                        color: '#2563eb',
                        marginTop: 2,
                      }}
                    >
                      {divItem.dailyAttendance.toFixed(1)}% ATTENDANCE CONSISTENCY
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LongitudinalPerformanceTrends;
