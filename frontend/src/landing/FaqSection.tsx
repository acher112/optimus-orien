import React, { useState } from 'react';
import { Plus, Minus } from 'lucide-react';

export interface FaqItem {
  id: number;
  question: string;
  answer: string;
  category?: string;
  sort_order?: number;
}

interface FaqSectionProps {
  faqs: FaqItem[];
  locale: 'en' | 'ur';
}

export default function FaqSection({ faqs, locale }: FaqSectionProps) {
  const [activeIndices, setActiveIndices] = useState<number[]>([]);
  const isUr = locale === 'ur';

  const defaultFaqs: FaqItem[] = [
    {
      id: 1,
      question: isUr ? 'کیا آپٹیمس اورین ایک LMS ہے؟' : 'Is Optimus Orien an LMS?',
      answer: isUr
        ? '<p>نہیں، آپٹیمس اورین بنیادی طور پر سکول پرفارمنس انٹیلی جنس اور قبل از وقت رہنمائی کا پلیٹ فارم ہے۔ یہ صرف تعلیمی مواد فراہم کرنے کے بجائے طالب علم، کلاس اور سکول کی کارکردگی کے گہرے تجزیے پر توجہ مرکوز کرتا ہے۔</p>'
        : '<p>No. Optimus Orien is primarily a School Performance Intelligence and Early Intervention platform. It focuses on understanding student, classroom, and school performance rather than delivering learning content.</p>',
    },
    {
      id: 2,
      question: isUr ? 'آپٹیمس اورین کن کلاسوں کے لیے موزوں ہے؟' : 'What grades does Optimus Orien support?',
      answer: isUr
        ? '<p>آپٹیمس اورین گریڈ 1 تا 12 کے لیے ڈیزائن کیا گیا ہے۔</p>'
        : '<p>Optimus Orien is designed for Grades 1–12.</p>',
    },
    {
      id: 3,
      question: isUr ? 'آپٹیمس اورین کو کون استعمال کر سکتا ہے؟' : 'Who can use Optimus Orien?',
      answer: isUr
        ? '<p>سکول مالکان، ایڈمنسٹریٹر، پرنسپل، اساتذہ، طلباء اور والدین اپنے کردار کے مخصوص پورٹل تک رسائی حاصل کر سکتے ہیں۔</p>'
        : '<p>School owners, administrators, principals, teachers, students and parents can access role-specific portals.</p>',
    },
    {
      id: 4,
      question: isUr
        ? 'کیا آپٹیمس اورین سکول کے موجودہ LMS یا ERP کی جگہ لے لیتا ہے؟'
        : "Does Optimus Orien replace the school's existing LMS or ERP?",
      answer: isUr
        ? '<p>آپٹیمس اورین موجودہ نظاموں کے ساتھ مل کر کام کر سکتا ہے اور خاص طور پر کارکردگی کی ذہانت اور بروقت رہنمائی فراہم کرتا ہے۔</p>'
        : '<p>Optimus Orien can complement existing school systems by focusing specifically on performance intelligence, analysis and early intervention.</p>',
    },
    {
      id: 5,
      question: isUr ? 'سکول کس قسم کی معلومات کی نگرانی کر سکتے ہیں؟' : 'What information can schools track?',
      answer: isUr
        ? '<p>سکول کی ترتیبات کے مطابق، آپٹیمس اورین امتحانی نمبر، حاضری، مضامین کی مہارتیں، کلاس کارکردگی اور سال بہ سال ترقی کا ریکارڈ مرتب کرتا ہے۔</p>'
        : "<p>Depending on the school's configuration, Optimus Orien can organize academic marks, attendance, subject skills, classroom performance and longitudinal performance data.</p>",
    },
    {
      id: 6,
      question: isUr ? 'کیا والدین بچے کی کارکردگی دیکھ سکتے ہیں؟' : 'Can parents access student performance?',
      answer: isUr
        ? '<p>جی ہاں، پیرنٹ پورٹل والدین کو اپنے بچے کی تعلیمی کارکردگی، حاضری، مہارتوں اور پیش رفت سے باخبر رکھتا ہے۔</p>'
        : "<p>Yes. The Parent Portal is designed to provide parents with relevant information about their child's academic performance, attendance, skills and progress.</p>",
    },
    {
      id: 7,
      question: isUr
        ? 'آپٹیمس اورین توجہ طلب طلباء کی نشاندہی کیسے کرتا ہے؟'
        : 'How does Optimus Orien identify students requiring attention?',
      answer: isUr
        ? '<p>پلیٹ فارم طے شدہ کارکردگی کے اشاریوں اور رجحانات کا تجزیہ کر کے رہنمائی فراہم کرتا ہے، جو اساتذہ کے پیشہ ورانہ فیصلے میں مددگار ثابت ہوتا ہے۔</p>'
        : '<p>The platform analyzes configured performance indicators and patterns to help schools identify students who may require additional academic attention. It is a decision-support tool and does not replace professional educational judgment.</p>',
    },
    {
      id: 8,
      question: isUr ? 'اس کی فیس یا لاگت کیا ہے؟' : 'How much does it cost?',
      answer: isUr
        ? '<p>بین الاقوامی سبسکرپشن 3.60 ڈالر فی طالب علم ماہانہ، اور مقامی سبسکرپشن 499 پاکستانی روپے فی طالب علم ماہانہ ہے۔</p>'
        : '<p>International subscriptions are priced at $3.60 per student per month, and local subscriptions at 499 PKR per student per month.</p>',
    },
    {
      id: 9,
      question: isUr ? 'کیا ہمارے سکول کا ڈیٹا محفوظ ہے؟' : "Is my school's data secure?",
      answer: isUr
        ? '<p>جی ہاں، ڈیٹا کی حفاظت اور رازداری ہماری اولین ترجیح ہے۔ جدید ترین انکرپشن اور سخت رسائی کے قواعد کے ذریعے تمام ڈیٹا مکمل محفوظ رہتا ہے۔</p>'
        : '<p>Yes, data security and privacy are our top priorities. Optimus Orien employs enterprise-grade encryption, strict access controls, and regular security audits to ensure that all student and school data remains strictly confidential and fully compliant with educational data protection standards.</p>',
    },
    {
      id: 10,
      question: isUr ? 'کیا اس کے لیے مخصوص ہارڈویئر یا سرور درکار ہے؟' : 'Does Optimus Orien require special hardware or servers?',
      answer: isUr
        ? '<p>نہیں، یہ مکمل طور پر کلاؤڈ پر مبنی ہے۔ سکول کو صرف ایک انٹرنیٹ کنکشن اور ویب براؤزر کی ضرورت ہوتی ہے۔</p>'
        : '<p>No, Optimus Orien is completely cloud-based. Schools only need a web browser and an internet connection, eliminating the need for expensive on-premise servers or IT maintenance.</p>',
    },
    {
      id: 11,
      question: isUr ? 'سکول میں اسے نافذ کرنے میں کتنا وقت لگتا ہے؟' : 'How long does it take to implement Optimus Orien?',
      answer: isUr
        ? '<p>ہمارے آسان آن بورڈنگ عمل کے ذریعے عام طور پر سکول چند ہفتوں میں مکمل طور پر فعال ہو جاتے ہیں۔</p>'
        : "<p>The implementation timeline varies depending on the school's existing data infrastructure, but our streamlined onboarding process typically gets most schools up and running within a few weeks.</p>",
    },
    {
      id: 12,
      question: isUr ? 'کیا اساتذہ اور عملے کو تربیت دی جاتی ہے؟' : 'Do you provide training for teachers and staff?',
      answer: isUr
        ? '<p>جی ہاں! ہم آن بورڈنگ سیشنز، وضاحتی گائیڈز اور مستقل تکنیکی معاونت فراہم کرتے ہیں۔</p>'
        : '<p>Yes! We provide comprehensive onboarding sessions, extensive training materials, and ongoing dedicated customer support to ensure your entire staff feels confident using the platform.</p>',
    },
  ];

  const items = faqs && faqs.length > 0 ? faqs : defaultFaqs;

  const toggleFaq = (index: number) => {
    setActiveIndices((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]
    );
  };

  return (
    <section id="faq" className="faq-section">
      <div className="faq-container">
        <div className="faq-header">
          <h2>{isUr ? 'اکثر پوچھے گئے سوالات' : 'Frequently Asked Questions'}</h2>
        </div>

        <div className="faq-grid">
          {items.map((faq, index) => {
            const isOpen = activeIndices.includes(index);
            return (
              <div key={faq.id || index} className={`faq-item ${isOpen ? 'active' : ''}`}>
                <button
                  type="button"
                  className="faq-question"
                  onClick={() => toggleFaq(index)}
                  aria-expanded={isOpen}
                >
                  <span>{faq.question}</span>
                  <div className="faq-icon">
                    {isOpen ? <Minus size={18} /> : <Plus size={18} />}
                  </div>
                </button>

                <div
                  className="faq-answer-wrapper"
                  style={{ maxHeight: isOpen ? '1000px' : '0px' }}
                >
                  <div
                    className="faq-answer"
                    dangerouslySetInnerHTML={{ __html: faq.answer }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
