<script setup lang="ts">
import TextParticleAnimation from './TextParticleAnimation.vue'
</script>

<template>
  <section class="steps-section">
    <div class="steps-container">
      <div class="steps-content">
        
        <div class="steps-text-block">
          <h2>Simple for Schools. Powerful in the Background.</h2>
          
          <ol class="steps-list">
            <li>
              <div class="step-content">
                <h3>Collect</h3>
                <p>Schools enter academic, attendance, skills and relevant performance data.</p>
              </div>
            </li>
            <li>
              <div class="step-content">
                <h3>Organize</h3>
                <p>Optimus Orien structures the information by student, subject, class, teacher and school.</p>
              </div>
            </li>
            <li>
              <div class="step-content">
                <h3>Analyze</h3>
                <p>The platform calculates performance indicators, comparisons and trends.</p>
              </div>
            </li>
            <li>
              <div class="step-content">
                <h3>Identify</h3>
                <p>Schools can identify patterns and students who may require attention.</p>
              </div>
            </li>
            <li>
              <div class="step-content">
                <h3>Act</h3>
                <p>Teachers, administrators and parents can take appropriate action.</p>
              </div>
            </li>
            <li>
              <div class="step-content">
                <h3>Monitor</h3>
                <p>Continue tracking performance to understand whether intervention is making a difference.</p>
              </div>
            </li>
          </ol>
        </div>
        
        <div class="steps-image-block" style="position: relative;">
          <TextParticleAnimation />
        </div>

      </div>
    </div>
  </section>
</template>

<style scoped>
.steps-section {
  padding: 3rem 2.5rem;
  width: 100%;
  max-width: 1400px;
  margin: 0 auto;
}

.steps-container {
  max-width: 1400px;
  margin: 0 auto;
}

.steps-content {
  display: flex;
  align-items: flex-start; /* Align to top so we can manually push the video down */
  justify-content: space-between;
  gap: 8rem;
}

@media (max-width: 991px) {
  .steps-content {
    flex-direction: column;
  }
}

.steps-text-block {
  flex: 1;
}

.steps-text-block h2 {
  font-size: 3.5rem;
  font-weight: 500;
  color: #1a1a2e;
  margin-bottom: 2rem;
  letter-spacing: -1.5px;
  line-height: 1.1;
  text-align: center;
}

.steps-list {
  list-style-type: none;
  counter-reset: steps-counter;
  padding: 0;
  margin: 0 0 1.5rem 0;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.steps-list li {
  position: relative;
  font-size: 1.25rem;
  font-weight: 600;
  color: #1a1a2e;
  padding-left: 4rem;
  display: flex;
  align-items: flex-start;
  min-height: 3rem;
}

.step-content h3 {
  font-size: 1.25rem;
  margin: 0 0 0.25rem 0;
  color: #1a1a2e;
}

.step-content p {
  font-size: 1rem;
  font-weight: 400;
  color: #6c757d;
  line-height: 1.5;
  margin: 0;
}

.steps-list li::before {
  counter-increment: steps-counter;
  content: counter(steps-counter);
  position: absolute;
  left: 0;
  top: -0.2rem;
  width: 3rem;
  height: 3rem;
  background-color: rgba(111, 66, 193, 0.1);
  color: #6f42c1;
  border-radius: 50%;
  display: flex;
  justify-content: center;
  align-items: center;
  font-size: 1.25rem;
  font-weight: 700;
}



.steps-image-block {
  flex: 1;
  margin-left: auto;
  margin-top: 16rem; /* Push the video further downward in position */
  display: flex;
  justify-content: flex-end;
  align-items: center;
  width: 100%;
  aspect-ratio: 16 / 11; /* Taller aspect ratio for a larger height */
  max-height: 550px; /* Allow it to grow much taller */
  overflow: visible;
  max-width: 850px;
}

.steps-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transform: scale(1.15); /* Aggressively zoom 15% to push baked-in black bars off the top/bottom */
  transition: transform 0.3s ease;
}

.steps-image:hover {
  transform: scale(1.18); /* Hover effect relative to new base scale */
}

@media (max-width: 991px) {
  .steps-text-block h2 {
    font-size: 2.75rem;
    margin-bottom: 2rem;
  }
  .steps-list li {
    font-size: 1.25rem;
  }
  .steps-image-block {
    margin-top: 2rem;
  }
}
</style>
