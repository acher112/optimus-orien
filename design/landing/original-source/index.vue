<script setup>
import { useConfigStore } from '@core/stores/config'
import LandingNavbar from '@/components/LandingPage/LandingNavbar.vue'
import HeroSection from '@/components/LandingPage/HeroSection.vue'

import FeaturesSection from '@/components/LandingPage/FeaturesSection.vue'
import StoriesSection from '@/components/LandingPage/StoriesSection.vue'
import LandingFaqSection from '@/components/LandingPage/LandingFaqSection.vue'
import CtaSection from '@/components/LandingPage/CtaSection.vue'
import PricingSection from '@/components/LandingPage/PricingSection.vue'
import WordmarkSection from '@/components/LandingPage/WordmarkSection.vue'
import FooterSection from '@/components/LandingPage/FooterSection.vue'
import ContactModal from '@/components/LandingPage/ContactModal.vue'

import '@/components/LandingPage/base.css'
import '@/components/LandingPage/main.css'

const store = useConfigStore()
if (store) {
  store.skin = 'default'
}

definePage({
  meta: {
    layout: 'blank',
    public: true,
  },
})
</script>

<template>
  <div class="landing-page-root-wrapper app-wrapper">
    <!-- Animated background gradients -->
    <div class="bg-orbs">
      <div class="orb orb-1"></div>
      <div class="orb orb-2"></div>
      <div class="orb orb-3"></div>
    </div>

    <LandingNavbar />
    <main>
      <HeroSection />

      <FeaturesSection />
      <CtaSection />
      <StoriesSection />
      <PricingSection />
      <LandingFaqSection />
      <WordmarkSection />
    </main>
    <FooterSection />
    <ContactModal />
  </div>
</template>

<style scoped>
.landing-page-root-wrapper {
  position: relative;
  width: 100%;
  min-height: 100vh;
  background-color: var(--bg-color, #f7f9fc);
  color: var(--text-primary, #1a1a2e);
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}
</style>
