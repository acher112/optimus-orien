# Old Platform Landing Page Inventory

## 1. Overview & Architecture

- **Entry Point / Routes**:
  - `routes/web.php` maps the root URL (`/`) on central SaaS domains to `FrontHomeController@saas`.
  - For non-tenant domains, `saas()` returns `view('application')` (`resources/views/application.blade.php`).
  - `application.blade.php` mounts `<div id="app"></div>` and boots the Vue 3 Single Page Application (`resources/js/app.js`).
  - Vue Router loads `resources/js/pages/front-pages/landing-page/index.vue`.
  - Old contact route: `POST /owner-contact` -> `FrontHomeController@storeOwnerContact` writing to `owner_contacts`.
  - Old tenant registration route: `GET subscription/{package_id}/register-pay` -> `FrontHomeController@showRegistrationForm`.
- **Primary Page Components**:
  - `LandingNavbar.vue`
  - `HeroSection.vue`
  - `FeaturesSection.vue`
  - `CtaSection.vue` (Role-based dashboard views)
  - `StoriesSection.vue` (Student-based pricing tiers carousel)
  - `PricingSection.vue` (Interactive pricing calculator)
  - `LandingFaqSection.vue` (FAQ 12-item grid)
  - `WordmarkSection.vue` (Giant wordmark)
  - `FooterSection.vue` (Multi-column footer with nominee badge)
  - `ContactModal.vue` / `LandingContactSection.vue` (Contact drawer and inline form)
  - Secondary/Alternative components present in codebase: `ClientsSection.vue` (infinite logo carousel), `StepsSection.vue` (6 steps pipeline).

> **CRITICAL NOTE ON AUTH BUTTONS**: The old landing page had **NO "Sign in" or "Register" / "Sign up" buttons** in any section or navbar. The new design requirement explicitly introduces them.

---

## 2. Inventory of Sections (in visual order)

### Section 0: Ambient Background
- **Component**: `index.vue` (`.bg-orbs`)
- **Visuals**: 3 floating animated gradient orbs (purple `#5c3c92`, blue `#3b82f6`, light accent `#d8b4e2`) with `filter: blur(80px)`.

---

### Section 1: Navigation Bar (`LandingNavbar.vue`)
- **Container**: Translucent frosted header (`rgba(250, 250, 250, 0.4)`, `backdrop-filter: blur(12px)`).
- **Branding**: Floating minimalist or wordmark header.
- **Menu Links**:
  - `Home` -> `#masthead` (smooth scroll to top)
  - `Platform` -> `#platform` (scroll to roles section)
  - `Pricing` -> `#pricing` (scroll to pricing section)
- **Mobile Menu**: Hamburger button (`aria-expanded`, 3-bar transform animation) revealing floating right drawer on mobile (<768px).
- **Original Buttons**: None (no Sign in, no Register).

---

### Section 2: Hero Section (`HeroSection.vue`)
- **Element ID**: `#masthead`
- **Visuals**: Fullscreen interactive particle vortex (`VortexAnimation.vue`) responding to cursor proximity and golden spiral positioning.
- **Heading**: Centered brand text `OPTIMUS ORIEN` (`clamp(2.5rem, 6vw, 4.5rem)`, color `#1a0b2e`, letter spacing `2px`).
- **Old Buttons**: None visible in current active template (underlying CSS had `.btn-primary` and `.btn-secondary` definitions for "Get Started" and "Explore Platform").
- **Content Source**: Static component; dynamic slider capability backed by `landing_page_sliders` table in admin panel.

---

### Section 3: Core Features Section (`FeaturesSection.vue`)
- **Visual Container**: Dark rounded container (`linear-gradient(180deg, #000 0, #1e1244 100%)`, border-radius `1.875rem`).
- **Header**: `One Platform. One Performance Picture.`
- **Grid**: 3-column / 6-card layout with purple circular icon badges (`#a855f7` on `rgba(255, 255, 255, 0.05)`):
  1. **Academic Performance**: "Track student performance across subjects, assessments, terms, and academic years."
  2. **Attendance Intelligence**: "Monitor attendance patterns and identify students whose attendance may require attention."
  3. **Skills Assessment**: "Record subject-specific skill ratings and monitor development beyond examination marks."
  4. **Class Performance**: "Understand how each class is performing by comparing subject-level performance and class averages."
  5. **Student Risk Identification**: "Identify students whose combined performance indicators suggest that they may require additional support."
  6. **Longitudinal Analysis**: "Track performance over time instead of looking at isolated examination results."
- **Content Source**: Static component; managed via `landing_core_features` table (`id`, `title`, `icon_class`, `sort_order`, `is_active`).

---

### Section 4: Role-Based Experiences / CTA (`CtaSection.vue`)
- **Element ID**: `#platform`
- **Badge**: `ROLE-BASED EXPERIENCES`
- **Header**: `One Platform. Multiple Perspectives.`
- **Description**: "Every stakeholder sees exactly the intelligence they need from systemic executive oversight to daily student growth."
- **Role Switcher Tabs** (5 tabs):
  1. **Admin** (Active color `#08CB00` green / primary dark)
     - Mockup URL: `portal.optimus-orien.io/super_admin`
     - Badge: "Multi-Campus Executive Governance"
     - Image: `/images/dashboard-admin.png`
  2. **Principal**
     - Mockup URL: `portal.optimus-orien.io/principal`
     - Badge: "Campus Leadership & Trend Oversight"
     - Image: `/images/dashboard-principal.png`
  3. **Teacher**
     - Mockup URL: `portal.optimus-orien.io/teacher`
     - Badge: "Classroom Analytics & Early Alerts"
     - Image: `/images/dashboard-teacher.png`
  4. **Student**
     - Mockup URL: `portal.optimus-orien.io/student`
     - Badge: "Personal Progress & Reflection"
     - Image: `/images/dashboard-student.png`
  5. **Parent**
     - Mockup URL: `portal.optimus-orien.io/parent`
     - Badge: "Child Academic & Attendance Insights"
     - Image: `/images/dashboard-parent.png`
- **Old Buttons**: Tab switches only; no external links.

---

### Section 5: Student-Based Pricing Carousel (`StoriesSection.vue`)
- **Element ID**: `#pricing`
- **Visuals**: Animated golden particle vortex (`SingleVortexAnimation.vue` with color `#FFD400`).
- **Heading**: `Student-Based Pricing`
- **Subheading**: "Get one month complimentory access. Experience the full platform with one month of free access and usage. No payment is required to get started, and there are no upfront costs or commitments during the trial period."
- **Cards (Carousel Switcher)**:
  1. **Standard Tier**:
     - Price: `$3.60` USD / `499 PKR` per student / month.
     - Title: "Essential Performance Management"
     - Features: Student Profiles, Marks & Assessments, Attendance Tracking, Teacher Portal, Student Portal, Parent Portal, Principal Dashboard, Class & Subject Performance, Basic Reports, Performance Trends.
  2. **Premium Tier**:
     - Price: `$7.20` USD / `999 PKR` per student / month.
     - Title: "Advanced Performance Intelligence"
     - Features: Everything in Standard, plus: Early Intervention System, Student Attention Indicators, Automated Alerts & Notifications, Academic Quality Index (AQI), Advanced Analytics, 5-Year Performance Analysis, Advanced Class Intelligence, Teacher Performance Insights, School & Branch Comparison, Organization-Wide Dashboard, Intervention Tracking, Advanced Reports.
- **Old Actions**: Card selection switches active tier.

---

### Section 6: Interactive Pricing Calculator (`PricingSection.vue`)
- **Element ID**: `#pricing`
- **Layout**: 2 comprehensive pricing cards (Standard Tier vs Premium Tier).
- **Controls**:
  - Currency Toggle: iOS-style switch between `USD` and `PKR`.
  - Standard Tier: `$3.60` USD / `499 PKR` per student / month.
  - Premium Tier: `$7.20` USD / `999 PKR` per student / month.
  - Institutional Population Slider: Range 50 to 5,000 students (step 50).
  - Dynamic Investment Calculation:
    - Standard total: `studentCount * rate`
    - Premium total: `studentCount * rate`
  - Action Buttons:
    - `Book Standard Demo` -> opens Contact Modal.
    - `Book Premium Demo` -> opens Contact Modal.

---

### Section 7: Frequently Asked Questions (`LandingFaqSection.vue`)
- **Element ID**: `#faq`
- **Background**: Deep Navy `#110d1e`, clean dark card layout.
- **Heading**: `Frequently Asked Questions`
- **Grid**: 3 columns (responsive to 2 or 1 column), 12 accordion items:
  1. *Is Optimus Orien an LMS?* (No, performance intelligence and early intervention).
  2. *What grades does Optimus Orien support?* (Grades 1–12).
  3. *Who can use Optimus Orien?* (Owners, Admins, Principals, Teachers, Students, Parents).
  4. *Does Optimus Orien replace existing LMS/ERP?* (Complements existing systems).
  5. *What information can schools track?* (Academic marks, attendance, skills, longitudinal trends).
  6. *Can parents access student performance?* (Yes, dedicated parent portal).
  7. *How does Optimus Orien identify students requiring attention?* (Analyzes patterns, decision-support).
  8. *How much does it cost?* (Standard $3.60 / student / month).
  9. *Is my school's data secure?* (Enterprise-grade encryption, privacy first).
  10. *Does it require special hardware or servers?* (No, 100% cloud-based).
  11. *How long does it take to implement?* (A few weeks onboarding).
  12. *Do you provide training for teachers and staff?* (Yes, comprehensive training and support).
- **Content Source**: Static in Vue, formerly backed by landlord `faqs` table (`title`, `description`).

---

### Section 8: Brand Wordmark (`WordmarkSection.vue`)
- **Visuals**: Giant typography display "OPTIMUS ORIEN" (`clamp(30px, 8vw, 140px)`).

---

### Section 9: Footer Section (`FooterSection.vue`)
- **Branding**: `OPTIMUS ORIEN`, "School Performance Intelligence & Early Intervention".
- **Nominee Badge**: Vertical badge pinned to right edge: `OPTIMUS ORIEN`.
- **Columns**:
  - `Platform`: Academic Performance, Attendance, Skills Assessment, Class Intelligence, Early Intervention, Performance Trends, AQI.
  - `Portals`: Owner / Admin, Principal, Teacher, Student, Parent.
  - `Company`: About, Contact (opens Contact Modal), Privacy Policy, Terms of Service.
  - `Contact`: Request Access (opens Contact Modal), Contact Us (opens Contact Modal).
- **Copyright**: `© 2026 Optimus Orien. All rights reserved.`

---

### Section 10: Contact Modals & Inlines
- **Contact Modal (`ContactModal.vue`)**:
  - Heading: "Get in Touch"
  - Copy: "Please email us at optimusorien@gmail.com and our team will get back to you within 24 hours."
  - Action: "Open Mail App" (`mailto:optimusorien@gmail.com`).
- **Inline Contact Form (`LandingContactSection.vue`)**:
  - Heading: "Got questions?"
  - Fields: Full name, Email, Telephone, Company, Message, Terms checkbox.
  - Submit Button: "Send message" -> `POST /owner-contact`.

---

## 3. Separate Old Per-School Public Websites (EXCLUDED — DO NOT BUILD NOW)
The old codebase also contained public websites for individual tenant schools:
1. `resources/views/frontend/school-website/classic`
2. `resources/views/frontend/school-website/modern`
3. `resources/views/frontend/school-website/trending`
4. Associated features: `front_settings`, `galleries`, `alumni`, `topper`, `online_applicants`, `admission.blade.php`.
*These belong to individual school subdomains, are tenant-scoped, and are explicitly excluded from this task.*
