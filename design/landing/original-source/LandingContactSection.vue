<script setup lang="ts">
const submitForm = () => {
  // Handle form submission logic here
  console.log("Form submitted")
}
</script>

<template>
  <section class="contact-section">
    <div class="contact-container">
      
      <div class="contact-header">
        <h2>Got questions?</h2>
      </div>
      
      <form class="contact-form" @submit.prevent="submitForm">
        <div class="form-group">
          <label class="form-label" for="contact-name">Full name</label>
          <input class="form-control" id="contact-name" type="text" required>
        </div>
        
        <div class="form-row">
          <div class="form-group half-width">
            <label class="form-label" for="contact-email">Email</label>
            <input class="form-control" id="contact-email" type="email" required>
          </div>
          <div class="form-group half-width">
            <label class="form-label" for="contact-phone">Telephone</label>
            <input class="form-control" id="contact-phone" type="tel" required>
          </div>
        </div>
        
        <div class="form-group">
          <label class="form-label" for="contact-company">Company</label>
          <input class="form-control" id="contact-company" type="text" required>
        </div>
        
        <div class="form-group">
          <label class="form-label" for="contact-message">Message</label>
          <textarea class="form-control" id="contact-message" rows="6" required></textarea>
        </div>
        
        <div class="form-group checkbox-group">
          <label class="form-check-label">
            <input type="checkbox" class="form-check-input" required>
            <span>I accept Stable's <a href="https://www.stableapp.cloud/terms-and-conditions/" target="_blank">terms and conditions</a>, <a href="https://www.stableapp.cloud/privacy-policy/" target="_blank">privacy policy</a> and <a href="https://www.stableapp.cloud/security/" target="_blank">security policy</a>.</span>
          </label>
        </div>
        
        <div class="form-actions">
          <button type="submit" class="btn-submit">Send message</button>
        </div>
      </form>
      
      <!-- Background SVG Shapes -->
      <div class="shape-wrapper shape-1">
        <img src="https://www.stableapp.cloud/app/themes/shape/assets/dist/img/svg/stable-shape-1.svg" alt="" loading="lazy">
      </div>
      <div class="shape-wrapper shape-2">
        <img src="https://www.stableapp.cloud/app/themes/shape/assets/dist/img/svg/stable-shape-2.svg" alt="" loading="lazy">
      </div>
      
    </div>
  </section>
</template>

<style scoped>
.contact-section {
  padding: 8rem 2.5rem;
  background-color: #fff;
  width: 100%;
  position: relative;
  overflow: hidden;
}

.contact-container {
  max-width: 750px;
  margin: 0 auto;
  position: relative;
  z-index: 10;
}

.contact-header {
  text-align: center;
  margin-bottom: 2.5rem;
}

.contact-header h2 {
  font-size: 2.25rem;
  font-weight: 500;
  color: #1a1a2e;
  letter-spacing: -1px;
  margin: 0;
}

.contact-form {
  background: #fff;
  padding: 2.5rem;
  border-radius: 20px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.08);
  position: relative;
  z-index: 20;
}

.form-group {
  margin-bottom: 1.5rem;
}

.form-row {
  display: flex;
  gap: 1.5rem;
  margin-bottom: 1.5rem;
}

.half-width {
  flex: 1;
  margin-bottom: 0;
}

@media (max-width: 768px) {
  .form-row {
    flex-direction: column;
  }
}

.form-label {
  display: block;
  font-size: 0.85rem;
  font-weight: 600;
  color: #1a1a2e;
  margin-bottom: 0.5rem;
}

.form-control {
  width: 100%;
  padding: 0.75rem 1rem;
  font-size: 0.9rem;
  color: #1a1a2e;
  background-color: #f8f9fe;
  border: 1px solid #eef0f6;
  border-radius: 10px;
  transition: all 0.3s ease;
  font-family: inherit;
  resize: vertical;
}

.form-control:focus {
  outline: none;
  border-color: #6f42c1;
  background-color: #fff;
  box-shadow: 0 0 0 4px rgba(111, 66, 193, 0.1);
}

.checkbox-group {
  margin-top: 2rem;
  margin-bottom: 2rem;
}

.form-check-label {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  font-size: 0.85rem;
  color: #6c757d;
  cursor: pointer;
  line-height: 1.6;
}

.form-check-input {
  margin-top: 0.25rem;
  min-width: 1rem;
  width: 1rem;
  height: 1rem;
  accent-color: #6f42c1;
  cursor: pointer;
}

.form-check-label a {
  color: #6f42c1;
  text-decoration: underline;
  font-weight: 500;
}

.form-actions {
  text-align: center;
}

.btn-submit {
  width: 100%;
  padding: 1rem;
  font-size: 0.95rem;
  font-weight: 600;
  color: #fff;
  background-color: #2b214a;
  border: none;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.3s ease;
}

.btn-submit:hover {
  background-color: #1a1333;
  transform: translateY(-2px);
  box-shadow: 0 10px 20px rgba(43, 33, 74, 0.15);
}

/* Background Shapes */
.shape-wrapper {
  position: absolute;
  z-index: 1;
  pointer-events: none;
  opacity: 0.8;
}

.shape-1 {
  top: 50%;
  right: 100%;
  width: 682px;
  transform: translateY(-50%) translateX(100px);
}

.shape-2 {
  top: 0;
  left: 100%;
  width: 842px;
  transform: translateX(-150px);
}

.shape-wrapper img {
  width: 100%;
  height: auto;
}

@media (max-width: 1200px) {
  .shape-1 {
    transform: translateY(-50%) translateX(250px);
    opacity: 0.4;
  }
  .shape-2 {
    transform: translateX(-350px);
    opacity: 0.4;
  }
}
@media (max-width: 768px) {
  .contact-header h2 {
    font-size: 2.5rem;
  }
  .contact-form {
    padding: 2rem;
  }
  .shape-wrapper {
    display: none;
  }
}
</style>
