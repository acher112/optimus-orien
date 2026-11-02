<script setup lang="ts">
import { ref } from 'vue'

const faqs = [
  {
    question: 'Is Optimus Orien an LMS?',
    answer: '<p>No. Optimus Orien is primarily a School Performance Intelligence and Early Intervention platform. It focuses on understanding student, classroom, and school performance rather than delivering learning content.</p>'
  },
  {
    question: 'What grades does Optimus Orien support?',
    answer: '<p>Optimus Orien is designed for Grades 1–12.</p>'
  },
  {
    question: 'Who can use Optimus Orien?',
    answer: '<p>School owners, administrators, principals, teachers, students and parents can access role-specific portals.</p>'
  },
  {
    question: 'Does Optimus Orien replace the school\'s existing LMS or ERP?',
    answer: '<p>Optimus Orien can complement existing school systems by focusing specifically on performance intelligence, analysis and early intervention.</p>'
  },
  {
    question: 'What information can schools track?',
    answer: '<p>Depending on the school\'s configuration, Optimus Orien can organize academic marks, attendance, subject skills, classroom performance and longitudinal performance data.</p>'
  },
  {
    question: 'Can parents access student performance?',
    answer: '<p>Yes. The Parent Portal is designed to provide parents with relevant information about their child\'s academic performance, attendance, skills and progress.</p>'
  },
  {
    question: 'How does Optimus Orien identify students requiring attention?',
    answer: '<p>The platform analyzes configured performance indicators and patterns to help schools identify students who may require additional academic attention. It is a decision-support tool and does not replace professional educational judgment.</p>'
  },
  {
    question: 'How much does it cost?',
    answer: '<p>International subscriptions are priced at $3.60 per student per month.</p>'
  },
  {
    question: 'Is my school\'s data secure?',
    answer: '<p>Yes, data security and privacy are our top priorities. Optimus Orien employs enterprise-grade encryption, strict access controls, and regular security audits to ensure that all student and school data remains strictly confidential and fully compliant with educational data protection standards.</p>'
  },
  {
    question: 'Does Optimus Orien require special hardware or servers?',
    answer: '<p>No, Optimus Orien is completely cloud-based. Schools only need a web browser and an internet connection, eliminating the need for expensive on-premise servers or IT maintenance.</p>'
  },
  {
    question: 'How long does it take to implement Optimus Orien?',
    answer: '<p>The implementation timeline varies depending on the school\'s existing data infrastructure, but our streamlined onboarding process typically gets most schools up and running within a few weeks.</p>'
  },
  {
    question: 'Do you provide training for teachers and staff?',
    answer: '<p>Yes! We provide comprehensive onboarding sessions, extensive training materials, and ongoing dedicated customer support to ensure your entire staff feels confident using the platform.</p>'
  }
]

const activeIndices = ref<number[]>([])

const toggleFaq = (index: number) => {
  const i = activeIndices.value.indexOf(index)
  if (i > -1) {
    activeIndices.value.splice(i, 1)
  } else {
    activeIndices.value.push(index)
  }
}
</script>

<template>
  <section class="faq-section" id="faq">
    <div class="faq-container">
      <div class="faq-header">
        <h2>Frequently Asked Questions</h2>
      </div>
      
      <div class="faq-grid">
        <div 
          class="faq-item" 
          v-for="(faq, index) in faqs" 
          :key="index"
          :class="{ active: activeIndices.includes(index) }"
        >
          <button class="faq-question" @click="toggleFaq(index)" :aria-expanded="activeIndices.includes(index)">
            <span>{{ faq.question }}</span>
            <div class="faq-icon">
              <svg v-if="!activeIndices.includes(index)" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
              <svg v-else width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            </div>
          </button>
          
          <div class="faq-answer-wrapper" :style="{ maxHeight: activeIndices.includes(index) ? '1000px' : '0px' }">
            <div class="faq-answer" v-html="faq.answer"></div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.faq-section {
  padding: 8rem 2.5rem;
  background-color: #110d1e;
  color: #fff;
  width: 100%;
}

.faq-container {
  max-width: 1400px;
  margin: 0 auto;
}

.faq-header {
  text-align: center;
  margin-bottom: 5rem;
}

.faq-header h2 {
  font-size: 3rem;
  font-weight: 500;
  margin: 0;
  letter-spacing: -1px;
  color: #ffffff;
}

.faq-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1.5rem;
  align-items: flex-start;
}

@media (max-width: 1200px) {
  .faq-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 768px) {
  .faq-grid {
    grid-template-columns: 1fr;
  }
}

.faq-item {
  background-color: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  transition: all 0.3s ease;
}

.faq-item:hover {
  background-color: rgba(255, 255, 255, 0.04);
}

.faq-item.active {
  background-color: rgba(255, 255, 255, 0.05);
  border-color: rgba(111, 66, 193, 0.5);
  box-shadow: 0 10px 30px rgba(111, 66, 193, 0.1);
}

.faq-question {
  width: 100%;
  text-align: left;
  background: none;
  border: none;
  padding: 1.75rem;
  font-size: 1.15rem;
  font-weight: 500;
  color: #fff;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  cursor: pointer;
  line-height: 1.4;
  letter-spacing: -0.5px;
}

.faq-icon {
  flex-shrink: 0;
  color: #a8b2c1;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 0.1rem;
  transition: color 0.3s ease;
}

.faq-item:hover .faq-icon {
  color: #fff;
}

.faq-item.active .faq-icon {
  color: #9b51e0;
}

.faq-answer-wrapper {
  overflow: hidden;
  transition: max-height 0.4s cubic-bezier(0.25, 0.8, 0.25, 1);
}

.faq-answer {
  padding: 0 1.75rem 1.75rem 1.75rem;
  color: #94a3b8;
  font-size: 0.95rem;
  line-height: 1.7;
}

:deep(.faq-answer p) {
  margin-bottom: 1.25rem;
}

:deep(.faq-answer p:last-child) {
  margin-bottom: 0;
}

:deep(.faq-answer ul) {
  margin: 0 0 1.25rem 0;
  padding-left: 1.25rem;
}

:deep(.faq-answer li) {
  margin-bottom: 0.5rem;
}

:deep(.faq-answer a) {
  color: #a78bfa;
  text-decoration: none;
  font-weight: 500;
  transition: color 0.2s ease;
}

:deep(.faq-answer a:hover) {
  color: #c4b5fd;
  text-decoration: underline;
}
</style>
