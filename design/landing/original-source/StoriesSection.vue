<script setup lang="ts">
import { ref, computed } from 'vue'
import { openContactModal } from './store'
import SingleVortexAnimation from './SingleVortexAnimation.vue'

const activeIndex = ref(1)
const standardRegion = ref('International')

const stories = computed(() => [
  {
    isStandard: true,
    company: "Standard Tier",
    price: standardRegion.value === 'International' ? "$3.60" : "499 PKR",
    period: "per student / month",
    quote: "<strong style='font-size: 1.25rem; color: #111;'>Essential Performance Management</strong><ul style='margin-top: 0.75rem; margin-bottom: 0; padding-left: 1.2rem; font-size: 0.95rem; line-height: 1.4; font-weight: 500; color: #555; display: grid; grid-template-columns: 1fr 1fr; gap: 0.4rem 1rem;'><li>Student Profiles</li><li>Marks & Assessments</li><li>Attendance Tracking</li><li>Teacher Portal</li><li>Student Portal</li><li>Parent Portal</li><li>Principal Dashboard</li><li>Class & Subject Performance</li><li>Basic Reports</li><li>Performance Trends</li></ul>",
    accent: "#9b51e0"
  },
  {
    isStandard: false,
    company: "Premium Tier",
    price: standardRegion.value === 'International' ? "$7.20" : "999 PKR",
    period: "per student / month",
    quote: "<strong style='font-size: 1.25rem; color: #111;'>Advanced Performance Intelligence</strong><p style='margin: 0.25rem 0 0.5rem 0; font-size: 0.9rem; color: #555; font-style: italic;'>Everything in Standard, plus:</p><ul style='margin: 0; padding-left: 1.2rem; font-size: 0.95rem; line-height: 1.4; font-weight: 500; color: #555; display: grid; grid-template-columns: 1fr 1fr; gap: 0.4rem 1rem;'><li>Early Intervention System</li><li>Student Attention Indicators</li><li>Automated Alerts & Notifications</li><li>Academic Quality Index (AQI)</li><li>Advanced Analytics</li><li>5-Year Performance Analysis</li><li>Advanced Class Intelligence</li><li>Teacher Performance Insights</li><li>School & Branch Comparison</li><li>Organization-Wide Dashboard</li><li>Intervention Tracking</li><li>Advanced Reports</li></ul>",
    accent: "#9b51e0"
  }
])

const getCardStyle = (index: number) => {
  const n = stories.value.length;
  // Calculate shortest circular distance (-1 for left, 1 for right, 0 for center)
  let diff = (index - activeIndex.value) % n;
  if (diff > Math.floor(n / 2)) diff -= n;
  if (diff < -Math.floor(n / 2)) diff += n;

  let translateX = 0;
  let scale = 1;
  let opacity = 1;
  let zIndex = 10;
  let pointerEvents = 'auto';

  if (diff === 0) {
    translateX = 0;
    scale = 1;
    zIndex = 10;
    opacity = 1;
  } else if (diff === -1) {
    translateX = -15; // Shifts left by 15% of width
    scale = 0.9;
    zIndex = 5;
    opacity = 0.6;
  } else if (diff === 1) {
    translateX = 15; // Shifts right by 15% of width
    scale = 0.9;
    zIndex = 5;
    opacity = 0.6;
  } else {
    // Hidden cards if array > 3
    translateX = 0;
    scale = 0.8;
    zIndex = 1;
    opacity = 0;
    pointerEvents = 'none';
  }

  return {
    '--translate-x': `${translateX}%`,
    '--scale': scale,
    zIndex,
    opacity,
    pointerEvents,
    '--accent': stories.value[index]?.accent
  }
}

const handleInteraction = (index: number) => {
  activeIndex.value = index;
}
</script>

<template>
  <section class="stories-section" id="pricing">
    <div class="pricing-title-block">
      <SingleVortexAnimation color="#FFD400" :scale="0.9" />
      <div class="pricing-title-content">
        <h2 class="pricing-headline" style="white-space: nowrap;">Student-Based Pricing</h2>
                <p style="font-size: 1.2rem; color: #555;">Get one month complimentory access.
                <br>Experience the full platform with one month of free access and usage. No payment is required to get started, and there are no upfront costs or commitments during the trial period.</p>
      </div>
    </div>
    <div class="stories-carousel-container">
      <div 
        class="story-card" 
        v-for="(story, index) in stories" 
        :key="story.company"
        :class="{ 'is-active': activeIndex === index }"
        :style="getCardStyle(index)"
        :tabindex="activeIndex === index ? -1 : 0"
        @click="handleInteraction(index)"
        @keydown.enter="handleInteraction(index)"
        @keydown.space.prevent="handleInteraction(index)"
        role="button"
        :aria-label="`View story from ${story.company}`"
      >
        <div class="story-card-inner">
          <div style="margin-bottom: 2rem;">
            <span style="font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: var(--accent); font-size: 0.9rem; padding: 0.5rem 1rem; background: #f5f5f5; border-radius: 100px;">
              {{ story.company }}
            </span>
            <div class="pricing-price-row">
              <span class="pricing-amount">{{ story.price }}</span>
              <span class="pricing-period">{{ story.period }}</span>
            </div>
            
            <!-- Region Toggle -->
            <div style="margin-top: 1.5rem; display: flex; gap: 0.5rem; background: #f5f5f5; padding: 0.35rem; border-radius: 12px; width: fit-content; position: relative; z-index: 20;">
              <button 
                @click.stop="standardRegion = 'International'" 
                :style="standardRegion === 'International' ? 'background: #1a1a1a; box-shadow: 0 4px 12px rgba(0,0,0,0.15); color: white;' : 'background: transparent; color: #777;'"
                style="border: none; padding: 0.5rem 1.25rem; border-radius: 8px; font-weight: 600; font-size: 0.95rem; cursor: pointer; transition: all 0.2s ease;"
              >International</button>
              <button 
                @click.stop="standardRegion = 'Pakistan'" 
                :style="standardRegion === 'Pakistan' ? 'background: #1a1a1a; box-shadow: 0 4px 12px rgba(0,0,0,0.15); color: white;' : 'background: transparent; color: #777;'"
                style="border: none; padding: 0.5rem 1.25rem; border-radius: 8px; font-weight: 600; font-size: 0.95rem; cursor: pointer; transition: all 0.2s ease;"
              >Pakistan</button>
            </div>
          </div>
          
          <div class="story-quote">
            <div v-html="story.quote" style="font-size: 1.3rem; line-height: 1.5; color: #444; font-weight: 500; margin: 0;"></div>
          </div>
          
          <div class="story-bottom" style="flex-direction: column; align-items: stretch; justify-content: flex-end; gap: 1.5rem;">
            <button @click="openContactModal" style="padding: 1.25rem; width: 100%; border: none; background: #9b51e0; color: white; font-weight: 600; font-size: 1.1rem; border-radius: 12px; cursor: pointer; display: flex; justify-content: center; align-items: center; gap: 0.75rem; transition: transform 0.2s ease;">
              Request Access
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"></path><path d="m12 5 7 7-7 7"></path></svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.stories-section {
  padding: 8rem 0;
  background-color: #ffffff;
  overflow: hidden;
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 800px;
}

.stories-carousel-container {
  position: relative;
  flex: 1;
  max-width: 1300px;
  min-height: 680px;
}

.pricing-title-block {
  position: relative;
  text-align: center;
  margin-bottom: 2rem;
  padding: 2rem 0;
  flex: 1;
}

.pricing-title-content {
  position: relative;
  z-index: 1;
  padding: 0 1rem;
}

.pricing-headline {
  font-size: 3.5rem;
  font-weight: 800;
  letter-spacing: -1.5px;
  margin-bottom: 1rem;
  color: #9b51e0;
}

.pricing-subhead {
  font-size: 1.2rem;
  color: #555;
  margin: 0 auto;
  max-width: 600px;
}

.story-card {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 85%;
  max-width: 780px;
  min-height: 620px;
  background: #fff;
  border-radius: 8px;
  /* Use CSS variables defined in JS to handle position and scale seamlessly */
  transform: translate(calc(-50% + var(--translate-x, 0%)), -50%) scale(var(--scale, 1));
  transition: transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1),
              opacity 0.4s cubic-bezier(0.2, 0.8, 0.2, 1),
              box-shadow 0.4s cubic-bezier(0.2, 0.8, 0.2, 1);
  border-top: 4px solid var(--accent);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.05);
  cursor: pointer;
}

.story-card.is-active {
  box-shadow: 0 40px 100px -20px rgba(0, 0, 0, 0.15);
  cursor: default;
}

.story-card:focus-visible {
  outline: 3px solid var(--accent);
  outline-offset: 4px;
}

.story-card-inner {
  padding: 4rem;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 620px;
  opacity: 1;
  transition: opacity 0.3s ease;
  pointer-events: none;
}

.story-card.is-active .story-card-inner {
  transition-delay: 0.1s;
  pointer-events: auto;
}

.story-logo {
  height: 35px;
  margin-bottom: 2.5rem;
  display: flex;
  align-items: center;
}

.story-logo img {
  max-height: 100%;
  max-width: 140px;
  object-fit: contain;
}

.story-quote {
  flex-grow: 1;
  margin-bottom: 2rem;
}

.pricing-price-row {
  margin-top: 1.5rem; 
  display: flex; 
  align-items: flex-end; 
  gap: 0.5rem;
  flex-wrap: wrap;
}

.pricing-amount {
  font-size: 5rem; 
  font-weight: 800; 
  line-height: 0.9; 
  letter-spacing: -2px; 
  color: #111;
}

.pricing-period {
  font-size: 1.1rem; 
  color: #666; 
  font-weight: 500; 
  margin-bottom: 0.5rem;
}

.story-quote p {
  font-size: 1.75rem;
  line-height: 1.45;
  color: #2b3544;
  font-weight: 600;
  letter-spacing: -0.5px;
  margin: 0;
}

.story-bottom {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: auto;
}

.story-author {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.story-author img {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  object-fit: cover;
}

.author-name {
  font-weight: 500;
  color: #4a5568;
  font-size: 1.1rem;
  margin-bottom: 0.25rem;
}

.author-title {
  color: #94a3b8;
  font-size: 0.95rem;
}

.read-more-btn {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.75rem 1.5rem;
  border-radius: 50px;
  border: 1px solid #e2e8f0;
  color: var(--accent); 
  font-size: 0.95rem;
  font-weight: 600;
  text-decoration: none;
  background-color: transparent;
  transition: all 0.2s ease;
}

.read-more-btn:hover {
  background-color: #f8f9fe;
  border-color: #cbd5e1;
}

/* Stack cards vertically on mobile, matching PricingSection layout */
@media (max-width: 768px) {
  .stories-section {
    padding: 4rem 1.25rem;
    min-height: auto;
    flex-direction: column;
  }
  
  .pricing-title-block {
    width: 100%;
  }
  
  .pricing-headline {
    font-size: clamp(1.4rem, 6vw, 3rem);
    letter-spacing: -1px;
    white-space: normal;
  }

  .pricing-subhead {
    font-size: 1rem;
  }

  /* On mobile, turn the carousel container into a normal vertical stack */
  .stories-carousel-container {
    position: static;
    min-height: auto;
    height: auto;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    width: 100%;
    overflow: visible;
  }

  /* Remove all carousel positioning — cards just flow in document order */
  .story-card {
    position: static !important;
    top: auto !important;
    left: auto !important;
    transform: none !important;
    width: 100% !important;
    max-width: 100% !important;
    height: auto !important;
    min-height: auto !important;
    opacity: 1 !important;
    z-index: 1 !important;
    cursor: default !important;
    pointer-events: auto !important;
    box-shadow: 0 10px 30px rgba(0,0,0,0.05);
    border-radius: 24px;
    border: 1px solid #e5e5e5;
  }

  .story-card-inner {
    padding: 2rem 1.25rem;
    opacity: 1 !important;
    pointer-events: auto !important;
    min-height: auto !important;
    height: auto !important;
  }
  
  .pricing-amount {
    font-size: 3.5rem;
  }
  
  .pricing-period {
    font-size: 0.95rem;
  }
  
  .story-quote p {
    font-size: 1.25rem;
  }
  
  .story-bottom {
    flex-direction: column;
    align-items: stretch;
    gap: 1.5rem;
  }
}
</style>
