import React from 'react';
import {
  GraduationCap,
  CalendarCheck,
  ClipboardCheck,
  BarChart3,
  AlertTriangle,
  TrendingUp,
} from 'lucide-react';

export interface CoreFeatureItem {
  id: number;
  title: string;
  description: string;
  icon_key: string;
  sort_order: number;
}

interface FeaturesSectionProps {
  features: CoreFeatureItem[];
  locale?: string;
}

const iconMap: Record<string, React.ReactNode> = {
  academic: <GraduationCap size={36} />,
  attendance: <CalendarCheck size={36} />,
  skills: <ClipboardCheck size={36} />,
  class: <BarChart3 size={36} />,
  risk: <AlertTriangle size={36} />,
  longitudinal: <TrendingUp size={36} />,
};

export default function FeaturesSection({ features }: FeaturesSectionProps) {
  // Fallback default features if loading or empty
  const defaultFeatures: CoreFeatureItem[] = [
    {
      id: 1,
      title: 'Academic Performance',
      description: 'Track student performance across subjects, assessments, terms, and academic years.',
      icon_key: 'academic',
      sort_order: 1,
    },
    {
      id: 2,
      title: 'Attendance Intelligence',
      description: 'Monitor attendance patterns and identify students whose attendance may require attention.',
      icon_key: 'attendance',
      sort_order: 2,
    },
    {
      id: 3,
      title: 'Skills Assessment',
      description: 'Record subject-specific skill ratings and monitor development beyond examination marks.',
      icon_key: 'skills',
      sort_order: 3,
    },
    {
      id: 4,
      title: 'Class Performance',
      description: 'Understand how each class is performing by comparing subject-level performance and class averages.',
      icon_key: 'class',
      sort_order: 4,
    },
    {
      id: 5,
      title: 'Student Risk Identification',
      description: 'Identify students whose combined performance indicators suggest that they may require additional support.',
      icon_key: 'risk',
      sort_order: 5,
    },
    {
      id: 6,
      title: 'Longitudinal Analysis',
      description: 'Track performance over time instead of looking at isolated examination results.',
      icon_key: 'longitudinal',
      sort_order: 6,
    },
  ];

  const items = features && features.length > 0 ? features : defaultFeatures;
  const heading = 'One Platform. One Performance Picture.';

  return (
    <section className="features-section">
      <div className="features-header">
        <h2>{heading}</h2>
      </div>

      <div className="features-grid">
        {items.map((f) => (
          <article key={f.id || f.title} className="feature-card">
            <div className="feature-icon-wrapper">
              {iconMap[f.icon_key] || <GraduationCap size={36} />}
            </div>
            <div className="feature-content">
              <h3>{f.title}</h3>
              <p>{f.description}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
