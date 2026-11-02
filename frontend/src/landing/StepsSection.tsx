import React from 'react';
import TextParticleAnimation from './TextParticleAnimation';

interface StepsSectionProps {
  locale?: string;
}

export default function StepsSection({ locale = 'en' }: StepsSectionProps) {
  const isUrdu = locale === 'ur';

  const steps = isUrdu
    ? [
        {
          title: 'جمع کریں (Collect)',
          desc: 'سکول تعلیمی، حاضری، مہارت اور متعلقہ کارکردگی کا ڈیٹا درج کرتے ہیں۔',
        },
        {
          title: 'ترتیب دیں (Organize)',
          desc: 'آپٹیمس اورین معلومات کو طالب علم، مضمون، کلاس، استاد اور اسکول کے لحاظ سے ترتیب دیتا ہے۔',
        },
        {
          title: 'تجزیہ کریں (Analyze)',
          desc: 'پلیٹ فارم کارکردگی کے اشارے، موازنہ اور رجحانات کا حساب لگاتا ہے۔',
        },
        {
          title: 'شناخت کریں (Identify)',
          desc: 'اسکول ایسے طلباء کی شناخت کر سکتے ہیں جنہیں خصوصی توجہ کی ضرورت ہو سکتی ہے۔',
        },
        {
          title: 'اقدام کریں (Act)',
          desc: 'اساتذہ، منتظمین اور والدین بروقت مناسب اقدام کر سکتے ہیں۔',
        },
        {
          title: 'نگرانی کریں (Monitor)',
          desc: 'یہ سمجھنے کے لیے کارکردگی کا سراغ لگانا جاری رکھیں کہ آیا مداخلت سے فرق پڑ رہا ہے۔',
        },
      ]
    : [
        {
          title: 'Collect',
          desc: 'Schools enter academic, attendance, skills and relevant performance data.',
        },
        {
          title: 'Organize',
          desc: 'Optimus Orien structures the information by student, subject, class, teacher and school.',
        },
        {
          title: 'Analyze',
          desc: 'The platform calculates performance indicators, comparisons and trends.',
        },
        {
          title: 'Identify',
          desc: 'Schools can identify patterns and students who may require attention.',
        },
        {
          title: 'Act',
          desc: 'Teachers, administrators and parents can take appropriate action.',
        },
        {
          title: 'Monitor',
          desc: 'Continue tracking performance to understand whether intervention is making a difference.',
        },
      ];

  return (
    <section className="steps-section">
      <div className="steps-container">
        <div className="steps-content">
          <div className="steps-text-block">
            <h2>
              {isUrdu
                ? 'اسکولوں کے لیے سادہ۔ پس منظر میں طاقتور۔'
                : 'Simple for Schools. Powerful in the Background.'}
            </h2>

            <ol className="steps-list">
              {steps.map((step, idx) => (
                <li key={idx}>
                  <div className="step-content">
                    <h3>{step.title}</h3>
                    <p>{step.desc}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <div className="steps-image-block" style={{ position: 'relative' }}>
            <TextParticleAnimation />
          </div>
        </div>
      </div>
    </section>
  );
}
