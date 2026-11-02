<script setup lang="ts">
import { ref, computed } from 'vue'

const activeRole = ref('Admin')

const roleImages: Record<string, string> = {
  Admin: '/images/dashboard-admin.png',
  Principal: '/images/dashboard-principal.png',
  Teacher: '/images/dashboard-teacher.png',
  Student: '/images/dashboard-student.png',
  Parent: '/images/dashboard-parent.png',
}

const currentImage = computed(() => roleImages[activeRole.value] || roleImages.Admin)
</script>

<template>
  <section id="platform" class="roles-section">
    <div class="roles-container">
      <div class="roles-header">
        <div class="roles-badge">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5"><path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"></path><path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12"></path><path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17"></path></svg>
          <span>Role-Based Experiences</span>
        </div>
        <h2 class="roles-title">One Platform. Multiple Perspectives.</h2>
        <p class="roles-desc">Every stakeholder sees exactly the intelligence they need from systemic executive oversight to daily student growth.</p>
      </div>

      <div class="roles-tabs">
        <button class="role-tab" :class="{ active: activeRole === 'Admin' }" @click="activeRole = 'Admin'">
          <div class="tab-top">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><path d="M10 12h4"></path><path d="M10 8h4"></path><path d="M14 21v-3a2 2 0 0 0-4 0v3"></path><path d="M6 10H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2"></path><path d="M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16"></path></svg>
            <span class="tab-label">Role</span>
          </div>
          <div class="tab-name">Admin</div>
        </button>
        <button class="role-tab" :class="{ active: activeRole === 'Principal' }" @click="activeRole = 'Principal'">
          <div class="tab-top">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"></path><path d="M22 10v6"></path><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"></path></svg>
            <span class="tab-label">Role</span>
          </div>
          <div class="tab-name">Principal</div>
        </button>
        <button class="role-tab" :class="{ active: activeRole === 'Teacher' }" @click="activeRole = 'Teacher'">
          <div class="tab-top">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><path d="m16 11 2 2 4-4"></path><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle></svg>
            <span class="tab-label">Role</span>
          </div>
          <div class="tab-name">Teacher</div>
        </button>
        <button class="role-tab" :class="{ active: activeRole === 'Student' }" @click="activeRole = 'Student'">
          <div class="tab-top">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
            <span class="tab-label">Role</span>
          </div>
          <div class="tab-name">Student</div>
        </button>
        <button class="role-tab" :class="{ active: activeRole === 'Parent' }" @click="activeRole = 'Parent'">
          <div class="tab-top">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><path d="M16 3.128a4 4 0 0 1 0 7.744"></path><path d="M22 21v-2a4 4 0 0 0-3-3.87"></path><circle cx="9" cy="7" r="4"></circle></svg>
            <span class="tab-label">Role</span>
          </div>
          <div class="tab-name">Parent</div>
        </button>
      </div>

      <div class="main-card">
        <div class="card-header">
          <div class="browser-controls">
            <div class="dot"></div>
            <div class="dot"></div>
            <div class="dot"></div>
            <span class="url-text">portal.optimus-orien.io/super_admin</span>
          </div>
          <span class="header-badge">Multi-Campus Executive Governance</span>
        </div>
        
        <div class="card-image-wrapper">
          <img :src="currentImage" alt="Dashboard View" class="full-dashboard-image">
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.roles-section {
  padding: 4rem 1.25rem;
  background-color: #ffffff;
  width: 100%;
}

.roles-container {
  max-width: 1280px;
  margin: 0 auto;
}

.roles-header {
  max-width: 800px;
  margin: 0 auto 4rem auto;
  text-align: center;
}

.roles-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem 0.75rem;
  border-radius: 9999px;
  background: #EAEAEA;
  border: 1px solid #D4D4D8;
  font-size: 10px;
  text-transform: uppercase;
  font-weight: 700;
  letter-spacing: 0.24em;
  color: #52525B;
  margin-bottom: 1rem;
}
.roles-badge svg {
  width: 14px;
  height: 14px;
  color: #52525B;
}

.roles-title {
  font-size: 3.5rem;
  font-weight: 800;
  color: #0A0A0A;
  letter-spacing: -0.025em;
  margin-bottom: 1rem;
  line-height: 1.1;
  white-space: nowrap;
}

.roles-desc {
  font-size: 1.125rem;
  color: #52525B;
  line-height: 1.625;
}

.roles-tabs {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 0.625rem;
  margin-bottom: 2.5rem;
}

.role-tab {
  padding: 0.875rem;
  border-radius: 0.75rem;
  border: 1px solid #E5E5E5;
  background: #ffffff;
  color: #52525B;
  text-align: left;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  cursor: pointer;
  transition: all 0.2s;
  min-height: 80px;
}

.role-tab:hover {
  border-color: #D4D4D8;
  color: #0A0A0A;
  background: #FAFAFA;
}

.role-tab.active {
  border: 1px solid #08CB00;
  background: #08CB00;
  color: #ffffff;
  transform: scale(1.05);
  box-shadow: 0 10px 20px -5px rgba(8, 203, 0, 0.4);
}

.tab-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.5rem;
}

.tab-top svg {
  width: 16px;
  height: 16px;
}
.role-tab.active .tab-top svg {
  color: #ffffff;
}

.tab-label {
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  opacity: 0.6;
}

.tab-name {
  font-size: 0.75rem;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.main-card {
  background: #ffffff;
  border: 1px solid #E5E5E5;
  border-radius: 1rem;
  overflow: hidden;
  box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1);
  max-width: 1080px;
  margin: 0 auto;
}

.card-header {
  background: #F8F9FA;
  border-bottom: 1px solid #EAEAEA;
  padding: 0.875rem 1.5rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.browser-controls {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #D4D4D8;
}

.url-text {
  font-size: 0.75rem;
  color: #71717A;
  margin-left: 0.5rem;
}

.header-badge {
  font-size: 0.75rem;
  color: #52525B;
  background: #ffffff;
  padding: 0.125rem 0.625rem;
  border-radius: 0.25rem;
  border: 1px solid #E5E5E5;
}

.card-image-wrapper {
  width: 100%;
  overflow: hidden;
  background: #F8F9FA;
}

.full-dashboard-image {
  width: 100%;
  height: auto;
  display: block;
  object-fit: cover;
  object-position: top left;
}

.spec-label {
  font-size: 0.75rem;
  text-transform: uppercase;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: #71717A;
  margin-bottom: 0.25rem;
}

.card-title {
  font-size: 1.875rem;
  font-weight: 700;
  color: #0A0A0A;
  margin: 0.5rem 0;
}

.card-desc {
  font-size: 0.875rem;
  color: #52525B;
  line-height: 1.625;
}

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.75rem;
  margin: 1.5rem 0;
}

.metric-box {
  background: #F8F9FA;
  border: 1px solid #E5E5E5;
  padding: 0.75rem;
  border-radius: 0.75rem;
  box-shadow: 0 1px 2px rgba(0,0,0,0.05);
}

.metric-label {
  font-size: 10px;
  color: #71717A;
}

.metric-value {
  font-size: 1rem;
  font-weight: 700;
  color: #0A0A0A;
  margin-top: 0.25rem;
}

.checklist {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-top: 1.5rem;
}

.check-item {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  font-size: 0.75rem;
  color: #0A0A0A;
}

.check-item svg {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  color: #08CB00;
}

@media (max-width: 1024px) {
  .roles-title {
    white-space: normal;
  }
  .roles-tabs {
    grid-template-columns: repeat(3, 1fr);
  }
  .card-body {
    grid-template-columns: 1fr;
    gap: 3rem;
  }
}

@media (max-width: 640px) {
  .roles-title {
    font-size: 2rem;
  }
  .roles-section {
    padding: 3rem 1rem;
  }
  .roles-desc {
    font-size: 1rem;
  }
  .roles-tabs {
    grid-template-columns: repeat(3, 1fr);
    gap: 0.4rem;
  }
  .role-tab {
    min-height: 64px;
    padding: 0.6rem;
  }
  .tab-name {
    font-size: 0.65rem;
  }
  .card-header {
    flex-direction: column;
    gap: 0.5rem;
    align-items: flex-start;
  }
  .url-text {
    display: none;
  }
  .metrics-grid {
    grid-template-columns: 1fr;
  }
  .dashboard-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 1rem;
  }
}

@media (max-width: 400px) {
  .roles-tabs {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
