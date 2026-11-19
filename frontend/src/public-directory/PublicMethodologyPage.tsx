import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, ArrowLeft, BookOpen, CheckCircle, Scale, 
  Lock, RefreshCw, AlertCircle, HelpCircle, FileText, Home 
} from 'lucide-react';
import { MethodologyConfigData } from './publicDirectoryTypes';
import './publicDirectory.css';

interface MethodologyPageProps {
  onNavigate?: (path: string) => void;
  lang?: 'en' | 'ur';
}

export const PublicMethodologyPage: React.FC<MethodologyPageProps> = ({ 
  onNavigate, 
  lang = 'en' 
}) => {
  const isUrdu = lang === 'ur';
  const [data, setData] = useState<MethodologyConfigData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const fetchConfig = async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/v1/public/schools/methodology/');
        if (res.ok) {
          const json = await res.json();
          setData(json);
        }
      } catch (err) {
        console.error('Failed to load methodology config', err);
      } finally {
        setLoading(false);
      }
    };
    fetchConfig();
  }, []);

  const navigateTo = (path: string) => {
    if (onNavigate) {
      onNavigate(path);
    } else {
      window.location.href = path;
    }
  };

  const eligibility = data?.eligibility_criteria || {
    min_active_students: 15,
    min_published_assessments: 2,
    min_subjects_covered: 3,
    data_freshness_months: 12,
    enquiry_retention_days: 90
  };

  const bands = data?.bands || [
    { label: 'Outstanding', range: 'Score ≥ 85.0%' },
    { label: 'Strong', range: '70.0% ≤ Score < 85.0%' },
    { label: 'Steady', range: '50.0% ≤ Score < 70.0%' },
    { label: 'Developing', range: 'Score < 50.0%' },
  ];

  return (
    <div className={`pdir-page-container ${isUrdu ? 'rtl' : 'ltr'}`} style={{ minHeight: '100vh', background: '#f8fafc' }}>
      <div style={{ maxWidth: '960px', margin: '0 auto', padding: '36px 20px' }}>
        {/* Navigation */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
          <button 
            onClick={() => navigateTo('/')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: 'none',
              border: 'none',
              color: '#4f46e5',
              fontWeight: 600,
              fontSize: '0.92rem',
              cursor: 'pointer'
            }}
          >
            <Home size={15} />
            <span>{isUrdu ? 'ہوم' : 'Home'}</span>
          </button>
          <span style={{ color: '#cbd5e1' }}>/</span>
          <button 
            onClick={() => navigateTo('/schools')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: 'none',
              border: 'none',
              color: '#64748b',
              fontWeight: 600,
              fontSize: '0.92rem',
              cursor: 'pointer'
            }}
          >
            <ArrowLeft size={16} />
            <span>{isUrdu ? 'اسکول لیڈر بورڈ پر واپس' : 'Back to Leaderboard'}</span>
          </button>
        </div>

        {/* Hero Title */}
        <div style={{ background: '#ffffff', borderRadius: '24px', padding: '36px 32px', border: '1px solid #e2e8f0', marginBottom: '28px', boxShadow: '0 4px 20px rgba(0,0,0,0.03)' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: '#e0e7ff', color: '#4338ca', padding: '6px 14px', borderRadius: '100px', fontSize: '0.85rem', fontWeight: 700, marginBottom: '16px' }}>
            <ShieldCheck size={16} />
            <span>{isUrdu ? 'شفافیت اور دیانت کا منشور' : 'Honesty & Transparency Charter'}</span>
          </div>

          <h1 style={{ margin: '0 0 12px', fontSize: '2.1rem', fontWeight: 800, color: '#0f172a', lineHeight: 1.25 }}>
            {isUrdu ? 'آپٹیمس اورین تعلیمی طریقہ کار و درجہ بندی' : 'Optimus Orien Ranking Methodology & Academic Quality Index (AQI)'}
          </h1>

          <p style={{ margin: 0, fontSize: '1.05rem', color: '#475569', lineHeight: 1.6 }}>
            {isUrdu 
              ? 'ہم والدین، اساتذہ، اور منتظمین کو شفاف اور دیانت دارانہ تعلیمی معلومات فراہم کرنے کے پابند ہیں۔ یہ صفحہ بیان کرتا ہے کہ اسکولوں کی درجہ بندی کیسے ہوتی ہے اور ہمارے اصول کیا ہیں۔'
              : 'Our commitment to parents, school leaders, and students: complete algorithmic transparency, uncompromised student privacy, and objective measurement derived strictly from published academic examinations.'}
          </p>
        </div>

        {/* Section 1: Honesty Statement */}
        <div style={{ background: '#ffffff', borderRadius: '20px', padding: '32px', border: '1px solid #e2e8f0', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <FileText size={22} color="#4f46e5" />
            <h2 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800, color: '#0f172a' }}>
              {isUrdu ? 'دیانت کا بیان (Honesty Statement)' : 'What the Ranking Is — and What It Is Not'}
            </h2>
          </div>

          <div style={{ color: '#334155', fontSize: '0.98rem', lineHeight: 1.7, display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <p style={{ margin: 0 }}>
              {isUrdu
                ? 'آپٹیمس اورین کا تعلیمی معیار انڈیکس (AQI) ہر اسکول کے خود تصدیق شدہ اور شائع کردہ امتحانی نتائج سے اخذ کیا جاتا ہے۔'
                : 'The Academic Quality Index (AQI) published on this directory is calculated exclusively from verified, published academic examinations conducted by each participating institution through the Optimus Orien platform.'}
            </p>
            <div style={{ background: '#fffbeb', borderLeft: '4px solid #f59e0b', padding: '16px 20px', borderRadius: '0 12px 12px 0' }}>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                <AlertCircle size={20} color="#b45309" style={{ flexShrink: 0, marginTop: '2px' }} />
                <div style={{ fontSize: '0.92rem', color: '#78350f', lineHeight: 1.6 }}>
                  <strong>{isUrdu ? 'اہم وضاحت:' : 'Important Clarification:'} </strong>
                  {isUrdu 
                    ? 'یہ درجہ بندی کسی حکومتی معائنے یا مکمل تعلیمی معیار کی قانونی ضمانت نہیں۔ مختلف اسکولوں میں نصاب، داخلے کے معیارات اور طلبا کی سماجی پس منظر مختلف ہوتے ہیں۔ ہم کبھی کسی اسکول کو حتمی طور پر "بہترین" قرار نہیں دیتے بلکہ صرف آپٹیمس اورین پر بہترین کارکردگی کا مظاہرہ کرنے والے کیمپسز دکھاتے ہیں۔'
                    : 'This leaderboard is an academic comparative metric, NOT a comprehensive governmental inspection, regulatory accreditation, or qualitative guarantee. Student demographics, selective admissions, and curriculum variations significantly affect performance. We label this board "Top performing campuses on Optimus Orien" — never an absolute claim of the "best school".'}
                </div>
              </div>
            </div>
            <p style={{ margin: 0 }}>
              {isUrdu
                ? 'حاضری، انفرادی رویہ، استاد کی ذاتی کارکردگی، یا کسی بھی طالب علم کی نجی معلومات کبھی بھی عوامی ڈائریکٹری کا حصہ نہیں بنتی۔ صرف مجموعی اوسط نتائج ظاہر کیے جاتے ہیں۔'
                : 'Student attendance, behavioral disciplinary records, individual teacher appraisals, and identifiable student data are NEVER included in the public directory. Only aggregated, published academic performance is measured.'}
            </p>
          </div>
        </div>

        {/* Section 2: Eligibility Rules */}
        <div style={{ background: '#ffffff', borderRadius: '20px', padding: '32px', border: '1px solid #e2e8f0', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <CheckCircle size={22} color="#16a34a" />
            <h2 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800, color: '#0f172a' }}>
              {isUrdu ? 'درجہ بندی کی اہلیت کے اصول' : 'Campus Ranking Eligibility Thresholds'}
            </h2>
          </div>

          <p style={{ color: '#64748b', fontSize: '0.95rem', marginBottom: '20px' }}>
            {isUrdu 
              ? 'کسی بھی اسکول کو لیڈر بورڈ میں شامل ہونے کے لیے درج ذیل کم از کم شرائط پر پورا اترنا ضروری ہے تاکہ درجہ بندی قابل اعتماد اور مستند رہے:'
              : 'To prevent artificial distortion, small cohort skews, or stale data, a campus is eligible for a public numerical rank only if it satisfies all of the following platform criteria:'}
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
            <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '14px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#4f46e5', marginBottom: '4px' }}>
                ≥ {eligibility.min_active_students}
              </div>
              <strong style={{ fontSize: '0.9rem', color: '#0f172a', display: 'block', marginBottom: '4px' }}>
                {isUrdu ? 'فعال طلبا' : 'Active Students'}
              </strong>
              <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                {isUrdu ? 'کیمپس میں کم از کم اندراج' : 'Minimum active cohort size in evaluated terms'}
              </span>
            </div>

            <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '14px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#4f46e5', marginBottom: '4px' }}>
                ≥ {eligibility.min_published_assessments}
              </div>
              <strong style={{ fontSize: '0.9rem', color: '#0f172a', display: 'block', marginBottom: '4px' }}>
                {isUrdu ? 'شائع شدہ امتحانات' : 'Published Assessments'}
              </strong>
              <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                {isUrdu ? 'تعلیمی دورانیے کے باقاعدہ ٹیسٹ' : 'Formal exams finalized and published'}
              </span>
            </div>

            <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '14px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#4f46e5', marginBottom: '4px' }}>
                ≥ {eligibility.min_subjects_covered}
              </div>
              <strong style={{ fontSize: '0.9rem', color: '#0f172a', display: 'block', marginBottom: '4px' }}>
                {isUrdu ? 'مضامین کی شمولیت' : 'Core Subjects'}
              </strong>
              <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                {isUrdu ? 'متنوع مضامین میں جانچ' : 'Breadth across multiple distinct subject areas'}
              </span>
            </div>

            <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '14px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#4f46e5', marginBottom: '4px' }}>
                ≤ {eligibility.data_freshness_months} mo
              </div>
              <strong style={{ fontSize: '0.9rem', color: '#0f172a', display: 'block', marginBottom: '4px' }}>
                {isUrdu ? 'تازہ ترین ڈیٹا' : 'Data Freshness'}
              </strong>
              <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                {isUrdu ? 'نتائج پچھلے 12 ماہ کے دوران کے ہوں' : 'Published within the last 12 calendar months'}
              </span>
            </div>
          </div>

          <div style={{ marginTop: '16px', fontSize: '0.88rem', color: '#64748b' }}>
            {isUrdu 
              ? 'جو کیمپس ان شرائط کو پورا نہیں کرتے، وہ عوام کو نظر آ سکتے ہیں لیکن ان پر "Not ranked yet (not enough published data)" کا واضح لیبل لگایا جاتا ہے۔'
              : 'Campuses that have opted in but do not meet these thresholds display as "Not ranked yet (not enough published data)" and are excluded from competitive rank tables.'}
          </div>
        </div>

        {/* Section 3: Performance Bands & Constructive Neutrality */}
        <div style={{ background: '#ffffff', borderRadius: '20px', padding: '32px', border: '1px solid #e2e8f0', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <Scale size={22} color="#8b5cf6" />
            <h2 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800, color: '#0f172a' }}>
              {isUrdu ? 'مثبت کارکردگی کے درجات (Constructive Bands)' : 'Performance Bands & Developmental Labeling'}
            </h2>
          </div>

          <p style={{ color: '#475569', fontSize: '0.95rem', lineHeight: 1.6, marginBottom: '20px' }}>
            {isUrdu
              ? 'ہم تعلیمی وقار اور طلباء و اساتذہ کے احترام کے قائل ہیں۔ آپٹیمس اورین پر کبھی بھی توہین آمیز، منفی، یا سزا پر مبنی لیبل (جیسے "ناقص" یا "ناکام") استعمال نہیں کیے جاتے۔ اس کے بجائے تعمیری اصطلاحات استعمال ہوتی ہیں:'
              : 'Education is developmental, not punitive. Optimus Orien strictly prohibits pejorative, demoralizing, or deficit-based labels (such as "failing", "poor", or "needs support") on public directory pages. Instead, we use positive developmental bands:'}
          </p>

          <div style={{ border: '1px solid #e2e8f0', borderRadius: '14px', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: isUrdu ? 'right' : 'left' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  <th style={{ padding: '12px 18px', color: '#475569', fontSize: '0.85rem' }}>{isUrdu ? 'درجہ' : 'Performance Band'}</th>
                  <th style={{ padding: '12px 18px', color: '#475569', fontSize: '0.85rem' }}>{isUrdu ? 'اسکور کی حد' : 'Score Threshold'}</th>
                  <th style={{ padding: '12px 18px', color: '#475569', fontSize: '0.85rem' }}>{isUrdu ? 'وضاحت' : 'Pedagogical Meaning'}</th>
                </tr>
              </thead>
              <tbody>
                {bands.map((b, idx) => (
                  <tr key={idx} style={{ borderBottom: idx < bands.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                    <td style={{ padding: '14px 18px' }}>
                      <span className={`pdir-badge ${
                        b.label.toLowerCase() === 'outstanding' ? 'badge-band-outstanding' :
                        b.label.toLowerCase() === 'strong' ? 'badge-band-strong' :
                        b.label.toLowerCase() === 'steady' ? 'badge-band-steady' : 'badge-band-developing'
                      }`}>
                        {b.label}
                      </span>
                    </td>
                    <td style={{ padding: '14px 18px', fontWeight: 600, color: '#1e293b' }}>
                      {b.range}
                    </td>
                    <td style={{ padding: '14px 18px', color: '#64748b', fontSize: '0.88rem' }}>
                      {b.label === 'Outstanding' && (isUrdu ? 'غیر معمولی اور مثالی تعلیمی کارکردگی' : 'Exemplary mastery across cohort and curriculum')}
                      {b.label === 'Strong' && (isUrdu ? 'مضبوط تعلیمی بنیاد اور شاندار نتائج' : 'Robust learning outcomes above benchmark standards')}
                      {b.label === 'Steady' && (isUrdu ? 'مستحکم اور متوازن پیش رفت' : 'Consistent progress and solid foundational achievement')}
                      {b.label === 'Developing' && (isUrdu ? 'تعلیمی ترقی اور بہتری کے راستے پر گامزن' : 'Active instructional focus with room for academic expansion')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Section 4: Privacy & Anti-Scraping Charter */}
        <div style={{ background: '#ffffff', borderRadius: '20px', padding: '32px', border: '1px solid #e2e8f0', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <Lock size={22} color="#059669" />
            <h2 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800, color: '#0f172a' }}>
              {isUrdu ? 'پرنسپل اور رابطہ کی رازداری کا تحفظ' : 'Privacy Protection & Contact Security'}
            </h2>
          </div>

          <div style={{ color: '#334155', fontSize: '0.95rem', lineHeight: 1.7, display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <p style={{ margin: 0 }}>
              {isUrdu
                ? 'پرنسپل کا نام یا نجی رابطہ صرف اور صرف اس وقت ظاہر کیا جاتا ہے جب پرنسپل خود اپنے اکاؤنٹ سے واضح رضامندی دیں۔ رضامندی کا علیحدہ آڈٹ لاگ محفوظ رکھا جاتا ہے۔'
                : 'A principal’s personal name or direct communication details are displayed ONLY if that specific individual has authenticated and opted in from their personal administrative dashboard.'}
            </p>
            <p style={{ margin: 0 }}>
              {isUrdu
                ? 'اسپام اور خودکار روبوٹس سے بچاؤ کے لیے فون نمبر اور ای میل پیج سورس یا لسٹ API میں کبھی نہیں ہوتے۔ وہ ایک اینٹی بوٹ چیک اور شرح مقررہ (Rate-limited) کلک کے ذریعے محفوظ طریقے سے دکھائے جاتے ہیں۔'
                : 'To protect educational personnel from automated harvest bots, spam, and telemarketing, contact phone numbers and email addresses are NEVER rendered in raw HTML, JSON listing APIs, or sitemaps. They are secured behind a rate-limited cryptographic endpoint.'}
            </p>
            <p style={{ margin: 0 }}>
              {isUrdu
                ? 'والدین کی طرف سے بھیجی گئی معلومات (Enquiries) محفوظ رکھی جاتی ہیں اور 90 دن کے بعد خودکار طور پر مستقل حذف کر دی جاتی ہیں۔'
                : `Parent enquiries submitted via the platform are scoped exclusively to the target campus and are automatically purged from our databases after ${eligibility.enquiry_retention_days} days to uphold minimal data retention standards.`}
            </p>
          </div>
        </div>

        {/* Section 5: Removal & Corrections */}
        <div style={{ background: '#ffffff', borderRadius: '20px', padding: '32px', border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <HelpCircle size={22} color="#6366f1" />
            <h2 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800, color: '#0f172a' }}>
              {isUrdu ? 'فہرست سے اخراج یا تصحیح کی درخواست' : 'School Control & Discrepancy Reporting'}
            </h2>
          </div>

          <p style={{ color: '#475569', fontSize: '0.95rem', lineHeight: 1.6, margin: '0 0 16px' }}>
            {isUrdu
              ? 'ہر اسکول کا مالک یا منتظم کسی بھی وقت ایک کلک کے ساتھ اپنا کیمپس عوامی ڈائریکٹری سے ہٹا سکتا ہے۔ اخراج کا عمل فوری اور خودکار ہوتا ہے۔'
              : 'School autonomy is paramount. Any verified school owner or administrator may unpublish their campus instantly from their dashboard at any time with immediate public cache invalidation.'}
          </p>

          <p style={{ color: '#475569', fontSize: '0.95rem', lineHeight: 1.6, margin: 0 }}>
            {isUrdu
              ? 'اگر آپ کو کسی اسکول کے ڈیٹا یا بورڈ کی تفصیلات میں کوئی غلطی نظر آئے تو براہ کرم متعلقہ اسکول کے صفحے پر موجود "رپورٹ کریں" کا بٹن استعمال کریں یا ہماری ایڈمن ٹیم سے رابطہ کریں۔'
              : 'If you notice an inaccuracy in a school’s listed facilities, board affiliations, or geographical coordinates, please use the "Report a Discrepancy" button on the campus profile page to alert our platform governance queue.'}
          </p>
        </div>
      </div>
    </div>
  );
};
