import React, { useState } from 'react';
import { Shield, School, UserCheck, BookOpen, Heart } from 'lucide-react';

interface RolesSectionProps {
  locale: 'en' | 'ur';
}

type RoleKey = 'Admin' | 'Principal' | 'Teacher' | 'Student' | 'Parent';

interface RoleConfig {
  key: RoleKey;
  label: string;
  name: string;
  url: string;
  badge: string;
  image: string;
  icon: React.ReactNode;
}

export default function RolesSection({ locale }: RolesSectionProps) {
  const [activeRole, setActiveRole] = useState<RoleKey>('Admin');
  const isUr = locale === 'ur';

  const roles: RoleConfig[] = [
    {
      key: 'Admin',
      label: isUr ? 'کردار' : 'Role',
      name: isUr ? 'ایڈمن' : 'Admin',
      url: 'portal.optimus-orien.io/super_admin',
      badge: isUr ? 'کثیر کیمپس تنظیمی نگرانی' : 'Multi-Campus Executive Governance',
      image: '/images/dashboard-admin.png',
      icon: <Shield size={16} />,
    },
    {
      key: 'Principal',
      label: isUr ? 'کردار' : 'Role',
      name: isUr ? 'پرنسپل' : 'Principal',
      url: 'portal.optimus-orien.io/principal',
      badge: isUr ? 'کیمپس قیادت اور رجحانات کا جائزہ' : 'Campus Leadership & Trend Oversight',
      image: '/images/dashboard-principal.png',
      icon: <School size={16} />,
    },
    {
      key: 'Teacher',
      label: isUr ? 'کردار' : 'Role',
      name: isUr ? 'استاد' : 'Teacher',
      url: 'portal.optimus-orien.io/teacher',
      badge: isUr ? 'کلاس روم تجزیات اور قبل از وقت الرٹس' : 'Classroom Analytics & Early Alerts',
      image: '/images/dashboard-teacher.png',
      icon: <UserCheck size={16} />,
    },
    {
      key: 'Student',
      label: isUr ? 'کردار' : 'Role',
      name: isUr ? 'طالب علم' : 'Student',
      url: 'portal.optimus-orien.io/student',
      badge: isUr ? 'ذاتی تعلیمی پیش رفت اور رہنمائی' : 'Personal Progress & Reflection',
      image: '/images/dashboard-student.png',
      icon: <BookOpen size={16} />,
    },
    {
      key: 'Parent',
      label: isUr ? 'کردار' : 'Role',
      name: isUr ? 'والدین' : 'Parent',
      url: 'portal.optimus-orien.io/parent',
      badge: isUr ? 'بچے کی تعلیمی و حاضری کارکردگی' : 'Child Academic & Attendance Insights',
      image: '/images/dashboard-parent.png',
      icon: <Heart size={16} />,
    },
  ];

  const current = roles.find((r) => r.key === activeRole) || roles[0];

  return (
    <section id="platform" className="roles-section">
      <div className="roles-container">
        <div className="roles-header">
          <div className="roles-badge">
            <span>{isUr ? 'کردار پر مبنی تجربہ' : 'Role-Based Experiences'}</span>
          </div>
          <h2 className="roles-title">
            {isUr ? 'ایک پلیٹ فارم۔ مختلف زاویے۔' : 'One Platform. Multiple Perspectives.'}
          </h2>
          <p className="roles-desc">
            {isUr
              ? 'ہر اسٹیک ہولڈر کو اپنی ضرورت کے مطابق جامع معلومات حاصل ہوتی ہیں، اعلیٰ انتظامی نگرانی سے لے کر طالب علم کی روزانہ کی ترقی تک۔'
              : 'Every stakeholder sees exactly the intelligence they need from systemic executive oversight to daily student growth.'}
          </p>
        </div>

        {/* Roles Tab Navigation */}
        <div className="roles-tabs" role="tablist">
          {roles.map((r) => {
            const isActive = r.key === activeRole;
            return (
              <button
                key={r.key}
                type="button"
                className={`role-tab ${isActive ? 'active' : ''}`}
                onClick={() => setActiveRole(r.key)}
                role="tab"
                aria-selected={isActive}
              >
                <div className="tab-top">
                  {r.icon}
                  <span className="tab-label">{r.label}</span>
                </div>
                <div className="tab-name">{r.name}</div>
              </button>
            );
          })}
        </div>

        {/* Browser Mockup Window */}
        <div className="main-card">
          <div className="card-header">
            <div className="browser-controls">
              <div className="dot" />
              <div className="dot" />
              <div className="dot" />
              <span className="url-text">{current.url}</span>
            </div>
            <span className="header-badge">{current.badge}</span>
          </div>

          <div className="card-image-wrapper">
            <img
              src={current.image}
              alt={`${current.name} Dashboard Mockup`}
              className="full-dashboard-image"
              loading="lazy"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
