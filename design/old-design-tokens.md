# Extracted Design Tokens from Old Platform Landing Page

These tokens are reverse-engineered directly from the old platform's stylesheets (`base.css`, `main.css`, and scoped Vue component styles in `resources/js/components/LandingPage/`).

---

## 1. Color Palette

### Brand & Accents
- `--brand-purple-primary`: `#9b51e0` (Primary purple brand accent, buttons, active borders)
- `--brand-purple-dark`: `#6f42c1` (Alternative deep brand purple for buttons, toggles, active sliders)
- `--brand-purple-deep`: `#5c3c92` (Ambient orb gradient, deep brand background)
- `--brand-purple-subtle`: `#f3e8ff` (Light purple badge & icon background)
- `--brand-purple-glow`: `rgba(155, 81, 224, 0.3)` (Button hover glow)
- `--brand-accent-light`: `#d8b4e2` (Orb 1 ambient radial tint)
- `--brand-blue`: `#3b82f6` (Orb 3 ambient radial tint)
- `--brand-green-active`: `#08CB00` (Active role tab color, checkmarks)
- `--brand-green-glow`: `rgba(8, 203, 0, 0.4)` (Active role tab shadow)
- `--brand-yellow-vortex`: `#FFD400` (Pricing section canvas vortex particle tint)

### Surface & Backgrounds
- `--bg-canvas-light`: `#f7f9fc` (Root page background)
- `--bg-surface-white`: `#ffffff` (Card surfaces, role tab base)
- `--bg-surface-subtle`: `#f8f9fa` (Calculator boxes, browser mockup topbar)
- `--bg-dark-gradient`: `linear-gradient(180deg, #000000 0%, #1e1244 100%)` (Features section)
- `--bg-faq-dark`: `#110d1e` (FAQ section deep dark surface)
- `--bg-faq-item`: `rgba(255, 255, 255, 0.02)` (FAQ card background)
- `--bg-faq-item-hover`: `rgba(255, 255, 255, 0.04)` (FAQ card hover)
- `--bg-faq-item-active`: `rgba(255, 255, 255, 0.05)` (FAQ card expanded)
- `--bg-navbar-frosted`: `rgba(250, 250, 250, 0.4)` (Translucent header pills)

### Text & Typography
- `--text-hero-brand`: `#1a0b2e` (Dark purple near-black hero brand wordmark)
- `--text-heading-dark`: `#0a0a0a` / `#1a1a1a` (Section titles, card headers)
- `--text-heading-light`: `#ffffff` (Features & FAQ section headlines)
- `--text-body-dark`: `#52525b` / `#4a4a5e` (Body paragraphs, subtitles)
- `--text-body-muted`: `#71717a` / `#6b7280` (Footer descriptions, taglines, labels)
- `--text-body-light`: `#94a3b8` / `#aeb1b8` (Dark section body text)

### Borders & Dividers
- `--border-subtle-light`: `#e5e5e5` (Cards, inputs)
- `--border-subtle-xlight`: `#eaeaea` (Card dividers, topbars)
- `--border-dark-subtle`: `rgba(255, 255, 255, 0.08)` (FAQ card borders)
- `--border-dark-active`: `rgba(111, 66, 193, 0.5)` (FAQ active card border)

---

## 2. Typography Scale

- **Font Family**: `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`
- **Giant Wordmark**: `clamp(30px, 8vw, 140px)`, weight `900`, letter-spacing `-0.06em`, line-height `0.8`
- **Hero Title**: `clamp(2.5rem, 6vw, 4.5rem)`, weight `800` / `600`, letter-spacing `2px`
- **Section Heading H2**: `clamp(2rem, 5vw, 3.5rem)`, weight `800` / `500`, letter-spacing `-1px` to `-1.5px`
- **Card Title H3**: `1.25rem` to `1.875rem`, weight `700`
- **Pricing Figure**: `3.5rem` to `5rem`, weight `800`, letter-spacing `-2px`
- **Lead Subtitle**: `1.15rem` to `1.2rem`, weight `400` / `500`, line-height `1.6`
- **Body Text**: `0.95rem` to `1rem`, line-height `1.6` to `1.7`
- **Badges & Overlines**: `9px` to `11px`, weight `700`, text-transform `uppercase`, letter-spacing `0.24em`

---

## 3. Spacing & Border Radii

### Border Radii
- `--radius-pill`: `9999px` / `100px` (Badges, buttons, currency switches)
- `--radius-hero-container`: `1.875rem` (30px) (Features dark container)
- `--radius-card-large`: `24px` (Pricing cards, contact forms)
- `--radius-card-medium`: `16px` (FAQ items, calculator boxes)
- `--radius-input`: `10px` / `12px` (Inputs, buttons)
- `--radius-tab`: `0.75rem` (12px) (Role tabs)

### Box Shadows
- `--shadow-subtle`: `0 1px 2px rgba(0, 0, 0, 0.05)`
- `--shadow-card`: `0 20px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.01)`
- `--shadow-carousel-active`: `0 40px 100px -20px rgba(0, 0, 0, 0.15)`
- `--shadow-button-primary`: `0 10px 20px rgba(111, 66, 193, 0.2)`
- `--shadow-button-active`: `0 10px 20px -5px rgba(8, 203, 0, 0.4)`
- `--shadow-modal`: `0 25px 50px -12px rgba(0, 0, 0, 0.25)`

---

## 4. UI Effects & Animations

- **Backdrop Filter**: `backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);`
- **Vortex Canvas**: Interactive multi-body golden angle spiral with spring velocity decay (`vx *= 0.82`, return force `0.15`).
- **Card Carousel Transition**: `cubic-bezier(0.2, 0.8, 0.2, 1)` easing for 3D stack perspective.
- **Accordion Transition**: Smooth `max-height 0.4s cubic-bezier(0.25, 0.8, 0.25, 1)`.
- **Button Hover**: `transform: translateY(-2px);` with shadow elevation.
