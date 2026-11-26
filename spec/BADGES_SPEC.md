# Optimus Orien — Badges & Achievements System Specification

**Document Version:** 1.0  
**Status:** Implemented (Stage 1 Backend Engine & Tests Completed)  
**Target Milestone:** Comprehensive Institutional Accolades & Pedagogical Achievements Engine  

---

## 1. System Overview & Golden Rule

The Badges & Achievements System introduces an audited, multi-tier institutional recognition framework for Optimus Orien across five distinct stakeholder categories:
1. **Principals & Institutional Leaders** (Campus attendance benchmarks, academic stewardship, student development, institutional excellence, legacy leadership).
2. **Teachers & Faculty Mentors** (Class attendance consistency, digital record keeping, homework verification, subject specialization, student improvement, master pedagogy).
3. **Students** (First achievement, attendance heroism, verified homework diligence, active classroom participation, term-to-term improvement, subject mastery, all-round excellence).
4. **Quiz Competitors** (Official quiz participation milestones, precision and accuracy tiers, speed scholarships, subject specialisation, continuous learning streaks).
5. **Manual Honours & Commendations** (Conferred exclusively through audited administrative hierarchies with mandatory justification).

### The Golden Rule
> *The existing platform is the source of truth. Award a badge only if its FULL criteria can be computed reliably from data Optimus Orien already stores or derives. No new data collection, no new forms, no estimated or substitute metrics, no silently weakened criteria.*

---

## 2. Architecture & Data Model

### Platform vs. Tenant Scoping
- **Platform-Level Tables (Intentionally Unscoped):**
  - `BadgeDefinition`: Catalog of available badges, slug identifiers, categories, difficulty tiers, asset filenames, and metadata.
  - `BadgeCriteria`: Versioned JSON evaluation rules and threshold parameters (`active=True`, version integer). Configuration never authorizes an uncollected metric.
- **Tenant-Scoped Tables (`school_id` + Row-Level Security):**
  - `AchievementAward`: Idempotent records of earned achievements with evidence data snapshots, criteria version, period identifier, and review flags.
  - `BadgeProgress`: Deterministic, calculable progress records for locked badges (stores real current value vs target threshold; never invented percentages).
  - `BadgeAuditLog`: Comprehensive audit events for automated evaluations, manual conferrals, and review flag actions.

---

## 3. Mathematical Formulas & Engine Rules

### 1. Attendance Rate Formula (Student & School)
Following official Optimus Orien policy from `backend/core/student_views.py`:
$$\text{Denominator} = \max(\text{Total Attendance Records} - \text{Excused Records} - \text{Approved Leave Records}, 0)$$
$$\text{Attendance Rate} = \left(\frac{\text{Present Records} + \text{Late Records}}{\text{Denominator}}\right) \times 100$$
Excused absences and approved medical leaves are strictly excluded from the denominator. Missing days are never treated as present. Minimum data coverage thresholds ($\ge 15$ instructional days for monthly, $\ge 40$ days for term) are enforced.

### 2. Homework Verification Rate
$$\text{Verified Rate} = \left(\frac{\text{Count}(\text{status} = \text{'completed'} \land \text{confirmed\_by} \neq \text{null})}{\text{Count}(\text{Total Assigned Submissions})}\right) \times 100$$
Minimum threshold: $\ge 5$ assigned submissions.

### 3. Active Classroom Participation
Evaluated from `Observation` records where `kind = 'participation'`:
$$\text{Participation Score} = \frac{1}{N} \sum_{i=1}^N \text{value}_i \quad (\text{scale } 1 \dots 10, N \ge 4)$$

### 4. Non-Revocation Guarantee
Earned badges are **never revoked automatically**. If a subsequent examination mark correction or attendance adjustment reduces a user's metric below the qualifying threshold, the system flags `review_flag = True` with `review_reason` and alerts administrators in `BadgeAuditLog` for human review.

### 5. Idempotency
Repeated evaluation runs check `AchievementAward.objects.filter(user=user, badge=badge, period_identifier=period_identifier).exists()`. Duplicate awards are strictly prevented.

---

## 4. Safety & Privacy Guardrails

1. **Student Privacy (Rule 7):**
   - Student badges and progress are strictly visible only to:
     - The student themselves (`request.user.student_record.id == student_id`)
     - Linked guardians (`request.user in student.guardians.all()`)
     - Authorized staff of their own school (`request.user.school_id == student.school_id`)
   - Cross-school staff and student peers receive `403 Forbidden`.
   - No public student rankings, badges leaderboards, or shaming metrics.
2. **Teacher & Principal Positive Recognition:**
   - Accolades serve developmental and positive recognition purposes only; never public shaming, punitive tracking, or compensation indexing.
3. **Protected Data Sources:**
   - `PsychologicalEvaluation` data is **strictly forbidden** and never read by the Badges Engine.

---

## 5. API Endpoints

- `GET /api/v1/badges/catalogue/`: Returns all 47 approved badge definitions and criteria versions.
- `GET /api/v1/badges/my/`: Returns earned awards, tier breakdown summary, and calculable progress for locked badges.
- `GET /api/v1/badges/student/<int:student_id>/`: Scoped student achievements endpoint with strict privacy validation.
- `GET /api/v1/badges/school-summary/`: Campus summary aggregated by tier and category for school leaders.
- `POST /api/v1/badges/confer-manual/`: Hierarchical manual accolade conferral with mandatory justification ($\ge 10$ chars).
- `GET /api/v1/badges/reviews/`: Administrative view for review-flagged awards.
- `POST /api/v1/badges/resolve-review/`: Administrative review flag resolution.
- `POST /api/v1/badges/evaluate-trigger/`: On-demand evaluation trigger following published examination results.
