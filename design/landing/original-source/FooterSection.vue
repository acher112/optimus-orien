<script setup lang="ts">
import { openContactModal } from './store'
</script>

<template>
  <footer class="site-footer">
    <!-- Small vertical badge pinned to the right -->
    <div class="nominee-badge">
      <span class="nominee-text">Optimus Orien</span>
    </div>

    <div class="footer-container">
      
      <div class="footer-grid">
        <div class="footer-col brand-col">
          <h2 class="footer-brand">OPTIMUS ORIEN</h2>
          <p class="footer-desc">School Performance Intelligence & Early Intervention</p>
        </div>
        
        <div class="footer-col">
          <h3 class="col-title">Platform</h3>
          <ul class="footer-links">
            <li><a href="#">Academic Performance</a></li>
            <li><a href="#">Attendance</a></li>
            <li><a href="#">Skills Assessment</a></li>
            <li><a href="#">Class Intelligence</a></li>
            <li><a href="#">Early Intervention</a></li>
            <li><a href="#">Performance Trends</a></li>
            <li><a href="#">AQI</a></li>
          </ul>
        </div>
        
        <div class="footer-col">
          <h3 class="col-title">Portals</h3>
          <ul class="footer-links">
            <li><a href="#">Owner / Admin</a></li>
            <li><a href="#">Principal</a></li>
            <li><a href="#">Teacher</a></li>
            <li><a href="#">Student</a></li>
            <li><a href="#">Parent</a></li>
          </ul>
        </div>
        
        <div class="footer-col">
          <h3 class="col-title">Company</h3>
          <ul class="footer-links">
            <li><a href="#">About</a></li>
            <li><a href="#" @click.prevent="openContactModal">Contact</a></li>
            <li><a href="#">Privacy Policy</a></li>
            <li><a href="#">Terms of Service</a></li>
          </ul>
        </div>
        
        <div class="footer-col">
          <h3 class="col-title">Contact</h3>
          <ul class="footer-links">
            <li><a href="#" @click.prevent="openContactModal">Request Access</a></li>
            <li><a href="#" @click.prevent="openContactModal">Contact Us</a></li>
          </ul>
        </div>
      </div>
      
      <!-- Bottom Links Row -->
      <div class="footer-bottom">
        <span class="copyright">© 2026 Optimus Orien. All rights reserved.</span>
      </div>
      
    </div>
  </footer>
</template>

<style scoped>
.site-footer {
  background-color: #ffffff;
  width: 100%;
  position: relative;
  overflow: hidden;
  padding: 1.5rem 0 1rem 0;
}

.footer-container {
  width: 100%;
  padding: 0 4vw;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
}

.footer-grid {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr 1fr 1fr;
  gap: 2rem;
  margin-bottom: 0.5rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid rgba(0,0,0,0.05);
}

.brand-col {
  padding-right: 2rem;
}

.footer-brand {
  font-size: 1.5rem;
  font-weight: 800;
  color: #1a1a1a;
  letter-spacing: -0.02em;
  margin-bottom: 0.5rem;
}

.footer-desc {
  font-size: 1rem;
  color: #6b7280;
  line-height: 1.6;
  max-width: 300px;
}

.col-title {
  font-size: 0.875rem;
  font-weight: 700;
  color: #1a1a1a;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 0.75rem;
}

.footer-links {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.footer-links a {
  color: #6b7280;
  text-decoration: none;
  font-size: 0.95rem;
  transition: color 0.2s ease;
}

.footer-links a:hover {
  color: #9b51e0;
}

.footer-bottom {
  display: flex;
  justify-content: center;
  align-items: center;
  padding-top: 0.5rem;
}

.copyright {
  font-size: 1.1rem;
  color: #6b7280;
  font-weight: 400;
}

@media (max-width: 1024px) {
  .footer-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  .brand-col {
    grid-column: 1 / -1;
    padding-right: 0;
  }
}

@media (max-width: 640px) {
  .footer-grid {
    grid-template-columns: 1fr;
    gap: 2rem;
  }
}

/* Floating W. Nominee Badge */
.nominee-badge {
  position: absolute;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  background-color: #000;
  color: #fff;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0.75rem 0.5rem; /* Reduced padding to decrease height */
  writing-mode: vertical-rl;
  text-orientation: mixed;
  transform-origin: right center;
  z-index: 50;
  gap: 0.25rem;
  border-top-left-radius: 6px;
  border-bottom-left-radius: 6px;
  box-shadow: -10px 0 30px rgba(0,0,0,0.1);
}

.nominee-text {
  font-weight: 600;
  font-size: 0.65rem; /* Reduced font size to decrease height */
  letter-spacing: 1px; /* Tighter letter spacing */
  text-transform: uppercase;
}

@media (max-width: 1024px) {
  .footer-bottom {
    flex-direction: column;
    align-items: flex-start;
    gap: 1.5rem;
  }
}

@media (max-width: 768px) {
  .site-footer {
    padding: 6rem 0 2rem 0;
  }
  .footer-hero {
    margin-bottom: 4rem;
  }
  .footer-bottom-left, .footer-bottom-right {
    gap: 1.5rem;
    flex-direction: column;
    align-items: flex-start;
  }
  .nominee-badge {
    display: none; 
  }
  .accent-triangle {
    right: -0.8em;
  }
}
</style>
