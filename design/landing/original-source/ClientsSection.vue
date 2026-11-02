<script setup lang="ts">
const logos = [
  { name: '4th Whale', src: 'https://www.stableapp.cloud/app/uploads/2025/07/logo-4th-whale-2x.png', width: 160, height: 126 },
  { name: 'Axify', src: 'https://www.stableapp.cloud/app/uploads/2025/07/logo-axify-2x.png', width: 160, height: 46 },
  { name: 'Illuxi', src: 'https://www.stableapp.cloud/app/uploads/2025/07/logo-illuxi-2x.png', width: 160, height: 42 },
  { name: 'Kolortrak', src: 'https://www.stableapp.cloud/app/uploads/2025/07/logo-kolortrak-2x.png', width: 160, height: 19 },
  { name: 'MUUTAA', src: 'https://www.stableapp.cloud/app/uploads/2025/07/logo-muutaa-2x.png', width: 160, height: 48 },
  { name: 'RTINGS.com', src: 'https://www.stableapp.cloud/app/uploads/2025/07/logo-rtings-2x.png', width: 160, height: 36 },
  { name: 'Université Laval', src: 'https://www.stableapp.cloud/app/uploads/2025/07/logo-ul-2x.png', width: 160, height: 69 }
]
</script>

<template>
  <section class="clients-section">
    <div class="clients-container">
      <div class="clients-header">
        <h2>Clients</h2>
      </div>
      
      <div class="logo-carousel">
        <div class="logo-track">
          <!-- First set of logos -->
          <div class="logo-slide" v-for="logo in logos" :key="logo.name + '1'">
            <img :src="logo.src" :alt="logo.name" :width="logo.width" :height="logo.height" loading="lazy">
          </div>
          <!-- Second set of logos (for perfect infinite loop) -->
          <div class="logo-slide" v-for="logo in logos" :key="logo.name + '2'">
            <img :src="logo.src" :alt="logo.name" :width="logo.width" :height="logo.height" loading="lazy">
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.clients-section {
  padding: 4rem 0 6rem 0;
  background-color: #fff;
  overflow: hidden;
}

.clients-header {
  text-align: center;
  margin-bottom: 4rem;
}

.clients-header h2 {
  font-size: 2.25rem;
  font-weight: 500;
  color: #1a1a2e;
  margin: 0;
  letter-spacing: -1px;
}

.logo-carousel {
  width: 100%;
  overflow: hidden;
  position: relative;
}

/* Faded edges for the carousel */
.logo-carousel::before,
.logo-carousel::after {
  content: "";
  position: absolute;
  top: 0;
  width: 150px;
  height: 100%;
  z-index: 2;
  pointer-events: none;
}

.logo-carousel::before {
  left: 0;
  background: linear-gradient(to right, rgba(255, 255, 255, 1) 0%, rgba(255, 255, 255, 0) 100%);
}

.logo-carousel::after {
  right: 0;
  background: linear-gradient(to left, rgba(255, 255, 255, 1) 0%, rgba(255, 255, 255, 0) 100%);
}

.logo-track {
  display: flex;
  width: calc(250px * 14); /* 250px per slide * 14 slides */
  animation: scroll 30s linear infinite;
  align-items: center;
}

.logo-track:hover {
  animation-play-state: paused;
}

.logo-slide {
  width: 250px;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 0 2rem;
}

.logo-slide img {
  max-width: 100%;
  max-height: 70px;
  object-fit: contain;
  opacity: 0.5;
  filter: grayscale(100%);
  transition: opacity 0.3s ease, filter 0.3s ease;
}

.logo-slide img:hover {
  opacity: 1;
  filter: grayscale(0%);
}

@keyframes scroll {
  0% { transform: translateX(0); }
  100% { transform: translateX(calc(-250px * 7)); } /* Shift by exactly half the track width */
}

@media (max-width: 768px) {
  .logo-carousel::before,
  .logo-carousel::after {
    width: 60px;
  }
  .logo-slide {
    width: 200px;
  }
  .logo-track {
    width: calc(200px * 14);
  }
  @keyframes scroll {
    0% { transform: translateX(0); }
    100% { transform: translateX(calc(-200px * 7)); }
  }
}
</style>
