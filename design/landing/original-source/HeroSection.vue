<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import VortexAnimation from './VortexAnimation.vue';
import { openContactModal } from './store';

const heroImgWrapper = ref(null);
const translateY = ref(0);

const handleScroll = () => {
  if (!heroImgWrapper.value) return;
  
  const rect = heroImgWrapper.value.getBoundingClientRect();
  // Start parallax only when the image reaches the top third of the viewport (e.g. rect.top < 150)
  if (rect.top > 150) {
    translateY.value = 0; // Fully shown when scrolling down to it
  } else {
    // After scrolling past it, it goes down into the mask
    translateY.value = (150 - rect.top) * 0.5;
  }
};

onMounted(() => {
  window.addEventListener('scroll', handleScroll);
  setTimeout(handleScroll, 100);
});

onUnmounted(() => {
  window.removeEventListener('scroll', handleScroll);
});
</script>

<template>
  <section id="masthead" class="site-header position-relative parallax-wrapper" data-navbar-theme="dark">
    <VortexAnimation />
    <div class="center-text-overlay">
      <h1 class="brand-logo-text" style="text-transform: uppercase;" >OPTIMUS ORIEN</h1>
    </div>
  </section>
</template>

<style scoped>
.site-header {
  min-height: 100vh;
  position: relative;
  overflow: hidden;
  background-color: transparent;
}

.center-text-overlay {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 100%;
  text-align: center;
  z-index: 10;
  pointer-events: none;
}

.brand-logo-text {
  font-size: clamp(2.5rem, 6vw, 4.5rem);
  font-weight: 600;
  color: #1a0b2e; /* Dark purple/near-black */
  letter-spacing: 2px;
  margin: 0;
  padding: 0;
  pointer-events: auto;
  text-transform: lowercase;
}

.position-relative {
  position: relative !important;
}

.hero-container {
  width: 100%;
  max-width: 1400px;
  margin: 0 auto;
  padding: 0 1rem;
  position: relative;
}



.text-center {
  text-align: center;
}

.mx-auto {
  margin-left: auto;
  margin-right: auto;
}

.mb-4 {
  margin-bottom: 2rem;
}

.mb-5 {
  margin-bottom: 3rem;
}

.img-fluid {
  max-width: 100%;
  height: auto;
}

.d-block {
  display: block;
}

.w-100 {
  width: 100%;
}

.z-1 { z-index: 1; }
.z-2 { z-index: 2; }

.position-absolute {
  position: absolute;
}

.top-0 { top: 0; }
.end-50 { right: 50%; }
.start-50 { left: 50%; }

@keyframes heroFadeUp {
  0% {
    opacity: 0;
    transform: translateY(30px);
  }
  100% {
    opacity: 1;
    transform: translateY(0);
  }
}

.hero-headline {
  font-size: clamp(2.2rem, 4.5vw, 3.8rem);
  font-weight: 800;
  letter-spacing: -1.5px;
  color: #1a1a1a;
  line-height: 1.15;
  max-width: 900px;
  animation: heroFadeUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

.hero-subtitle {
  font-size: 1.15rem;
  color: #1a1a1a;
  line-height: 1.6;
  max-width: 750px;
}

.hero-cta-group {
  display: flex;
  gap: 1rem;
  justify-content: center;
  flex-wrap: wrap;
}

.btn-lg {
  padding: 0.8rem 1.8rem;
  font-size: 1.05rem;
  border-radius: 8px;
  font-weight: 600;
  text-decoration: none;
  transition: all 0.2s ease;
}

.btn-primary {
  background-color: #1a1a1a;
  color: #fff;
  border: 2px solid #1a1a1a;
}

.btn-primary:hover {
  background-color: #333;
  border-color: #333;
}

.btn-secondary {
  background-color: transparent;
  color: #1a1a1a;
  border: 2px solid #e2e8f0;
}

.btn-secondary:hover {
  border-color: #1a1a1a;
  background-color: #f7f8f9;
}

.hero-supporting-statement {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: #6b7280;
}

.l-header__img {
  margin-top: 3rem;
  max-width: 900px;
  margin-left: auto;
  margin-right: auto;
  position: relative;
}

.l-header__img::before {
  content: '';
  position: absolute;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 115%;
  height: 50%;
  border-radius: 32px 32px 0 0;
  z-index: -1;
}

.l-header__img__inner {
  overflow: hidden;
  border-radius: 24px 24px 0 0;
}

.parallax-img {
  will-change: transform;
  border-radius: 24px 24px 0 0;
}

.l-header__shape-wrapper {
  pointer-events: none;
}

.l-header__shape-wrapper--1 {
  transform: translateX(10%);
}

.l-header__shape-wrapper--2 {
  transform: translateX(-10%);
}

/* ─── Mobile Responsive ─── */
@media (max-width: 768px) {
  .site-header {
    min-height: 100svh;
  }
  .hero-headline {
    font-size: clamp(2rem, 8vw, 3rem);
    letter-spacing: -1px;
  }
  .hero-subtitle {
    font-size: 1rem;
    padding: 0 0.5rem;
  }
  .hero-supporting-statement {
    font-size: 0.65rem;
    letter-spacing: 0.5px;
    padding: 0 1rem;
  }
  .btn-lg {
    padding: 0.7rem 1.4rem;
    font-size: 0.95rem;
    width: 100%;
    max-width: 280px;
  }
  .hero-cta-group {
    flex-direction: column;
    align-items: center;
  }
}

@media (max-width: 480px) {
  .hero-headline {
    font-size: clamp(1.8rem, 9vw, 2.4rem);
  }
  .hero-subtitle {
    font-size: 0.95rem;
  }
}
</style>
