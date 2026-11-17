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
  locale?: string;
}

export default function FaqSection({ faqs }: FaqSectionProps) {
  const [activeIndices, setActiveIndices] = useState<number[]>([]);

  const defaultFaqs: FaqItem[] = [
    {
      id: 1,
      question: 'Is Optimus Orien an LMS?',
      answer: '<p>No. Optimus Orien is primarily a School Performance Intelligence and Early Intervention platform. It focuses on understanding student, classroom, and school performance rather than delivering learning content.</p>',
    },
    {
      id: 2,
      question: 'What grades does Optimus Orien support?',
      answer: '<p>Optimus Orien is designed for Grades 1–12.</p>',
    },
    {
      id: 3,
      question: 'Who can use Optimus Orien?',
      answer: '<p>School owners, administrators, principals, teachers, and students can access role-specific portals.</p>',
    },
    {
      id: 4,
      question: "Does Optimus Orien replace the school's existing LMS or ERP?",
      answer: '<p>Optimus Orien can complement existing school systems by focusing specifically on performance intelligence, analysis and early intervention.</p>',
    },
    {
      id: 5,
      question: 'What information can schools track?',
      answer: "<p>Depending on the school's configuration, Optimus Orien can organize academic marks, attendance, subject skills, classroom performance and longitudinal performance data.</p>",
    },
    {
      id: 7,
      question: 'How does Optimus Orien identify students requiring attention?',
      answer: '<p>The platform analyzes configured performance indicators and patterns to help schools identify students who may require additional academic attention. It is a decision-support tool and does not replace professional educational judgment.</p>',
    },
    {
      id: 8,
      question: 'How much does it cost?',
      answer: '<p>International subscriptions are priced at $3.60 per student per month, and local subscriptions at 499 PKR per student per month.</p>',
    },
    {
      id: 9,
      question: "Is my school's data secure?",
      answer: '<p>Yes, data security and privacy are our top priorities. Optimus Orien employs enterprise-grade encryption, strict access controls, and regular security audits to ensure that all student and school data remains strictly confidential and fully compliant with educational data protection standards.</p>',
    },
    {
      id: 10,
      question: 'Does Optimus Orien require special hardware or servers?',
      answer: '<p>No, Optimus Orien is completely cloud-based. Schools only need a web browser and an internet connection, eliminating the need for expensive on-premise servers or IT maintenance.</p>',
    },
    {
      id: 11,
      question: 'How long does it take to implement Optimus Orien?',
      answer: "<p>The implementation timeline varies depending on the school's existing data infrastructure, but our streamlined onboarding process typically gets most schools up and running within a few weeks.</p>",
    },
    {
      id: 12,
      question: 'Do you provide training for teachers and staff?',
      answer: '<p>Yes! We provide comprehensive onboarding sessions, extensive training materials, and ongoing dedicated customer support to ensure your entire staff feels confident using the platform.</p>',
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
          <h2>Frequently Asked Questions</h2>
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
