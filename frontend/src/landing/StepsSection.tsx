import React from 'react';
import TextParticleAnimation from './TextParticleAnimation';

interface StepsSectionProps {
  locale?: string;
}

export default function StepsSection() {
  const steps = [
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
      desc: 'Teachers and administrators can take appropriate action.',
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
            <h2>Simple for Schools. Powerful in the Background.</h2>

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
