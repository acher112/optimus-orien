<script setup lang="ts">
import { ref, computed } from 'vue'
import { openContactModal } from './store'

const studentCountStandard = ref(50)
const studentCountPremium = ref(50)
const isPKRStandard = ref(false)
const isPKRPremium = ref(false)

const standardPkrPerStudent = 499
const standardUsdPerStudent = 3.60  

const premiumPkrPerStudent = 999
const premiumUsdPerStudent = 7.20  

const displayStandardPrice = computed(() => isPKRStandard.value ? `${standardPkrPerStudent} PKR` : `$${standardUsdPerStudent.toFixed(2)}`)
const displayPremiumPrice = computed(() => isPKRPremium.value ? `${premiumPkrPerStudent} PKR` : `$${premiumUsdPerStudent.toFixed(2)}`)

const formattedStandardTotal = computed(() => {
  if (isPKRStandard.value) {
    const total = studentCountStandard.value * standardPkrPerStudent
    return `PKR ${total.toLocaleString()}`
  } else {
    const total = studentCountStandard.value * standardUsdPerStudent
    return `$${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }
})

const formattedPremiumTotal = computed(() => {
  if (isPKRPremium.value) {
    const total = studentCountPremium.value * premiumPkrPerStudent
    return `PKR ${total.toLocaleString()}`
  } else {
    const total = studentCountPremium.value * premiumUsdPerStudent
    return `$${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }
})


</script>

<template>
  <section class="pricing-section" id="pricing">
    <div class="pricing-container">

        <div class="pricing-grid">
          
          <div class="pricing-card">
            <div class="pricing-info">
              <span class="plan-label">Standard Tier</span>

              <!-- iPhone-style Currency Toggle -->
              <div class="currency-toggle-wrapper">
                <span class="toggle-label" :class="{ active: !isPKRStandard }">USD</span>
                <button
                  class="ios-toggle"
                  :class="{ 'is-usd': isPKRStandard }"
                  @click="isPKRStandard = !isPKRStandard"
                  :aria-label="isPKRStandard ? 'Switch to USD' : 'Switch to PKR'"
                  role="switch"
                  :aria-checked="isPKRStandard"
                >
                  <span class="ios-toggle-thumb"></span>
                </button>
                <span class="toggle-label" :class="{ active: isPKRStandard }">PKR</span>
              </div>

              <div class="price-display">
                <span class="price-amount" :key="displayStandardPrice">{{ displayStandardPrice }}</span>
                <span class="price-period">/ student / month</span>
              </div>
              <p class="plan-desc">Includes full access to the entire intelligence suite, all role portals, campus benchmarking, and early intervention tools.</p>
            </div>
            
            <div class="calculator-box">
              <div class="calc-header">
                <span class="calc-label">Institutional Student Population:</span>
                <span class="calc-value">{{ studentCountStandard }} Students</span>
              </div>
              <input 
                min="50" 
                max="5000" 
                step="50" 
                class="range-slider" 
                type="range" 
                v-model="studentCountStandard"
              >
              <div class="calc-footer">
                <span class="calc-footer-label">Estimated Term Investment:</span>
                <span class="calc-total">{{ formattedStandardTotal }}</span>
              </div>
            </div>
            
            <div class="cta-wrapper">
              <button class="btn-demo" @click="openContactModal">
                <span>Book Standard Demo</span>
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide-arrow-right" aria-hidden="true"><path d="M5 12h14"></path><path d="m12 5 7 7-7 7"></path></svg>
              </button>
            </div>
          </div>
          
          <div class="pricing-card">
            <div class="pricing-info">
              <span class="plan-label">Premium Tier</span>

              <!-- iPhone-style Currency Toggle -->
              <div class="currency-toggle-wrapper">
                <span class="toggle-label" :class="{ active: !isPKRPremium }">USD</span>
                <button
                  class="ios-toggle"
                  :class="{ 'is-usd': isPKRPremium }"
                  @click="isPKRPremium = !isPKRPremium"
                  :aria-label="isPKRPremium ? 'Switch to USD' : 'Switch to PKR'"
                  role="switch"
                  :aria-checked="isPKRPremium"
                >
                  <span class="ios-toggle-thumb"></span>
                </button>
                <span class="toggle-label" :class="{ active: isPKRPremium }">PKR</span>
              </div>

              <div class="price-display">
                <span class="price-amount" :key="displayPremiumPrice">{{ displayPremiumPrice }}</span>
                <span class="price-period">/ student / month</span>
              </div>
              <p class="plan-desc">Advanced early intervention engine, deep performance insights, branch benchmarking, and organization-wide analytics.</p>
            </div>
            
            <div class="calculator-box">
              <div class="calc-header">
                <span class="calc-label">Institutional Student Population:</span>
                <span class="calc-value">{{ studentCountPremium }} Students</span>
              </div>
              <input 
                min="50" 
                max="5000" 
                step="50" 
                class="range-slider" 
                type="range" 
                v-model="studentCountPremium"
              >
              <div class="calc-footer">
                <span class="calc-footer-label">Estimated Term Investment:</span>
                <span class="calc-total">{{ formattedPremiumTotal }}</span>
              </div>
            </div>
            
            <div class="cta-wrapper">
              <button class="btn-demo" @click="openContactModal">
                <span>Book Premium Demo</span>
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide-arrow-right" aria-hidden="true"><path d="M5 12h14"></path><path d="m12 5 7 7-7 7"></path></svg>
              </button>
            </div>
          </div>
          
        </div>
    </div>
  </section>
</template>

<style scoped>
/* ─── iPhone-style currency toggle ─── */
.currency-toggle-wrapper {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 0.75rem;
  margin-top: 0.75rem;
  margin-bottom: 1.25rem;
}

.toggle-label {
  font-size: 0.85rem;
  font-weight: 600;
  color: #a1a1aa;
  letter-spacing: 0.05em;
  transition: color 0.3s ease;
  user-select: none;
}

.toggle-label.active {
  color: #6f42c1;
}

.ios-toggle {
  position: relative;
  width: 56px;
  height: 30px;
  border-radius: 100px;
  border: none;
  cursor: pointer;
  background: rgba(200, 180, 240, 0.25);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  box-shadow:
    0 0 0 1.5px rgba(111, 66, 193, 0.25),
    inset 0 1px 3px rgba(255, 255, 255, 0.6),
    0 4px 14px rgba(111, 66, 193, 0.15);
  transition: background 0.35s ease, box-shadow 0.35s ease;
  padding: 0;
  flex-shrink: 0;
}

.ios-toggle.is-usd {
  background: rgba(111, 66, 193, 0.85);
  box-shadow:
    0 0 0 1.5px rgba(111, 66, 193, 0.5),
    inset 0 1px 3px rgba(255, 255, 255, 0.2),
    0 6px 20px rgba(111, 66, 193, 0.35);
}

.ios-toggle-thumb {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #ffffff;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2), 0 1px 2px rgba(0,0,0,0.12);
  transition: transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
  display: block;
}

.ios-toggle.is-usd .ios-toggle-thumb {
  transform: translateX(26px);
}

/* ─── Price amount fade transition ─── */
.price-amount {
  font-size: 3.5rem;
  font-weight: 800;
  color: #0a0a0a;
  letter-spacing: -0.02em;
  transition: opacity 0.2s ease;
  animation: priceFade 0.25s ease;
}

@keyframes priceFade {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* ─── Original styles ─── */
.pricing-section {
  padding: 6rem 2.5rem;
  background-color: #ffffff;
  color: #0a0a0a;
  width: 100%;
}

.pricing-container {
  max-width: 1400px;
  margin: 0 auto;
}

.pricing-header {
  text-align: center;
  margin-bottom: 2rem;
}

.pricing-header h2 {
  font-size: 3rem;
  font-weight: 500;
  margin: 0;
  letter-spacing: -1px;
  color: #0a0a0a;
}

.pricing-card {
  background-color: #ffffff;
  border: 1px solid #e5e5e5;
  border-radius: 24px;
  padding: 3rem;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.01);
  display: flex;
  flex-direction: column;
}

.pricing-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 3rem;
  align-items: stretch;
  max-width: 1200px;
  margin: 0 auto;
}

@media (max-width: 992px) {
  .pricing-grid {
    grid-template-columns: 1fr;
    gap: 3rem;
  }
  .pricing-card {
    padding: 2rem;
  }
}

.pricing-info {
  margin-bottom: 2rem;
}

.plan-label {
  font-size: 0.85rem;
  text-transform: uppercase;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: #6f42c1;
}

.price-display {
  display: flex;
  align-items: baseline;
  gap: 0.75rem;
  margin: 1rem 0;
}



.price-period {
  font-size: 1rem;
  color: #71717a;
  font-weight: 500;
}

.plan-desc {
  font-size: 0.95rem;
  color: #52525b;
  line-height: 1.6;
}

.calculator-box {
  background-color: #f8f9fa;
  border: 1px solid #e5e5e5;
  padding: 1.5rem;
  border-radius: 16px;
  margin-bottom: 1.5rem;
  box-shadow: 0 1px 2px rgba(0,0,0,0.05);
}

.calc-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.85rem;
  margin-bottom: 1rem;
}

.calc-label {
  color: #0a0a0a;
  font-weight: 600;
}

.calc-value {
  color: #0a0a0a;
  font-size: 1rem;
  font-weight: 700;
}

.range-slider {
  width: 100%;
  height: 8px;
  background: #e5e5e5;
  border-radius: 8px;
  outline: none;
  -webkit-appearance: none;
  appearance: none;
  cursor: pointer;
  margin-bottom: 1rem;
}

.range-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #6f42c1;
  cursor: pointer;
  box-shadow: 0 0 0 4px rgba(111, 66, 193, 0.1);
}

.calc-footer {
  padding-top: 1rem;
  border-top: 1px solid #eaeaea;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.85rem;
}

.calc-footer-label {
  color: #71717a;
}

.calc-total {
  font-size: 1.25rem;
  font-weight: 700;
  color: #6f42c1;
}

.btn-demo {
  width: 100%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  background-color: #6f42c1;
  color: #ffffff;
  font-weight: 700;
  font-size: 0.95rem;
  padding: 1rem 2rem;
  border-radius: 50px;
  border: none;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 10px 20px rgba(111, 66, 193, 0.2);
}
.btn-demo:hover {
  background-color: #5936a2;
  transform: scale(0.98);
}
.btn-demo svg {
  width: 18px;
  height: 18px;
}


</style>
