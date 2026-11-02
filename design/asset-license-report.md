# Asset and License Report

This report classifies every asset found in the old platform landing page codebase, identifies owner vs. third-party origin, verifies licensing requirements, and flags photographic content requiring owner approval.

---

## 1. Summary of Asset Classification

| Asset Category | Path / Identifier | Origin | License / Rights Status | Porting Decision |
|---|---|---|---|---|
| **Typography** | `Inter`, `system-ui` | Third-Party | SIL Open Font License 1.1 | Included via system font stack / Google Fonts. |
| **Styling & CSS** | `base.css`, `main.css`, scoped Vue styles | Owner's Custom Code | Proprietary / Owner Owned | Ported & extracted into design tokens. |
| **Interactive Canvas Animations** | `VortexAnimation.vue`, `SingleVortexAnimation.vue` | Owner's Custom Code | Proprietary / Custom Math Canvas | Ported to React HTML5 Canvas components. |
| **Icons** | Inline SVGs (Lucide / Heroicons style) | Third-Party | MIT / ISC License | Reused via inline SVG or `lucide-react`. |
| **UI Dashboard Mockups** | `dashboard-admin.png`, `dashboard-principal.png`, `dashboard-teacher.png`, `dashboard-student.png`, `dashboard-parent.png` | Owner's Platform UI | Proprietary (Optimus Orien software interface) | Allowed to be ported directly as platform UI screenshots. |
| **Brand Identity** | `logo.jpg`, `favicon.jpg`, `brand-logo-text` wordmark | Owner's Brand | Proprietary (Optimus Orien trademark) | Allowed to be ported. |
| **Slider / Marketing Photos** | `landing_sliders/1772000261_*.jpeg`, `1772000811_*.png`, `1777993734_*.webp` | Mixed / Unverified stock | **RESTRICTED** — Photos potentially showing real people or children | **DO NOT COPY**. Substituted with clean vector/SVG placeholders. Flagged for owner approval. |
| **Third-Party Client Logos** | `ClientsSection.vue` remote URLs (`stableapp.cloud`) | Third-Party | Third-party commercial trademarks | Excluded / replaced with neutral institutional partner placeholders. |

---

## 2. Photographic & Children Privacy Audit

In strict compliance with user instructions:
> *"Check the slider and gallery images for photos of real children or real people; do not copy any such image. Use clearly marked placeholder images instead and tell me which images need the owner's approval."*

### Flagged Images Requiring Owner Approval:
1. `public/landing_sliders/1772000261_image.jpeg` & `1772000261_mobile_image.jpeg`: Photographic banner. Flagged as needing owner sign-off / model release verification.
2. `public/landing_sliders/1772000811_image.png` & `1772000811_mobile_image.jpg`: Photographic banner. Flagged as needing owner sign-off.
3. `public/landing_sliders/1777993734_image.webp` & `1777993734_mobile_image.jpeg`: Photographic banner. Flagged as needing owner sign-off.
4. `resources/views/frontend/school-website/` gallery and slider images: Flagged (excluded from platform build, belongs to school tenant websites).

**Action Taken**: In the new platform landing page, all image slots for hero sliders and promotional imagery are configured with accessible, clean vector graphic cards and SVGs, completely avoiding unapproved photos of real persons.

---

## 3. Third-Party Template Assessment

- The old page utilized styling patterns from modern Vue/Vite templates with custom canvas animations.
- No commercial CSS frameworks (such as paid ThemeForest themes or proprietary icon libraries like FontAwesome Pro) are strictly required for the public landing page.
- All extracted tokens (colors, gradients, glassmorphism blur, rounded radii, shadows) are implemented directly in our own CSS without external proprietary dependencies.
