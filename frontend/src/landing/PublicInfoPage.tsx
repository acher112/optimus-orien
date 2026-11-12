import React, { useState, useEffect } from 'react';
import { navigate } from '../navigation';
import {
  ArrowLeft, ArrowRight, ShieldCheck, CheckCircle2,
  GraduationCap, CalendarCheck, ClipboardCheck, BarChart3,
  AlertTriangle, TrendingUp, Award, Building2, School,
  UserCheck, BookOpen, HeartHandshake, Mail, Phone, MapPin,
  Lock, FileText, Send, Sparkles, Check, HelpCircle
} from 'lucide-react';
import './landing.css';

interface PublicInfoPageProps {
  initialPath?: string;
  authenticated?: boolean;
}

interface PageData {
  title: string;
  subtitle: string;
  badge: string;
  category: 'Platform' | 'Portals' | 'Company' | 'Legal';
  icon: React.ReactNode;
  highlights: Array<{ title: string; desc: string; icon?: React.ReactNode }>;
  deepDive: Array<{ heading: string; body: string }>;
  ctaText?: string;
  ctaLink?: string;
}

export default function PublicInfoPage({ initialPath = '/about', authenticated = false }: PublicInfoPageProps) {
  const [currentPath, setCurrentPath] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.location.pathname || initialPath;
    }
    return initialPath;
  });

  const [locale, setLocale] = useState<'en' | 'ur'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('optimus_landing_locale');
      if (saved === 'ur' || saved === 'en') return saved;
    }
    return 'en';
  });

  const isUr = locale === 'ur';

  // Contact form state
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactSchool, setContactSchool] = useState('');
  const [contactRole, setContactRole] = useState('Principal / Head');
  const [contactPhone, setContactPhone] = useState('');
  const [contactStudents, setContactStudents] = useState('500');
  const [contactMessage, setContactMessage] = useState('');
  const [contactSubmitted, setContactSubmitted] = useState(false);

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname);
      window.scrollTo(0, 0);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigateTo = (path: string, e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    navigate(path);
    setCurrentPath(path);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleContactSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setContactSubmitted(true);
  };

  // Content Registry for all footer and navigation paths
  const getPageData = (path: string): PageData => {
    const normalized = path.toLowerCase().replace(/\/$/, '') || '/about';

    switch (normalized) {
      /* ─── PLATFORM PAGES ─── */
      case '/platform/academic-performance':
        return {
          category: 'Platform',
          title: isUr ? 'تعلیمی کارکردگی کی ذہین نگرانی' : 'Academic Performance Intelligence',
          subtitle: isUr
            ? 'امتحانات، ٹیسٹوں اور کلاس اسیسمنٹس کا کثیر جہتی تجزیاتی نظام۔'
            : 'Unify examination marks, continuous classroom assessments, grade normalization, and multi-curriculum metrics into a single real-time intelligence hub.',
          badge: isUr ? 'پلیٹ فارم ماڈیول' : 'Platform Capability',
          icon: <GraduationCap size={28} />,
          highlights: [
            {
              title: isUr ? 'کثیر نصابی معاونت' : 'Multi-Curriculum Alignment',
              desc: isUr
                ? 'کیمبرج، آکسفورڈ، فیڈرل بورڈ اور میٹرک کے لیے خودکار گریڈنگ فارمولے۔'
                : 'Native support for Cambridge O/A Levels, Oxford, Matriculation, FBISE, and custom institutional grading scales with percentile normalization.',
            },
            {
              title: isUr ? 'فوری مارکس انٹری' : 'Rapid Digital Marksheets',
              desc: isUr
                ? 'اساتذہ کے لیے آسان اور محفوظ مارکس شیٹس، جو منٹوں میں نتائج مرتب کرتی ہیں۔'
                : 'Frictionless mark entry interfaces for teachers with automated discrepancy checks, grade curve validation, and historical baseline matching.',
            },
            {
              title: isUr ? 'کلاس اور مضمون کا موازنہ' : 'Cross-Section Comparative Analytics',
              desc: isUr
                ? 'کیمپس کے تمام سیکشنز اور مضامین کے درمیان کارکردگی کے خلاء کی فوری نشاندہی۔'
                : 'Instantly benchmark parallel sections, subject faculties, and teacher cohorts to isolate systemic curriculum delivery gaps before term finals.',
            },
          ],
          deepDive: [
            {
              heading: 'Beyond Traditional Report Cards',
              body: 'Most school software simply prints PDF report cards at the end of the semester. Optimus Orien transforms academic marks into actionable longitudinal intelligence, showing each student’s velocity, subject vulnerability, and progression relative to their potential.',
            },
            {
              heading: 'Standardized Subject Weightings & Exam Governance',
              body: 'Configure weighting matrices across unit tests, monthly assessments, midterms, and finals with automated GPA and percentage calculations. Zero manual spreadsheet math required.',
            },
          ],
        };

      case '/platform/attendance':
        return {
          category: 'Platform',
          title: isUr ? 'ذہین حاضری کا نظام' : 'Attendance Intelligence & Retention Engine',
          subtitle: isUr
            ? 'بائیومیٹرک انضمام، غیر حاضری کی قبل از وقت پیشین گوئی اور فوری الرٹس۔'
            : 'Track daily presence, detect chronic absenteeism patterns before they affect grades, and notify parents automatically via real-time channels.',
          badge: isUr ? 'پلیٹ فارم ماڈیول' : 'Platform Capability',
          icon: <CalendarCheck size={28} />,
          highlights: [
            {
              title: isUr ? 'خودکار والدین کے الرٹس' : 'Instant Parent Notification',
              desc: isUr
                ? 'طلباء کی غیر حاضری یا تاخیر پر والدین کو فوری واٹس ایپ اور ایس ایم ایس پیغام۔'
                : 'Automated SMS and push notifications delivered the moment roll-call is finalized, closing parent-school communication gaps immediately.',
            },
            {
              title: isUr ? 'غیر حاضری کے رجحانات' : 'Chronic Absenteeism Forecaster',
              desc: isUr
                ? 'وہ طلباء جن کی حاضری تعلیمی خطرے کی حد کو چھو رہی ہو ان کی نشاندہی۔'
                : 'Our algorithm correlates attendance dips directly with upcoming examination drop-offs, flagging students whose attendance trends jeopardize their promotion.',
            },
            {
              title: isUr ? 'اسٹاف اور اساتذہ کی حاضری' : 'Biometric & Staff Integration',
              desc: isUr
                ? 'بائیومیٹرک مشینوں اور موبائل حاضری کا مربوط انتظام۔'
                : 'Seamless integration with campus biometric RFID terminals and teacher mobile roll-call with leave approval workflows.',
            },
          ],
          deepDive: [
            {
              heading: 'Why Attendance is the #1 Leading Indicator',
              body: 'Research shows that 83% of student dropouts and examination failures are preceded by an unnoticed 10% slide in attendance over a 6-week window. Optimus Orien detects this inflection point before the student falls behind in coursework.',
            },
            {
              heading: 'Institutional Compliance & Official Rosters',
              body: 'Generate government and inspection-ready attendance registers, leave summaries, and statutory compliance ledgers with a single click.',
            },
          ],
        };

      case '/platform/skills-assessment':
        return {
          category: 'Platform',
          title: isUr ? 'مہارتوں کا جامع جائزہ' : 'Holistic Skills & Competency Matrix',
          subtitle: isUr
            ? 'نمبروں سے آگے: تنقیدی سوچ، اخلاقیات اور 21ویں صدی کی صلاحیتوں کی پیمائش۔'
            : 'Evaluate 21st-century competencies, leadership, teamwork, and co-curricular milestones alongside pure academic scores.',
          badge: isUr ? 'پلیٹ فارم ماڈیول' : 'Platform Capability',
          icon: <ClipboardCheck size={28} />,
          highlights: [
            {
              title: isUr ? 'روبرک پر مبنی جائزے' : 'Custom Rubric Frameworks',
              desc: isUr
                ? 'اسکول کے اپنے معیار کے مطابق تیار کردہ اخلاقی اور عملی روبرکس۔'
                : 'Define institutional rubrics for verbal communication, analytical reasoning, collaborative problem-solving, and emotional intelligence.',
            },
            {
              title: isUr ? 'ہمہ جہت ترقی' : 'Co-Curricular Milestones',
              desc: isUr
                ? 'کھیلوں، تقریری مقابلوں اور سائنسی سرگرمیوں کا ڈیجیٹل ریکارڈ۔'
                : 'Record athletic badges, debate honors, community service hours, and STEM project accomplishments on an enduring digital learner portfolio.',
            },
            {
              title: isUr ? 'اساتذہ کے مشاہداتی نوٹس' : 'Behavioral Observation Logs',
              desc: isUr
                ? 'اساتذہ کے روزانہ مشاہدات جو طلباء کی رہنمائی میں مدد دیتے ہیں۔'
                : 'Structured qualitative observation logs that help school counselors and teachers track behavioral patterns without stigmatizing labels.',
            },
          ],
          deepDive: [
            {
              heading: 'Educating the Whole Child',
              body: 'Academic excellence is only half of an institutional mission. Optimus Orien provides teachers with a low-friction way to recognize character, grit, and interpersonal growth that parents deeply value.',
            },
          ],
        };

      case '/platform/class-intelligence':
        return {
          category: 'Platform',
          title: isUr ? 'کلاس روم انٹیلی جنس' : 'Classroom & Teacher Section Diagnostics',
          subtitle: isUr
            ? 'کلاس روم کی گہرائی، نصابی رفتار اور تعلیمی ہم آہنگی کی تفصیلی بصیرت۔'
            : 'Empower department heads and curriculum coordinators with section-by-section velocity, teacher workload metrics, and syllabus coverage audits.',
          badge: isUr ? 'پلیٹ فارم ماڈیول' : 'Platform Capability',
          icon: <BarChart3 size={28} />,
          highlights: [
            {
              title: isUr ? 'سلیبس کی رفتار' : 'Syllabus Pacing Audits',
              desc: isUr
                ? 'امتحانات سے قبل نصاب کی تکمیل کی خودکار نگرانی۔'
                : 'Real-time visibility into chapters covered vs academic calendar targets to eliminate end-of-term rushed lessons.',
            },
            {
              title: isUr ? 'اساتذہ کی تاثیر' : 'Teacher Efficacy Index',
              desc: isUr
                ? 'اساتذہ کی تدریسی نتائج کی شفاف اور مثبت عکاسی۔'
                : 'Identify top pedagogical practices across sections and offer peer support where class averages lag institutional standards.',
            },
            {
              title: isUr ? 'کلاس کی سطح کا موازنہ' : 'Section Parity Analytics',
              desc: isUr
                ? 'سیکشن A، B، C کے درمیان نمبروں اور حاضری کا منصفانہ موازنہ۔'
                : 'Ensure balanced academic rigor across all sections of a grade level, eliminating parent complaints of section bias.',
            },
          ],
          deepDive: [
            {
              heading: 'Eliminate Curriculum Blindspots',
              body: 'Principals cannot sit in every classroom every day. Optimus Orien provides an executive pulse of every section, alerting management when a class is falling behind syllabus targets 30 days before midterms.',
            },
          ],
        };

      case '/platform/early-intervention':
        return {
          category: 'Platform',
          title: isUr ? 'قبل از وقت رہنمائی کا نظام (EIS)' : 'Early Intervention System (EIS)',
          subtitle: isUr
            ? 'طلباء کے تعلیمی مسائل کا امتحانات سے 45 دن پہلے خودکار سراغ لگائیں۔'
            : 'Predictive risk scoring that alerts educators to learning regression weeks before term finals, converting failures into recovery stories.',
          badge: isUr ? 'پلیٹ فارم ماڈیول' : 'Core Innovation',
          icon: <AlertTriangle size={28} />,
          highlights: [
            {
              title: isUr ? '45 روزہ انتباہ' : '45-Day Advance Indicator',
              desc: isUr
                ? 'امتحانی ناکامی سے ہفتوں پہلے انتباہی سگنلز موصول کریں۔'
                : 'Multivariate indicators combining homework completion, attendance micro-slips, and quiz trends trigger proactive counselor alerts.',
            },
            {
              title: isUr ? 'رہنمائی کے ایکشن پلانز' : 'Intervention Action Workflows',
              desc: isUr
                ? 'مخصوص مضامین میں اضافی رہنمائی اور سرپرستوں کے ساتھ اشتراک۔'
                : 'Assign targeted remedial exercises, assign peer tutors, or book a 15-minute parent-teacher alignment check-in directly within the platform.',
            },
            {
              title: isUr ? 'ترقی کی مسلسل نگرانی' : 'Recovery Verification Tracking',
              desc: isUr
                ? 'دیکھیں کہ کیا کی گئی کوششوں سے طالب علم کے نتائج میں بہتری آئی۔'
                : 'Continuous re-evaluation verifies whether the intervention successfully restored the student to their baseline trajectory.',
            },
          ],
          deepDive: [
            {
              heading: 'Built Around Care, Not Labels',
              body: 'Traditional school systems wait for a student to fail an exam before taking notice—branding them with negative labels. Optimus Orien believes early identification is an act of care. We catch subtle learning dips when they are easiest to fix.',
            },
          ],
        };

      case '/platform/performance-trends':
        return {
          category: 'Platform',
          title: isUr ? 'طویل مدتی تعلیمی رجحانات' : 'Longitudinal Cohort & Performance Trends',
          subtitle: isUr
            ? '5 سالہ تعلیمی ارتقاء اور طلباء کے مجموعی گروہوں کا گہرا تجزیہ۔'
            : 'Multi-year student cohort tracking that visualizes learning velocity, subject retention, and institutional improvement across academic years.',
          badge: isUr ? 'پلیٹ فارم ماڈیول' : 'Platform Capability',
          icon: <TrendingUp size={28} />,
          highlights: [
            {
              title: isUr ? '5 سالہ تاریخی ٹریکنگ' : '5-Year Multi-Term Historical View',
              desc: isUr
                ? 'پرائمری سے سیکنڈری تک طالب علم کی مکمل تعلیمی تاریخ۔'
                : 'Follow student journeys seamlessly from Grade 1 through graduation without lost historical records or fragmented files.',
            },
            {
              title: isUr ? 'کوہورٹ موازنہ' : 'Class Cohort Benchmarks',
              desc: isUr
                ? 'پچھلے سال کے بیچ اور موجودہ سال کے بیچ کا تفصیلی موازنہ۔'
                : 'Determine whether teaching initiatives implemented this year yielded measurable percentile gains compared to historical graduating classes.',
            },
            {
              title: isUr ? 'کیرئیر اور مضامین کی رہنمائی' : 'Subject Aptitude Forecasting',
              desc: isUr
                ? 'سائنس، آرٹس یا کامرس کے انتخاب کے لیے معروضی رہنمائی۔'
                : 'Empower high school academic counselors with 3-year aptitude trajectories to guide college subject stream selections.',
            },
          ],
          deepDive: [
            {
              heading: 'Institutional Memory That Never Leaves',
              body: 'When senior teachers or administrators retire, their institutional knowledge often leaves with them. Optimus Orien preserves permanent longitudinal trends so your school continues to operate with deep context.',
            },
          ],
        };

      case '/platform/aqi':
        return {
          category: 'Platform',
          title: isUr ? 'تعلیمی معیار انڈیکس (AQI)' : 'Academic Quality Index (AQI)',
          subtitle: isUr
            ? 'اسکول کے مجموعی تعلیمی معیار، تدریس اور نظم و ضبط کا جامع پیمانہ۔'
            : 'Our proprietary institutional scorecard that benchmarks campus quality, student progress velocity, and faculty consistency into one clear metric.',
          badge: isUr ? 'پلیٹ فارم ماڈیول' : 'Executive Benchmark',
          icon: <Award size={28} />,
          highlights: [
            {
              title: isUr ? 'کیمپس اسکور کارڈ' : 'Campus Executive Scorecard',
              desc: isUr
                ? 'ٹرسٹی اور ایگزیکٹو بورڈ کے لیے سنگل اسکور میٹرک۔'
                : 'A scientifically weighted 0-100 composite index reflecting student mastery velocity, attendance integrity, and faculty pedagogical delivery.',
            },
            {
              title: isUr ? 'ملٹی کیمپس موازنہ' : 'Inter-Campus Benchmarking',
              desc: isUr
                ? 'مختلف شہروں یا برانچوں کے درمیان معیار کا مسابقتی جائزہ۔'
                : 'For multi-branch school networks: instantly understand which campuses require leadership intervention and which are setting gold standards.',
            },
            {
              title: isUr ? 'معائنہ اور ایکریڈیٹیشن کی تیاری' : 'Accreditation Readiness',
              desc: isUr
                ? 'تعلیمی بورڈز اور معائنہ ٹیموں کے لیے تصدیق شدہ اعداد و شمار۔'
                : 'Pre-formatted regulatory ledgers and quality audit reports ready for ISO, Cambridge, or Ministry inspections in seconds.',
            },
          ],
          deepDive: [
            {
              heading: 'Quantifying Institutional Excellence',
              body: 'How do you prove your school delivers better educational outcomes year after year? AQI gives boards, donors, and parents verified, data-backed proof of educational growth.',
            },
          ],
        };

      /* ─── PORTALS PAGES ─── */
      case '/portals/admin':
        return {
          category: 'Portals',
          title: isUr ? 'سپر ایڈمن اور ایگزیکٹو پورٹل' : 'Super Admin & Multi-Campus Governance',
          subtitle: isUr
            ? 'مالیات، فیس، عملے، کیمپسز اور سیکیورٹی کا مرکزی کنٹرول روم۔'
            : 'Full systemic command for institutional owners, trustees, and executive directors managing single or multi-campus educational enterprises.',
          badge: isUr ? 'رول پورٹل' : 'Executive Portal',
          icon: <Building2 size={28} />,
          highlights: [
            {
              title: isUr ? 'کثیر کیمپس تنظیمی انتظام' : 'Multi-Campus Federation',
              desc: isUr
                ? 'تمام برانچز کو ایک ہی اکاؤنٹ سے مانیٹر اور کنٹرول کریں۔'
                : 'Switch between campuses instantly, configure global academic calendars, and enforce uniform grading policies across your entire network.',
            },
            {
              title: isUr ? 'مالیاتی انتظام اور فیس' : 'Institutional Finance & Fees',
              desc: isUr
                ? 'فیس کی وصولی، واجبات، بینک انضمام اور تنخواہوں کی ادائیگی۔'
                : 'Automated 1-click fee challan generation, online gateway reconciliation, defaulter management, and employee payroll distribution.',
            },
            {
              title: isUr ? 'سخت سیکیورٹی اور اختیارات' : 'Granular Role-Based Access (RBAC)',
              desc: isUr
                ? 'پرنسپل، اکاؤنٹنٹ اور کلرک کے لیے الگ الگ اختیارات۔'
                : 'Enterprise permissions control exactly what each administrator, accountant, or coordinator can view or export.',
            },
          ],
          deepDive: [
            {
              heading: 'Executive Control Without Micromanagement',
              body: 'Owners and managing directors get real-time revenue collection graphs, student retention alerts, and staff attendance summaries on their phone or desktop anytime.',
            },
          ],
        };

      case '/portals/principal':
        return {
          category: 'Portals',
          title: isUr ? 'پرنسپل لیڈرشپ پورٹل' : 'Principal Leadership & Diagnostic Portal',
          subtitle: isUr
            ? 'کیمپس کی روزانہ کارکردگی، اساتذہ کا جائزہ اور تعلیمی معیار کی نگرانی۔'
            : 'Designed specifically for school principals and academic directors to oversee daily campus rhythm, class pacing, and student welfare.',
          badge: isUr ? 'رول پورٹل' : 'Leadership Portal',
          icon: <School size={28} />,
          highlights: [
            {
              title: isUr ? 'کیمپس ایگزیکٹو ڈیش بورڈ' : 'Morning Campus Health Briefing',
              desc: isUr
                ? 'صبح اسکول کھلتے ہی حاضری، تاخیر اور اہم الرٹس کی رپورٹ۔'
                : 'Immediate morning view of total student attendance, teacher absences requiring substitute coverage, and urgent risk alerts.',
            },
            {
              title: isUr ? 'تدریسی معائنہ اور فیڈ بیک' : 'Observation & Teacher Coaching',
              desc: isUr
                ? 'کلاس روم وزٹ کے نوٹس اور اساتذہ کی رہنمائی۔'
                : 'Record structured classroom observation notes and share formative pedagogical feedback with teachers securely.',
            },
            {
              title: isUr ? 'والدین اور کمیونٹی کے معاملات' : 'Parent Escalation History',
              desc: isUr
                ? 'طالب علم کے تمام ریکارڈز، ملاقاتوں اور نوٹس کی مکمل تاریخ۔'
                : 'Enter parent conferences equipped with the student’s complete 360-degree academic, behavioral, and attendance record.',
            },
          ],
          deepDive: [
            {
              heading: 'Empowering Educational Leadership',
              body: 'A great principal transforms a school when freed from repetitive paperwork. Optimus Orien automates routine data collation so principals can focus on instructional leadership.',
            },
          ],
        };

      case '/portals/teacher':
        return {
          category: 'Portals',
          title: isUr ? 'ٹیچر کلاس روم پورٹل' : 'Teacher Classroom Intelligence Hub',
          subtitle: isUr
            ? 'مارکس انٹری، روزانہ حاضری، ہوم ورک اور طلباء کی حوصلہ افزائی۔'
            : 'Frictionless, intuitive tools that save teachers 5+ hours every week on grading, attendance taking, and parent communication.',
          badge: isUr ? 'رول پورٹل' : 'Teacher Portal',
          icon: <UserCheck size={28} />,
          highlights: [
            {
              title: isUr ? 'تیز رفتار ڈیجیٹل رجسٹر' : '30-Second Roll Call',
              desc: isUr
                ? 'پورے سیکشن کی حاضری موبائل یا لیپ ٹاپ پر آدھے منٹ میں مکمل۔'
                : 'Tap to mark absences with one-click full-class presets, automatic late slip logging, and zero paperwork.',
            },
            {
              title: isUr ? 'ہموار امتحانی گریڈنگ' : 'Fast Gradebook & Weighting',
              desc: isUr
                ? 'مارکس داخل کرتے ہی کلاس اوسط اور فیڈ بیک خودکار تیار۔'
                : 'Quick keyboard mark entry with real-time class average recalculation, grade curves, and automated comments generator.',
            },
            {
              title: isUr ? 'طلباء کی انفرادی پیش رفت' : 'Student Insights at a Glance',
              desc: isUr
                ? 'ہر بچے کی خوبیوں اور کمزوریوں کا فوری خاکہ۔'
                : 'Instant indicators show which students struggled on past quizzes, ensuring tailored support during class discussions.',
            },
          ],
          deepDive: [
            {
              heading: 'Built With Teachers, For Teachers',
              body: 'Teachers love Optimus Orien because it respects their time. No convoluted menus or clunky legacy software—just fast, clean, responsive tools that make classroom management a joy.',
            },
          ],
        };

      case '/portals/student':
        return {
          category: 'Portals',
          title: isUr ? 'اسٹوڈنٹ گروتھ پورٹل' : 'Student Learning & Achievement Portal',
          subtitle: isUr
            ? 'طالب علم کا ذاتی ہوم ورک، امتحانی نتائج اور تعلیمی ترقی کا پورٹل۔'
            : 'A supportive, motivating personal hub where students track their learning progress, view assignment deadlines, and review teacher feedback.',
          badge: isUr ? 'رول پورٹل' : 'Student Portal',
          icon: <BookOpen size={28} />,
          highlights: [
            {
              title: isUr ? 'ڈیجیٹل رپورٹ کارڈز' : 'Transparent Assessment Results',
              desc: isUr
                ? 'امتحانی نتائج، گریڈز اور اساتذہ کے نوٹس کا فوری نظارہ۔'
                : 'Access certified report cards, subject breakdowns, and constructive teacher feedback from any device anytime.',
            },
            {
              title: isUr ? 'ہوم ورک اور ڈیٹ شیٹس' : 'Assignments & Exam Schedules',
              desc: isUr
                ? 'آئندہ ٹیسٹوں اور ہوم ورک کے اوقات کار کا واضح شیڈول۔'
                : 'Stay organized with clean assignment calendars, downloadable study guides, and exam timetable notifications.',
            },
            {
              title: isUr ? 'ذاتی ترقی کا احساس' : 'Self-Reflection & Milestones',
              desc: isUr
                ? 'نمبروں سے زیادہ سیکھنے اور آگے بڑھنے کا مثبت جذبہ۔'
                : 'Visual growth charts encourage students to measure progress against their own previous best, building lasting intrinsic motivation.',
            },
          ],
          deepDive: [
            {
              heading: 'Inspiring Ownership in Learning',
              body: 'When students have real-time visibility into their progress, they become active agents in their own education rather than passive test-takers.',
            },
          ],
        };

      /* ─── COMPANY & LEGAL PAGES ─── */
      case '/about':
        return {
          category: 'Company',
          title: isUr ? 'آپٹیمس اورین کے بارے میں' : 'About Optimus Orien',
          subtitle: isUr
            ? 'ہم اسکولوں کو اعداد و شمار کی طاقت سے بچوں کے مستقبل کو سنوارنے میں مدد دیتے ہیں۔'
            : 'School performance intelligence and early intervention built around care, not labels. Pioneering the future of educational administration and student flourishing.',
          badge: isUr ? 'ہمارا مشن' : 'Our Mission',
          icon: <Sparkles size={28} />,
          highlights: [
            {
              title: isUr ? 'نگہداشت پر مبنی فلسفہ' : 'Care, Not Labels',
              desc: isUr
                ? 'ہم بچوں کو ناکام ہونے کے بعد لیبل لگانے کے بجائے بروقت مدد فراہم کرتے ہیں۔'
                : 'We reject the practice of writing off struggling learners. Our algorithms exist to connect students with the right intervention at the right moment.',
            },
            {
              title: isUr ? 'تعلیمی کارکردگی کی ذہانت' : 'Unified Performance Picture',
              desc: isUr
                ? 'اسکول کے تمام شعبوں کو ایک شفاف پلیٹ فارم پر اکٹھا کرنا۔'
                : 'We dismantle the silos between admissions, daily attendance, examinations, and fee collections into a single coherent intelligence suite.',
            },
            {
              title: isUr ? 'ادارہ جاتی ڈیٹا کی خود مختاری' : 'Institutional Sovereignty',
              desc: isUr
                ? 'آپ کے اسکول کا ڈیٹا 100% آپ کی ملکیت ہے۔'
                : 'Schools retain complete ownership of their records. We do not sell student data, run advertisements, or commercialize institutional profiles.',
            },
          ],
          deepDive: [
            {
              heading: 'Why We Founded Optimus Orien',
              body: 'For decades, school management software focused entirely on administrative accounting and basic attendance sheets. Nobody built software dedicated to student learning trajectory and early intervention. Optimus Orien was created by educators and software engineers to bridge that crucial gap.',
            },
            {
              heading: 'Global Reach, Local Depth',
              body: 'Supporting multiple international and national curricula with dual-language capabilities (English & Urdu), Optimus Orien serves modern forward-thinking educational networks worldwide.',
            },
          ],
        };

      case '/privacy':
        return {
          category: 'Legal',
          title: isUr ? 'پرائیویسی پالیسی اور ڈیٹا پروٹیکشن' : 'Privacy Policy & Student Data Governance',
          subtitle: isUr
            ? 'تعلیمی ڈیٹا کی مکمل حفاظت، رازداری اور ادارہ جاتی خود مختاری کی ضمانت۔'
            : 'Optimus Orien operates under the strictest institutional data privacy standards, guaranteeing FERPA/COPPA alignment and uncompromising student privacy.',
          badge: isUr ? 'قانونی اور ضوابط' : 'Legal & Compliance',
          icon: <Lock size={28} />,
          highlights: [
            {
              title: isUr ? '100% اسکول کی ملکیت' : 'Complete Data Ownership',
              desc: isUr
                ? 'تمام طلباء اور اسکول کے ریکارڈز پر صرف اسکول کا قانونی حق ہے۔'
                : 'The educational institution remains the sole legal controller and owner of all student profiles, marks, financial ledgers, and institutional records.',
            },
            {
              title: isUr ? 'بینکنگ گریڈ سیکیورٹی' : 'AES-256 Encryption & TLS 1.3',
              desc: isUr
                ? 'تمام ڈیٹا محفوظ سرورز پر خفیہ کاری کے ساتھ محفوظ کیا جاتا ہے۔'
                : 'All database records are encrypted at rest with military-grade AES-256 and protected in transit with TLS 1.3 cryptographic protocols.',
            },
            {
              title: isUr ? 'کوئی اشتہارات نہیں' : 'Zero Commercial Tracking or Ads',
              desc: isUr
                ? 'ہم کبھی بھی طالب علم کا ڈیٹا مارکیٹنگ یا اشتہارات کے لیے استعمال نہیں کرتے۔'
                : 'We do not monetize, profile, sell, or license student information to third-party ad networks or commercial data aggregators. Ever.',
            },
          ],
          deepDive: [
            {
              heading: '1. Information We Process on Behalf of Institutions',
              body: 'Optimus Orien acts solely as a data processor for educational institutions. We process student demographic information, attendance tallies, examination grades, and contact details as explicitly authorized by school administration.',
            },
            {
              heading: '2. Role-Based Access Controls (RBAC)',
              body: 'Access to sensitive records is restricted strictly according to authorized institutional roles. Teachers only access their assigned classes; students only view their personal grades; parents only see their enrolled children.',
            },
            {
              heading: '3. Data Deletion and Export',
              body: 'Schools may export their complete structured database in standard formats (CSV, JSON, SQL) or request comprehensive permanent data purging at any time upon contract conclusion.',
            },
          ],
        };

      case '/terms':
        return {
          category: 'Legal',
          title: isUr ? 'استعمال کی شرائط اور لائسنس' : 'Terms of Service & Institutional License Agreement',
          subtitle: isUr
            ? 'آپٹیمس اورین سروس کے استعمال کے حقوق، ذمہ داریاں اور سروس لیول ایگریمنٹ۔'
            : 'Clear, transparent terms governing the provision of the Optimus Orien school intelligence cloud service, licensing tiers, and institutional commitments.',
          badge: isUr ? 'قانونی اور ضوابط' : 'Terms of Service',
          icon: <FileText size={28} />,
          highlights: [
            {
              title: isUr ? 'سروس کی دستیابی (SLA)' : '99.9% Cloud Uptime Guarantee',
              desc: isUr
                ? 'سال بھر بغیر کسی رکاوٹ کے تیز رفتار کلاؤڈ سروس کی فراہمی۔'
                : 'Enterprise cloud infrastructure guaranteed with automatic failover, geographic redundancy, and continuous uptime monitoring.',
            },
            {
              title: isUr ? 'منصفانہ اور شفاف قیمتیں' : 'Student-Tier Transparent Pricing',
              desc: isUr
                ? 'کوئی پوشیدہ فیس نہیں، صرف فعال طلباء کی بنیاد پر ماہانہ یا سالانہ چارجز۔'
                : 'Licenses are structured per enrolled student with complimentary 3-day full-feature trial periods and no required long-term lock-in.',
            },
            {
              title: isUr ? 'تکنیکی مدد اور تربیت' : 'Dedicated Institutional Support',
              desc: isUr
                ? 'ہر اسکول کے عملے اور اساتذہ کے لیے آن بورڈنگ اور مسلسل رہنمائی۔'
                : 'Every onboarding school receives administrator training, curriculum template configuration, and priority technical response channels.',
            },
          ],
          deepDive: [
            {
              heading: '1. Institutional Account Responsibility',
              body: 'The subscribing school agrees to maintain secure credentials and designate authorized administrators for user provisioning and permissions governance.',
            },
            {
              heading: '2. Intellectual Property Rights',
              body: 'Optimus Orien retains all proprietary rights, trademarks, algorithms, and software codebases. The institution retains full ownership of its raw institutional data and student records.',
            },
            {
              heading: '3. Subscription Renewal & Cancellation',
              body: 'Subscriptions renew according to the chosen billing cycle (monthly or annual). School administrations may cancel or upgrade their active tier at any time through the Billing Portal.',
            },
          ],
        };

      case '/contact':
      default:
        return {
          category: 'Company',
          title: isUr ? 'ہم سے رابطہ کریں' : 'Connect with Our Campus Advisory Team',
          subtitle: isUr
            ? 'اپنے اسکول میں جدید تعلیمی انٹیلی جنس لانے کے لیے ہمارے ماہرین سے مشورہ کریں۔'
            : 'Whether you want a personalized product walkthrough, multi-campus deployment advisory, or technical onboarding assistance, our team is ready to help.',
          badge: isUr ? 'رابطہ' : 'Direct Advisory',
          icon: <Phone size={28} />,
          highlights: [
            {
              title: isUr ? 'براہ راست ای میل' : 'Direct Email Support',
              desc: 'optimusorien@gmail.com — Guaranteed response within 4 business hours.',
              icon: <Mail size={22} />,
            },
            {
              title: isUr ? 'کیمپس آن بورڈنگ مشاورت' : 'Onboarding & Migration',
              desc: isUr
                ? 'پرانے ریکارڈز اور ایکسل فائلوں کو نئے سسٹم میں مفت منتقل کیا جاتا ہے۔'
                : 'Free data migration assistance from legacy spreadsheets or old school software into Optimus Orien.',
              icon: <Building2 size={22} />,
            },
            {
              title: isUr ? 'اعزازی 3 روزہ رسائی' : '3-Day Complimentary Trial',
              desc: isUr
                ? 'بغیر کسی ادائیگی کے پریمیم خصوصیات کا فوری تجربہ کریں۔'
                : 'Experience every module across your leadership team without any credit card or upfront financial commitment.',
              icon: <Award size={22} />,
            },
          ],
          deepDive: [
            {
              heading: 'Dedicated School Implementation Specialist',
              body: 'Every partner school is paired with a dedicated onboarding specialist who configures your academic terms, grading scales, fee voucher structures, and staff accounts.',
            },
          ],
        };
    }
  };

  const page = getPageData(currentPath);

  // List of related pages to explore
  const relatedLinks = [
    { name: 'Academic Performance', path: '/platform/academic-performance' },
    { name: 'Attendance Intelligence', path: '/platform/attendance' },
    { name: 'Early Intervention (EIS)', path: '/platform/early-intervention' },
    { name: 'Academic Quality Index (AQI)', path: '/platform/aqi' },
    { name: 'Super Admin Portal', path: '/portals/admin' },
    { name: 'Principal Portal', path: '/portals/principal' },
    { name: 'Teacher Portal', path: '/portals/teacher' },
    { name: 'Student Portal', path: '/portals/student' },
    { name: 'About Optimus Orien', path: '/about' },
    { name: 'Privacy Policy', path: '/privacy' },
    { name: 'Terms of Service', path: '/terms' },
    { name: 'Contact Campus Sales', path: '/contact' },
  ];

  return (
    <div className="landing-root" dir={isUr ? 'rtl' : 'ltr'}>
      {/* Top Universal Clean Header */}
      <header className="info-page-header">
        <div className="info-header-container">
          <div className="info-header-left">
            <button
              type="button"
              className="info-back-btn"
              onClick={(e) => navigateTo('/', e)}
              title={isUr ? 'ہوم پیج پر واپس جائیں' : 'Back to Home'}
              aria-label={isUr ? 'ہوم پیج پر واپس جائیں' : 'Back to Home'}
            >
              <ArrowLeft size={16} />
              <span className="info-back-text-full">{isUr ? 'ہوم پیج پر واپس جائیں' : 'Back to Home'}</span>
              <span className="info-back-text-short">{isUr ? 'ہوم' : 'Home'}</span>
            </button>
            <a href="/" className="info-brand-link" onClick={(e) => navigateTo('/', e)}>
              OPTIMUS ORIEN
            </a>
          </div>

          <div className="info-header-right">
            <button
              type="button"
              className="btn-info-locale"
              onClick={() => {
                const next = isUr ? 'en' : 'ur';
                setLocale(next);
                localStorage.setItem('optimus_landing_locale', next);
                document.documentElement.dir = next === 'ur' ? 'rtl' : 'ltr';
                document.documentElement.lang = next;
              }}
            >
              {isUr ? 'English' : 'اردو'}
            </button>
            {authenticated ? (
              <a
                href="/app"
                className="btn-nav-dashboard info-dashboard-btn"
                onClick={(e) => navigateTo('/app', e)}
              >
                <span className="info-dashboard-text-full">{isUr ? 'ڈیش بورڈ پر جائیں' : 'Go to dashboard'}</span>
                <span className="info-dashboard-text-short">{isUr ? 'ڈیش بورڈ' : 'Dashboard'}</span>
              </a>
            ) : (
              <>
                <a
                  href="/login"
                  className="btn-nav-signin info-signin-btn"
                  onClick={(e) => navigateTo('/login', e)}
                >
                  {isUr ? 'لاگ ان' : 'Sign in'}
                </a>
                <a
                  href="/login?tab=register"
                  className="btn-nav-register info-register-btn"
                  onClick={(e) => navigateTo('/login?tab=register', e)}
                >
                  <span className="info-register-text-full">{isUr ? 'اسکول رجسٹر کریں' : 'Register your school'}</span>
                  <span className="info-register-text-short">{isUr ? 'رجسٹر' : 'Register'}</span>
                </a>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Main Page Container */}
      <main className="info-page-body">
        {/* Breadcrumb Bar */}
        <div className="info-breadcrumbs">
          <span className="crumb-item" onClick={(e) => navigateTo('/', e)}>Home</span>
          <span className="crumb-sep">/</span>
          <span className="crumb-item">{page.category}</span>
          <span className="crumb-sep">/</span>
          <span className="crumb-active">{page.title}</span>
        </div>

        {/* Hero Section */}
        <section className="info-hero-section">
          <div className="info-badge-chip">
            {page.icon}
            <span>{page.badge}</span>
          </div>
          <h1 className="info-page-title">{page.title}</h1>
          <p className="info-page-subtitle">{page.subtitle}</p>

          <div className="info-hero-actions">
            <a
              href="/login?tab=register"
              className="btn-hero-primary"
              onClick={(e) => navigateTo('/login?tab=register', e)}
            >
              <span>{isUr ? '3 روزہ اعزازی رسائی شروع کریں' : 'Start 3-Day Free Trial'}</span>
              <ArrowRight size={18} />
            </a>
            <button
              type="button"
              className="btn-hero-secondary"
              onClick={(e) => navigateTo('/contact', e)}
            >
              <Phone size={16} />
              <span>{isUr ? 'ایجوکیشن ٹیم سے رابطہ کریں' : 'Speak with an Advisor'}</span>
            </button>
          </div>
        </section>

        {/* Highlights 3-Card Grid */}
        <section className="info-highlights-grid">
          {page.highlights.map((h, idx) => (
            <div key={idx} className="info-highlight-card">
              <div className="highlight-icon-box">
                {h.icon || <CheckCircle2 size={24} color="#9b51e0" />}
              </div>
              <h3 className="highlight-title">{h.title}</h3>
              <p className="highlight-desc">{h.desc}</p>
            </div>
          ))}
        </section>

        {/* Deep Dive Narrative Section */}
        <section className="info-narrative-section">
          <div className="narrative-content-card">
            {page.deepDive.map((d, idx) => (
              <div key={idx} className="narrative-block">
                <h2 className="narrative-heading">{d.heading}</h2>
                <p className="narrative-body">{d.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Contact Form Section (Highlighted if on /contact page) */}
        {currentPath.includes('/contact') && (
          <section className="info-contact-form-section">
            <div className="contact-form-card">
              <div className="contact-form-header">
                <h2>{isUr ? 'اسکول کی رجسٹریشن اور مشاورت فارم' : 'Schedule a Walkthrough or Request Access'}</h2>
                <p>
                  {isUr
                    ? 'فارم پُر کریں، ہماری ٹیم 4 گھنٹوں کے اندر آپ سے رابطہ کرے گی۔'
                    : 'Fill out this brief form and our institutional deployment specialist will get back to you within 4 business hours.'}
                </p>
              </div>

              {contactSubmitted ? (
                <div className="contact-success-banner">
                  <CheckCircle2 size={40} color="#08CB00" />
                  <div>
                    <h3>{isUr ? 'درخواست موصول ہو گئی ہے!' : 'Inquiry Received Successfully!'}</h3>
                    <p>
                      {isUr
                        ? 'ہمارا مشیر جلد آپ کے اسکول سے رابطہ کرے گا۔ شکریہ!'
                        : 'Thank you for reaching out. An Optimus Orien campus advisor will contact you shortly with credentials.'}
                    </p>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleContactSubmit} className="contact-actual-form">
                  <div className="form-row-2col">
                    <div className="form-group">
                      <label>{isUr ? 'آپ کا مکمل نام' : 'Your Full Name'}</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Dr. Sarah Jenkins"
                        value={contactName}
                        onChange={(e) => setContactName(e.target.value)}
                      />
                    </div>
                    <div className="form-group">
                      <label>{isUr ? 'سرکاری / اسکول کا ای میل' : 'Official / Work Email'}</label>
                      <input
                        type="email"
                        required
                        placeholder="sarah@springfieldschool.edu"
                        value={contactEmail}
                        onChange={(e) => setContactEmail(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="form-row-2col">
                    <div className="form-group">
                      <label>{isUr ? 'اسکول یا تعلیمی نیٹ ورک کا نام' : 'Institution / Network Name'}</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Beaconhouse Grammar Network"
                        value={contactSchool}
                        onChange={(e) => setContactSchool(e.target.value)}
                      />
                    </div>
                    <div className="form-group">
                      <label>{isUr ? 'آپ کا کردار' : 'Your Role'}</label>
                      <select
                        value={contactRole}
                        onChange={(e) => setContactRole(e.target.value)}
                      >
                        <option value="School Owner / Trustee">School Owner / Trustee</option>
                        <option value="Principal / Campus Head">Principal / Campus Head</option>
                        <option value="Academic Director">Academic Director</option>
                        <option value="IT Administrator">IT Administrator</option>
                        <option value="Head Teacher">Head Teacher</option>
                      </select>
                    </div>
                  </div>

                  <div className="form-row-2col">
                    <div className="form-group">
                      <label>{isUr ? 'فون نمبر / واٹس ایپ' : 'Phone / WhatsApp Number'}</label>
                      <input
                        type="tel"
                        required
                        placeholder="+92 300 1234567"
                        value={contactPhone}
                        onChange={(e) => setContactPhone(e.target.value)}
                      />
                    </div>
                    <div className="form-group">
                      <label>{isUr ? 'طلباء کی متوقع تعداد' : 'Approximate Student Body'}</label>
                      <select
                        value={contactStudents}
                        onChange={(e) => setContactStudents(e.target.value)}
                      >
                        <option value="100-300">100 - 300 Students</option>
                        <option value="300-800">300 - 800 Students</option>
                        <option value="800-2500">800 - 2,500 Students</option>
                        <option value="2500+">2,500+ Students (Multi-Campus Network)</option>
                      </select>
                    </div>
                  </div>

                  <div className="form-group">
                    <label>{isUr ? 'آپ کی ضروریات یا سوالات' : 'How can we help your institution?'}</label>
                    <textarea
                      rows={3}
                      placeholder="Tell us about your current challenges (e.g. marks entry, early intervention, parent communication)..."
                      value={contactMessage}
                      onChange={(e) => setContactMessage(e.target.value)}
                    />
                  </div>

                  <button type="submit" className="btn-contact-submit">
                    <Send size={18} />
                    <span>{isUr ? 'درخواست جمع کرائیں' : 'Submit Institutional Inquiry'}</span>
                  </button>
                </form>
              )}
            </div>
          </section>
        )}

        {/* Directory of Related Platform & Portal Pages */}
        <section className="info-directory-section">
          <div className="directory-header">
            <h3>{isUr ? 'دیگر پلیٹ فارم اور پورٹل ماڈیولز دریافت کریں' : 'Explore Platform Capabilities & Roles'}</h3>
            <p>{isUr ? 'کسی بھی عنوان پر کلک کر کے اس کی تفصیلات دیکھیں:' : 'Click any link to read detailed specifications:'}</p>
          </div>
          <div className="directory-links-grid">
            {relatedLinks.map((r, idx) => {
              const isCurrent = r.path === currentPath;
              return (
                <button
                  key={idx}
                  type="button"
                  className={`dir-link-item ${isCurrent ? 'active' : ''}`}
                  onClick={(e) => navigateTo(r.path, e)}
                >
                  <span>{r.name}</span>
                  <ArrowRight size={14} />
                </button>
              );
            })}
          </div>
        </section>

        {/* Bottom Banner */}
        <section className="info-bottom-banner">
          <h2>
            {isUr
              ? 'اپنے اسکول کو کارکردگی انٹیلی جنس کے ساتھ بااختیار بنائیں۔'
              : 'Empower Your School With True Performance Intelligence.'}
          </h2>
          <p>
            {isUr
              ? '3 روزہ اعزازی رسائی کے ساتھ تمام پریمیم خصوصیات کا تجربہ کریں۔'
              : 'Join forward-thinking institutions using Optimus Orien to turn academic data into student growth.'}
          </p>
          <div className="banner-actions">
            <a
              href="/login?tab=register"
              className="btn-banner-primary"
              onClick={(e) => navigateTo('/login?tab=register', e)}
            >
              {isUr ? 'اپنا اسکول رجسٹر کریں' : 'Register Your School Today'}
            </a>
            <button
              type="button"
              className="btn-banner-secondary"
              onClick={(e) => navigateTo('/', e)}
            >
              {isUr ? 'مرکزی صفحہ پر جائیں' : 'Return to Landing Page'}
            </button>
          </div>
        </section>
      </main>

      {/* Unified Footer */}
      <footer className="info-page-footer">
        <div className="info-footer-container">
          <div className="footer-left">
            <span className="footer-brand-tag">OPTIMUS ORIEN</span>
            <span className="footer-tagline">Built around care, not labels.</span>
          </div>
          <div className="footer-right">
            <span>© 2026 Optimus Orien. All rights reserved.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
