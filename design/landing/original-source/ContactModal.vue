<script setup lang="ts">
import { isContactModalOpen, closeContactModal } from './store';
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="isContactModalOpen" class="modal-overlay" @click="closeContactModal">
        <div class="modal-content" @click.stop>
          <div class="modal-header">
            <button class="close-btn" @click="closeContactModal">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M18 6 6 18"></path><path d="m6 6 12 12"></path>
              </svg>
            </button>
          </div>
          <div class="modal-body">
            <div class="icon-wrapper">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect width="20" height="16" x="2" y="4" rx="2"></rect>
                <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"></path>
              </svg>
            </div>
            <h2>Get in Touch</h2>
            <p>Please email us at <strong>optimusorien@gmail.com</strong> and our team will get back to you within 24 hours.</p>
            <a href="mailto:optimusorien@gmail.com" class="action-btn">
              Open Mail App
            </a>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(8px);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 99999;
}

.modal-content {
  background: white;
  width: 90%;
  max-width: 420px;
  border-radius: 24px;
  padding: 1.5rem 2rem 2.5rem;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
  position: relative;
  text-align: center;
}

.modal-header {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 1rem;
}

.close-btn {
  background: transparent;
  border: none;
  cursor: pointer;
  color: #999;
  padding: 0.5rem;
  border-radius: 50%;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.close-btn:hover {
  background: #f4f4f5;
  color: #111;
}

.icon-wrapper {
  width: 64px;
  height: 64px;
  background: #f3e8ff;
  color: #9b51e0;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 1.5rem;
}

h2 {
  font-size: 1.75rem;
  font-weight: 700;
  color: #111;
  margin-bottom: 0.75rem;
  letter-spacing: -0.5px;
}

p {
  font-size: 1.05rem;
  line-height: 1.6;
  color: #555;
  margin-bottom: 2rem;
}

p strong {
  color: #9b51e0;
  font-weight: 600;
}

.action-btn {
  display: inline-block;
  width: 100%;
  padding: 1rem;
  background: #9b51e0;
  color: white;
  font-weight: 600;
  font-size: 1.05rem;
  text-decoration: none;
  border-radius: 12px;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.action-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(155, 81, 224, 0.3);
}

/* Transitions */
.modal-enter-active,
.modal-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
  backdrop-filter: blur(0px);
}

.modal-enter-from .modal-content,
.modal-leave-to .modal-content {
  transform: scale(0.95) translateY(20px);
  opacity: 0;
}
</style>
