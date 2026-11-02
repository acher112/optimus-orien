<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

const isScrolled = ref(false)
const menuOpen = ref(false)

const handleScroll = () => {
  isScrolled.value = window.scrollY > 20
}

const closeMenu = () => { menuOpen.value = false }

onMounted(() => {
  window.addEventListener('scroll', handleScroll)
})

onUnmounted(() => {
  window.removeEventListener('scroll', handleScroll)
})
</script>

<template>
  <header class="navbar" :class="{ 'is-scrolled': isScrolled }">
    <div class="navbar-container">
      <!-- Mobile Hamburger -->
      <button class="hamburger" @click="menuOpen = !menuOpen" :aria-expanded="menuOpen" aria-label="Toggle menu">
        <span :class="{ open: menuOpen }"></span>
        <span :class="{ open: menuOpen }"></span>
        <span :class="{ open: menuOpen }"></span>
      </button>

      <div class="nav-right" :class="{ 'mobile-open': menuOpen }">
        <nav class="nav-links">
          <a href="#masthead" @click="closeMenu">Home</a>
          <a href="#platform" @click="closeMenu">Platform</a>
          <a href="#pricing" @click="closeMenu">Pricing</a>
        </nav>
      </div>
    </div>
  </header>
</template>

<style scoped>
.navbar {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  padding: 1rem 0;
  z-index: 100;
  background: transparent;
  transition: padding 0.3s ease;
}

.navbar.is-scrolled {
  padding: 0.5rem 0;
}

.navbar-container {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 2rem;
  width: 100%;
}

.logo {
  display: flex;
  align-items: center;
  opacity: 1;
  pointer-events: auto;
  transform: translateX(0);
  transition: all 0.3s ease;
}

.logo-text {
  display: flex;
  flex-direction: column;
}

.logo-title {
  font-weight: 800;
  font-size: 1.6rem;
  letter-spacing: 0.5px;
  color: var(--text-primary, #1a1a1a);
  line-height: 1.1;
}

.logo-tagline {
  font-size: 0.65rem;
  font-weight: 600;
  text-transform: uppercase;
  color: #6b7280;
  letter-spacing: 0.5px;
}



.nav-right {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  background: rgba(250, 250, 250, 0.4);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  padding: 0.5rem 0.5rem 0.5rem 2rem;
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05);
  margin-right: 0;
  margin-left: auto;
}

.nav-links {
  display: flex;
  gap: 1.5rem;
  align-items: center;
}

.nav-links a {
  text-decoration: none;
  color: var(--text-primary);
  font-weight: 600;
  font-size: 0.9rem;
  transition: color 0.3s ease;
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.nav-links a:hover {
  color: var(--primary-purple);
}

.icon-link {
  font-size: 1.1em;
  font-weight: 400;
  opacity: 0.8;
}

.btn-primary {
  padding: 0.6rem 1.25rem;
  font-size: 0.9rem;
  display: flex;
  align-items: center;
  gap: 0.4rem;
  border-radius: 6px;
  margin-left: 0.5rem;
}

/* ─── Hamburger ─── */
.hamburger {
  display: none;
  flex-direction: column;
  justify-content: center;
  gap: 5px;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0.5rem;
  margin-left: auto;
  z-index: 200;
}
.hamburger span {
  display: block;
  width: 24px;
  height: 2px;
  background: #1a1a1a;
  border-radius: 2px;
  transition: transform 0.3s ease, opacity 0.3s ease;
}
.hamburger span.open:nth-child(1) { transform: translateY(7px) rotate(45deg); }
.hamburger span.open:nth-child(2) { opacity: 0; }
.hamburger span.open:nth-child(3) { transform: translateY(-7px) rotate(-45deg); }

@media (max-width: 768px) {
  .hamburger { display: flex; }

  .navbar-container {
    position: relative;
  }

  .nav-right {
    position: absolute;
    top: 100%;
    right: 2rem;
    width: auto;
    min-width: 200px;
    height: auto;
    background: rgba(250, 250, 250, 0.4);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    flex-direction: column;
    justify-content: flex-start;
    align-items: flex-start;
    padding: 1.5rem;
    margin-top: 1rem;
    border-radius: 8px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
    opacity: 0;
    visibility: hidden;
    transform: translateY(-10px);
    transition: all 0.3s ease;
    z-index: 150;
  }

  .nav-right.mobile-open {
    opacity: 1;
    visibility: visible;
    transform: translateY(0);
  }

  .nav-links {
    flex-direction: column;
    gap: 1rem;
    align-items: flex-start;
    width: 100%;
  }

  .nav-links a {
    font-size: 1.1rem;
    font-weight: 600;
    width: 100%;
    padding: 0.25rem 0;
  }
}
</style>
