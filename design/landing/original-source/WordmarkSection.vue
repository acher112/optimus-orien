<script setup lang="ts">
// Simple wordmark section placed just before the footer
</script>

<template>
  <section class="wordmark-section">
    <!-- Massive typographic hero wordmark -->
    <div class="footer-hero">
      <h1 class="giant-wordmark">
        OPTIMUS ORIEN
      </h1>
    </div>
  </section>
</template>

<style scoped>
.wordmark-section {
  width: 100%;
  padding: 8rem 0 4rem 0;
  background-color: #ffffff; /* Default white background */
  overflow: hidden;
}

.footer-hero {
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
}

.giant-wordmark {
  /* Oversized display typography */
  font-size: clamp(30px, 8vw, 140px); 
  font-weight: 900;
  letter-spacing: -0.06em; /* tight letter spacing */
  color: #1a1a1a; /* near-black */
  margin: 0;
  line-height: 0.8;
  display: flex;
  align-items: baseline;
  position: relative;
  z-index: 2;
}


@media (max-width: 640px) {
  .wordmark-section {
    padding: 4rem 0 2rem 0;
  }
  .giant-wordmark {
    font-size: 15vw;
  }
}
</style>
