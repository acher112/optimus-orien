# Optimus Orien Public Directory & Campus Leaderboard ("Find a School")
## Comprehensive Architecture, Data Model, API Contracts & Implementation Plan

---

### Executive Overview & Strategic Purpose
The **"Find a School" Public Campus Directory & Leaderboard** enables parents, students, and prospective education communities to discover and evaluate Optimus Orien registered campuses based on objective, standardized academic performance metrics (Academic Quality Index - AQI).

This directory is built with strict privacy, security, and ethical boundaries:
1. **Voluntary Opt-In with Two-Tier Governance**: No campus appears publicly by default. A campus is listed only when its school owner / org admin explicitly opts in and signs a versioned consent agreement, followed by manual review and approval by a platform administrator.
2. **Instant Revocation**: A school owner can unpublish their listing instantly with immediate effect (cache invalidation). A platform admin can also unpublish or reject listings with an audited reason.
3. **Pure Aggregate Academic Performance**: Public performance scores are derived solely from published curriculum assessments computed by the central AQI service. Under no circumstance are student names, teacher names, attendance records, disciplinary observations, psychological evaluations, or intervention cases exposed.
4. **Positive Framing & Constructive Labels**: Performance scores are accompanied by positive tier labels (*Outstanding*, *Strong*, *Steady*, *Developing*, or *Not ranked yet (not enough published data)*). Negative, punitive, or diagnostic labels (such as "Needs focused support" or "At-risk") are strictly barred from public payloads.
5. **Reproducible Immutable Snapshots**: Public ranks are served from immutable, platform-level pre-computed snapshots generated per published assessment period. Live requests never trigger heavy queries across multi-tenant tables.
6. **Principal & Contact Privacy**: Contact information and personal principal details are protected against automated scraping. Official phone numbers and emails are never present in the initial page HTML or search responses; they are revealed on demand via rate-limited, bot-protected endpoints. Principal names and direct contacts are displayed only with explicit, individual principal consent.
7. **Strict Multi-Tenant Database Boundary**: Public endpoints query only platform-level, intentionally unscoped public tables. Public endpoints never interact with tenant tables and never bypass Row-Level Security (RLS).

---

### 1. Architectural Decisions & Governance Principles

#### 1.1 Opt-in and Approval Workflow
- **Default State**: OFF (`status = 'draft'`).
- **School Submission**: An authorized campus owner or organisation admin activates "Public Listing" after reviewing and agreeing to the versioned Public Listing Agreement. The action records the consenting user's ID, timestamp, IP address, and consent text version. Status transitions to `pending_approval`.
- **Platform Moderation**: A platform administrator reviews the submission in the moderation queue and can:
  - **Approve**: Sets status to `live`, marks `approved_by` and `approved_at`, triggers snapshot association.
  - **Reject**: Sets status to `rejected`, records mandatory `rejection_reason`. The school can revise and resubmit.
- **Unpublishing**:
  - **School Owner**: Can toggle listing to `unpublished` instantly at any time.
  - **Platform Admin**: Can unpublish an active listing with an administrative reason.
  - In both cases, status is set to `unpublished`, and any public cache or search index entry is invalidated immediately.

#### 1.2 Performance Metric: Optimus Orien AQI
- Derived from published subject examination results only via `core.services.aqi_engine`.
- Public presentation:
  - Numerical AQI score (0.00 – 100.00) rounded for display to two decimal places.
  - Qualitative positive band:
    - **Outstanding**: AQI ≥ 80.00%
    - **Strong**: 70.00% ≤ AQI < 80.00%
    - **Steady**: 60.00% ≤ AQI < 70.00%
    - **Developing**: 50.00% ≤ AQI < 60.00% (or < 50.00% when eligible)
    - **Not ranked yet (not enough published data)**: Displayed when minimum data thresholds are not met.
- No attendance, behavior, fee status, or psychological data is included in public metric calculations.

#### 1.3 Snapshot Generation & Freshness
- Snapshots are immutable records tied to a specific academic year and published assessment period.
- Generated via an idempotent management command: `python manage.py refresh_public_snapshots`.
- Each snapshot records:
  - Reference to `PublicCampusListing`
  - Period identifier (e.g., `"2025-2026 Term 2"`)
  - AQI score and band
  - Student count and published assessment count
  - Eligibility determination and reasons
  - AQI engine version tag
  - Previous period score and score change delta (for "Most Improved" leaderboard)
  - Pre-computed competition ranks (Overall, Country, Province, City, Board, Level)
  - Generation timestamp

#### 1.4 Eligibility Thresholds
Configurable via `PlatformPublicDirectoryConfig` (seeded with production defaults):
1. **Minimum Active Students**: ≥ 15 students enrolled during the assessment period.
2. **Minimum Published Assessments**: ≥ 2 published assessments in the period.
3. **Minimum Subjects Covered**: ≥ 3 core subjects with published results.
4. **Data Freshness**: Assessment period published within the last 12 months.
Campuses falling below any threshold are marked `is_eligible = False` and receive the status `"Not ranked yet (not enough published data)"`. They appear in the directory if approved, but are excluded from numerical ranking positions.

#### 1.5 Ranking Rules & Display Options
- **Sorting**: Descending by AQI score.
- **Ties**: Competition ranking (`1, 2, 2, 4`), preserving ordinal integrity.
- **Boards Supported**:
  - Overall (Platform-wide)
  - By Country (e.g., Pakistan, United Kingdom, UAE)
  - By Province / State (e.g., Punjab, Sindh, Greater London)
  - By City (e.g., Lahore, Karachi, Islamabad, London)
  - By Examination Board (e.g., Federal Board, Punjab Board, Cambridge Assessment International, Edexcel, Aga Khan Board)
  - By Level (Primary, Middle, Secondary, Higher Secondary)
  - **Most Improved**: Ranked by positive AQI score delta compared to the previous snapshot period.
- **Campus Presentation Mode**:
  - `exact_rank`: Displays exact numerical rank (e.g., "#3 in Lahore").
  - `tier_only`: Displays quartile / percentile tier (e.g., "Top 10%", "Top 25%").
  - `unranked_listing`: Displays score, positive band, and profile without comparative numerical rank.

#### 1.6 Honesty Statement & Methodology Disclaimers
Mandatory text rendered on `/schools/methodology` and linked on all card/profile footers:
> *"The Optimus Orien Academic Quality Index (AQI) is an objective, mathematical metric derived directly from participating schools' verified and published internal examination results. Grading scales, intake selectivity, curriculum frameworks, and socioeconomic factors vary across institutions. Rankings published on this platform represent comparative academic metrics within participating Optimus Orien campuses and do not constitute an external inspection, accreditation, or endorsement of overall educational quality."*

#### 1.7 Privacy, Contact Protection & Bot Defenses
- **Principal Name**: Displayed only if the principal authenticated into their Optimus Orien account and agreed to a specific `principal_name` consent declaration.
- **Direct Principal Contact**: Displayed only if the principal explicitly agreed to `principal_contact` consent.
- **Contact Channels**:
  - `enquiry_form` (Default): Built-in parent enquiry form routed securely to school portal.
  - `official_contact`: Campus phone and email.
  - `principal_direct`: Principal personal phone and email (only with explicit consent).
- **Anti-Scraping Shield**:
  - Phone and email are **never** present in the HTML response, list payloads, or sitemap.
  - Visitors must click "Reveal Contact" which triggers `POST /api/v1/public/schools/<slug>/reveal-contact/`.
  - Rate-limited to 5 requests per minute per IP address.
  - Audit logged in `PublicListingEvent`.
- **Enquiry Form Protection**:
  - Honeypot hidden input field (rejects spam bots filling invisible fields).
  - Rate-limited to 3 enquiries per hour per IP.
  - Stored in `PublicEnquiry` with an automatic 90-day retention purge via management command.
  - Campuses can access only their own enquiries through their tenant-authenticated portal.

---

### 2. Complete Data Model Schema

#### 2.1 Platform-Level Unscoped Models (`backend/core/models.py`)

```python
# --------------------------------------------------------------------------
# Public Directory & Leaderboard (Platform-Level, Unscoped)
# --------------------------------------------------------------------------

class PlatformPublicDirectoryConfig(models.Model):
    """Platform-level thresholds for directory eligibility and data retention."""
    min_active_students = models.PositiveIntegerField(default=15)
    min_published_assessments = models.PositiveIntegerField(default=2)
    min_subjects_covered = models.PositiveIntegerField(default=3)
    data_freshness_months = models.PositiveIntegerField(default=12)
    enquiry_retention_days = models.PositiveIntegerField(default=90)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Public Directory Config"


class PublicCampusListing(models.Model):
    """
    Authoritative, platform-level public listing for an enrolled campus.
    Intentionally unscoped to enable safe, high-speed public queries without RLS overhead.
    """
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('pending_approval', 'Pending Approval'),
        ('live', 'Live'),
        ('unpublished', 'Unpublished'),
        ('rejected', 'Rejected'),
    ]
    GENDER_CHOICES = [
        ('co-ed', 'Co-Education'),
        ('boys', 'Boys Only'),
        ('girls', 'Girls Only'),
    ]
    MEDIUM_CHOICES = [
        ('english', 'English Medium'),
        ('urdu', 'Urdu Medium'),
        ('bilingual', 'Bilingual'),
    ]
    CONTACT_MODE_CHOICES = [
        ('enquiry_only', 'Enquiry Form Only'),
        ('official_contact', 'Official School Contact'),
        ('principal_direct', 'Principal Direct Contact (Consented)'),
    ]
    RANK_DISPLAY_CHOICES = [
        ('exact_rank', 'Exact Rank (e.g. #3 in City)'),
        ('tier_only', 'Percentile Tier Only (e.g. Top 10%)'),
        ('unranked_listing', 'Listing Without Numerical Rank'),
    ]

    # Core Identifiers
    school = models.OneToOneField('School', on_delete=models.CASCADE, related_name='public_listing')
    slug = models.SlugField(max_length=120, unique=True, db_index=True)
    display_name = models.CharField(max_length=180)
    tagline = models.CharField(max_length=250, blank=True)
    about = models.TextField(max_length=2500, blank=True)
    logo_url = models.URLField(max_length=500, blank=True)

    # Location (Coordinates chosen directly by school via pin-drop)
    country = models.CharField(max_length=80, db_index=True, default='Pakistan')
    province = models.CharField(max_length=80, db_index=True, default='Punjab')
    city = models.CharField(max_length=80, db_index=True, default='Lahore')
    address = models.CharField(max_length=255, blank=True)
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)

    # Academic & Institutional Metadata
    boards = models.JSONField(default=list, help_text="e.g. ['Federal', 'Cambridge', 'Punjab']")
    levels = models.JSONField(default=list, help_text="e.g. ['Primary', 'Middle', 'Secondary']")
    gender_type = models.CharField(max_length=20, choices=GENDER_CHOICES, default='co-ed')
    medium = models.CharField(max_length=20, choices=MEDIUM_CHOICES, default='english')
    established_year = models.PositiveIntegerField(null=True, blank=True)
    facilities = models.JSONField(default=list, blank=True, help_text="e.g. ['Science Lab', 'Library', 'Sports Complex']")
    website = models.URLField(max_length=255, blank=True)
    social_links = models.JSONField(default=dict, blank=True)
    admission_status = models.CharField(max_length=20, choices=[('open', 'Open'), ('closed', 'Closed')], default='open')

    # Principal Privacy & Consent Fields
    principal_name = models.CharField(max_length=120, blank=True)
    principal_title = models.CharField(max_length=80, blank=True, default='Principal')
    show_principal_name = models.BooleanField(default=False)

    # Contact Privacy Fields (Never serialized in list payloads)
    contact_mode = models.CharField(max_length=25, choices=CONTACT_MODE_CHOICES, default='enquiry_only')
    official_phone = models.CharField(max_length=40, blank=True)
    official_email = models.EmailField(blank=True)
    principal_direct_phone = models.CharField(max_length=40, blank=True)
    principal_direct_email = models.EmailField(blank=True)

    # Display & SEO Controls
    rank_display_mode = models.CharField(max_length=25, choices=RANK_DISPLAY_CHOICES, default='exact_rank')
    noindex = models.BooleanField(default=False)

    # Governance & Status
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft', db_index=True)
    approved_by = models.ForeignKey('User', on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    approved_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['display_name']
        indexes = [
            models.Index(fields=['status', 'country', 'city']),
            models.Index(fields=['status', 'admission_status']),
        ]


class PublicRankSnapshot(models.Model):
    """
    Immutable academic performance snapshot generated for a listed campus.
    """
    listing = models.ForeignKey(PublicCampusListing, on_delete=models.CASCADE, related_name='snapshots')
    academic_year = models.CharField(max_length=40)
    period_name = models.CharField(max_length=60, help_text="e.g. 'Term 2 Final' or 'Annual 2025-2026'")
    aqi_score = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    band = models.CharField(max_length=40, default='Not ranked yet (not enough published data)')
    aqi_config_version = models.CharField(max_length=20, default='v1.0')

    # Auditing & Statistical Basis
    student_count = models.PositiveIntegerField(default=0)
    assessment_count = models.PositiveIntegerField(default=0)
    subjects_count = models.PositiveIntegerField(default=0)
    is_eligible = models.BooleanField(default=False)
    eligibility_reasons = models.JSONField(default=list, blank=True)

    # Competition Ranks (Ties: 1, 2, 2, 4)
    rank_overall = models.PositiveIntegerField(null=True, blank=True)
    rank_country = models.PositiveIntegerField(null=True, blank=True)
    rank_province = models.PositiveIntegerField(null=True, blank=True)
    rank_city = models.PositiveIntegerField(null=True, blank=True)
    rank_board = models.JSONField(default=dict, blank=True)
    rank_level = models.JSONField(default=dict, blank=True)
    rank_tier = models.CharField(max_length=30, blank=True)

    # Delta for 'Most Improved' Leaderboard
    previous_aqi_score = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    score_delta = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)

    generated_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ['-generated_at']
        indexes = [
            models.Index(fields=['is_eligible', '-aqi_score']),
            models.Index(fields=['listing', '-generated_at']),
        ]


class PublicEnquiry(models.Model):
    """
    Minimal parent enquiry for a public campus.
    Retained for 90 days, purged by automated management command.
    """
    STATUS_CHOICES = [
        ('new', 'New'),
        ('contacted', 'Contacted'),
        ('archived', 'Archived'),
    ]
    listing = models.ForeignKey(PublicCampusListing, on_delete=models.CASCADE, related_name='enquiries')
    parent_name = models.CharField(max_length=120)
    phone = models.CharField(max_length=40)
    email = models.EmailField(blank=True)
    child_grade = models.CharField(max_length=50)
    message = models.TextField(max_length=2000)

    # Security & Moderation
    ip_hash = models.CharField(max_length=64, db_index=True)
    user_agent = models.CharField(max_length=255, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='new')
    is_handled = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    retention_expires_at = models.DateTimeField(db_index=True)

    class Meta:
        ordering = ['-created_at']


class PublicListingConsent(models.Model):
    """
    Immutable legal consent audit for public listing and principal privacy choices.
    """
    CONSENT_CHOICES = [
        ('school_publish', 'School Directory Publication Opt-In'),
        ('principal_name', 'Principal Name Disclosure Consent'),
        ('principal_contact', 'Principal Direct Contact Disclosure Consent'),
    ]
    listing = models.ForeignKey(PublicCampusListing, on_delete=models.CASCADE, related_name='consents')
    user = models.ForeignKey('User', on_delete=models.PROTECT, related_name='+')
    consent_type = models.CharField(max_length=30, choices=CONSENT_CHOICES)
    consent_text_version = models.CharField(max_length=30, default='v1.0')
    agreed = models.BooleanField(default=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']


class PublicListingEvent(models.Model):
    """
    Complete audit trail of all governance state transitions and contact reveal events.
    """
    EVENT_CHOICES = [
        ('opt_in_submitted', 'Opt-In Submitted for Approval'),
        ('approved', 'Listing Approved by Platform Admin'),
        ('rejected', 'Listing Rejected by Platform Admin'),
        ('unpublished_by_school', 'Listing Unpublished by School Owner'),
        ('unpublished_by_admin', 'Listing Unpublished by Platform Admin'),
        ('profile_updated', 'Profile Metadata Updated'),
        ('contact_revealed', 'Campus Contact Revealed via Rate-Limited Gate'),
    ]
    listing = models.ForeignKey(PublicCampusListing, on_delete=models.CASCADE, related_name='events')
    actor = models.ForeignKey('User', on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    event_type = models.CharField(max_length=35, choices=EVENT_CHOICES)
    reason = models.TextField(blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
```

#### 2.2 Tenant-Scoped Model (`SchoolPublicProfileDraft`)

```python
class SchoolPublicProfileDraft(models.Model):
    """
    Tenant-scoped working draft for campus public profile configuration.
    Enforces Row-Level Security (RLS) scoped strictly to school_id.
    """
    school = models.OneToOneField('School', on_delete=models.CASCADE, related_name='public_profile_draft')
    display_name = models.CharField(max_length=180, blank=True)
    tagline = models.CharField(max_length=250, blank=True)
    about = models.TextField(max_length=2500, blank=True)
    logo_url = models.URLField(max_length=500, blank=True)

    country = models.CharField(max_length=80, default='Pakistan')
    province = models.CharField(max_length=80, default='Punjab')
    city = models.CharField(max_length=80, default='Lahore')
    address = models.CharField(max_length=255, blank=True)
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)

    boards = models.JSONField(default=list, blank=True)
    levels = models.JSONField(default=list, blank=True)
    gender_type = models.CharField(max_length=20, default='co-ed')
    medium = models.CharField(max_length=20, default='english')
    established_year = models.PositiveIntegerField(null=True, blank=True)
    facilities = models.JSONField(default=list, blank=True)
    website = models.URLField(max_length=255, blank=True)
    social_links = models.JSONField(default=dict, blank=True)
    admission_status = models.CharField(max_length=20, default='open')

    contact_mode = models.CharField(max_length=25, default='enquiry_only')
    official_phone = models.CharField(max_length=40, blank=True)
    official_email = models.EmailField(blank=True)
    rank_display_mode = models.CharField(max_length=25, default='exact_rank')
    is_opted_in = models.BooleanField(default=False)

    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "School Public Profile Draft"
```

*PostgreSQL Row-Level Security (RLS) Policy for `SchoolPublicProfileDraft`:*
```sql
ALTER TABLE core_schoolpublicprofiledraft ENABLE ROW LEVEL SECURITY;
ALTER TABLE core_schoolpublicprofiledraft FORCE ROW LEVEL SECURITY;

CREATE POLICY core_schoolpublicprofiledraft_isolation_policy ON core_schoolpublicprofiledraft
USING (
    NULLIF(current_setting('app.current_school_id', true), '') IS NULL
    OR school_id = NULLIF(current_setting('app.current_school_id', true), '')::integer
    OR current_setting('app.is_platform_admin', true) = 'true'
    OR current_user = 'postgres'
)
WITH CHECK (
    NULLIF(current_setting('app.current_school_id', true), '') IS NULL
    OR school_id = NULLIF(current_setting('app.current_school_id', true), '')::integer
    OR current_setting('app.is_platform_admin', true) = 'true'
    OR current_user = 'postgres'
);

GRANT SELECT, INSERT, UPDATE, DELETE ON core_schoolpublicprofiledraft TO PUBLIC;
```

---

### 3. API Contracts & Endpoint Specifications

#### 3.1 Public Read-Only Endpoints (`/api/v1/public/...`)

1. **Leaderboard & School Search**
   - `GET /api/v1/public/schools/`
   - **Query Parameters**:
     - `q`: Search string (matched case-insensitively against display_name and city).
     - `country`, `province`, `city`: Geographic filters.
     - `board`: e.g. "Federal", "Cambridge".
     - `level`: e.g. "Primary", "Secondary".
     - `gender`: "co-ed", "boys", "girls".
     - `medium`: "english", "urdu", "bilingual".
     - `admission_open`: boolean flag.
     - `sort`: `'rank'`, `'name'`, `'improved'` (score delta), or `'score'`.
     - `page`, `page_size`: Pagination (default 12, max 36).
   - **Response Structure**:
     - `count`, `next`, `previous`, `results`: Array of school cards.
     - **Card Payload**: `slug`, `display_name`, `tagline`, `logo_url`, `city`, `province`, `country`, `boards`, `levels`, `gender_type`, `medium`, `admission_status`, `score` (if display mode allows), `band`, `rank_display_mode`, `rank_overall`, `rank_city`, `score_delta`, `is_eligible`, `principal_name` (only if consented; null otherwise).
     - **Explicit Omission**: `official_phone`, `official_email`, `principal_direct_phone`, `principal_direct_email` are **never** present.

2. **Campus Profile Detail**
   - `GET /api/v1/public/schools/<slug>/`
   - **Response Structure**: Full profile fields including facilities, about, website, social links, latest snapshot score, band description, chronological historical score snapshots, eligibility status, honesty statement link, and coordinates (for the client-side pin).

3. **Comparison Matrix**
   - `GET /api/v1/public/schools/compare/?slugs=school-a,school-b,school-c`
   - **Constraints**: Accepts between 2 and 3 slugs.
   - **Response Structure**: Side-by-side comparison object containing scores, bands, boards, levels, facilities, gender type, medium, and admission status.

4. **Rate-Limited Contact Reveal Gate**
   - `POST /api/v1/public/schools/<slug>/reveal-contact/`
   - **Rate Limit**: 5 calls per minute per IP address.
   - **Payload**: None required.
   - **Response**: `{ "contact_mode": "...", "official_phone": "...", "official_email": "...", "principal_direct_phone": "...", "principal_direct_email": "..." }`.

5. **Parent Enquiry Submission**
   - `POST /api/v1/public/schools/<slug>/enquiry/`
   - **Rate Limit**: 3 calls per hour per IP.
   - **Payload**:
     - `parent_name`: string (max 120)
     - `phone`: string (max 40)
     - `email`: string (optional, max 100)
     - `child_grade`: string (max 50)
     - `message`: string (max 2000)
     - `hp_code`: Honeypot field (must be empty; bot submissions populating it receive silent 201 without DB persistence).
   - **Response**: `{ "success": true, "message": "Enquiry submitted successfully." }`.

6. **Sitemap Index**
   - `GET /api/v1/public/schools/sitemap/`
   - **Response**: List of active slugs with `lastmod` timestamps for search engines (excludes `noindex` listings).

7. **Methodology & Quality Honesty Statement**
   - `GET /api/v1/public/schools/methodology/`
   - **Response**: Live eligibility criteria thresholds, calculation formula explanation, band definitions, update schedules, and privacy guarantees.

#### 3.2 School Portal Endpoints (`/api/v1/schools/<school_id>/...`)
- `GET /api/v1/schools/<school_id>/public-profile/`: Retrieve current draft configuration, live listing state, and approval status.
- `PUT /api/v1/schools/<school_id>/public-profile/`: Save profile draft changes (fields sanitized and length-validated).
- `POST /api/v1/schools/<school_id>/public-profile/submit/`: Submit profile for platform moderation (signs versioned agreement, transitions status to `pending_approval`).
- `POST /api/v1/schools/<school_id>/public-profile/unpublish/`: Instantly unpublish live listing.
- `GET /api/v1/schools/<school_id>/public-enquiries/`: Paginated list of parent enquiries submitted for this campus only.
- `POST /api/v1/schools/<school_id>/public-enquiries/<id>/handle/`: Mark an enquiry as handled/contacted.
- `POST /api/v1/principal/public-directory-consent/`: Endpoint authenticated by the campus principal to toggle `show_principal_name` and `show_principal_direct_contact` with timestamped audit trail.

#### 3.3 Platform Admin Endpoints (`/api/v1/admin/public-directory/...`)
- `GET /api/v1/admin/public-directory/listings/?status=pending_approval`: Moderation queue.
- `POST /api/v1/admin/public-directory/listings/<id>/approve/`: Approve listing for publication.
- `POST /api/v1/admin/public-directory/listings/<id>/reject/`: Reject with reason.
- `POST /api/v1/admin/public-directory/listings/<id>/unpublish/`: Administratively take down a live listing.
- `GET /api/v1/admin/public-directory/config/`: View platform eligibility criteria & retention settings.
- `PUT /api/v1/admin/public-directory/config/`: Update platform eligibility criteria & retention settings.
- `POST /api/v1/admin/public-directory/trigger-snapshot/`: Trigger immediate execution of snapshot recalculation.

---

### 4. Screen Architecture & Design System Integration

```
+-------------------------------------------------------------------------------------------------+
|                                     OPTIMUS ORIEN NAV                                           |
|  [Logo] Optimus Orien   Academics   Examinations   Find a School (اسکول تلاش کریں)   [Sign In]  |
+-------------------------------------------------------------------------------------------------+
|                                                                                                 |
|   HERO: Discover Top Performing Campuses                                                        |
|   Transparent, objective academic quality rankings derived from verified curriculum results.   |
|   [ 🔍 Search school name, city, or board...              ] [ Filter By City/Board ▾ ]         |
|                                                                                                 |
|   +-----------------------------------------------------------------------------------------+   |
|   |                                  TOP 3 PODIUM                                           |   |
|   |          #2 Crescent Academy            #1 Falcon Grammar          #3 Beacon Heights    |   |
|   |               AQI: 91.4%                   AQI: 94.8%                  AQI: 89.2%       |   |
|   |              [Strong Band]              [Outstanding Band]            [Strong Band]     |   |
|   +-----------------------------------------------------------------------------------------+   |
|                                                                                                 |
|   FILTER BAR: [Country: All ▾] [City: All ▾] [Board: All ▾] [Level: All ▾] [Mode: List | Map]   |
|                                                                                                 |
|   CAMPUS CARDS GRID:                                                                            |
|   +---------------------------------------+  +---------------------------------------+          |
|   | #1  Falcon Grammar Campus, Lahore     |  | #2  Crescent Academy, Islamabad       |          |
|   | Verified on Optimus Orien ✓           |  | Verified on Optimus Orien ✓           |          |
|   | AQI Score: 94.8% [Outstanding]        |  | AQI Score: 91.4% [Outstanding]        |          |
|   | Boards: Cambridge, Federal            |  | Boards: Federal Board                 |          |
|   | Principal: Dr. Arsalan Niazi (Consented)|  | Principal: Contact via Campus         |          |
|   | Status: Admission Open 🟢              |  | Status: Admission Closed              |          |
|   | [ View Profile ]  [ View Contact ]    |  | [ View Profile ]  [ View Contact ]    |          |
|   +---------------------------------------+  +---------------------------------------+          |
|                                                                                                 |
+-------------------------------------------------------------------------------------------------+
```

#### 4.1 Screen Directory & Capabilities
1. **Public Schools Directory (`/schools`)**:
   - Hero search input and active filter badges.
   - Interactive Podium for Top 3 campuses.
   - Campus cards with AQI gauge, band badge, location with country flag, board tags, and admission badge.
   - Interactive Map toggle with colored pins matching performance bands (Green: Outstanding, Blue: Strong, Amber: Steady, Light Purple: Developing).
   - "Compare" floating drawer allowing selection of up to 3 campuses.
2. **Campus Profile (`/schools/[slug]`)**:
   - Header with campus badge, verified seal, and overall rank.
   - Score history trend sparkline across published terms.
   - About, facilities checklist, board curriculum tags.
   - Location interactive pin map.
   - Direct enquiry drawer / modal.
   - "Reveal Official Contact" button triggering audited, rate-limited revelation.
3. **Compare Campuses (`/schools/compare`)**:
   - Side-by-side columnar comparison of 2 or 3 selected institutions.
4. **Methodology & Quality Honesty Statement (`/schools/methodology`)**:
   - Transparent explanation of AQI formulation, positive band intervals, eligibility conditions, data privacy, and removal instructions.
5. **School Portal: Public Profile Editor (`/app/public-profile`)**:
   - Two-pane editor with live card and profile preview.
   - Map coordinate picker.
   - Contact mode selector and principal consent indicator.
   - Immediate "Unpublish" button and "Submit for Approval" modal.
   - Parent enquiry management table.
6. **Platform Admin: Moderation Queue (`/app/admin/public-directory`)**:
   - Tabbed queue (Pending, Live, Rejected, Unpublished).
   - Side-by-side profile diff viewer.
   - One-click approve, reject with reason, or unpublish.
   - Snapshot recalculation trigger and eligibility threshold editor.

---

### 5. Implementation Order & Phasing

- **Stage 0**: Inventory & Architecture Plan (`design/public-directory/plan.md`) [CURRENT]
- **Stage 1**: Backend Implementation & Comprehensive Automated Tests:
  - Platform-level unscoped models & tenant-scoped draft model with Postgres RLS.
  - Idempotent snapshot calculation service & eligibility evaluator.
  - REST endpoints for public directory, school profile management, and platform moderation.
  - Rate limiting, honeypot validation, and 90-day enquiry retention purge command.
  - Fictional data seed command (20 campuses across 3 countries; strictly fictional names).
  - Test suite covering opt-in governance, RLS isolation, ranking ties, principal privacy, rate limiting, and banned-word neutrality scan.
- **Stage 2**: Public UI, School-Side & Platform-Admin Pages:
  - Public `/schools`, `/schools/[slug]`, `/schools/compare`, `/schools/methodology` pages.
  - School portal public profile editor, map picker, and enquiry inbox.
  - Platform admin moderation dashboard and snapshot controls.
  - Playwright end-to-end test verification.

---

### 6. Effort Estimation in Working Days

| Workstream | Best Case | Likely Case | Worst Case |
| :--- | :---: | :---: | :---: |
| **Stage 1: Backend Data Models & Migrations** | 0.5 days | 1.0 days | 1.5 days |
| **Stage 1: Snapshot Engine, Ranking Math & Eligibility Service** | 1.0 days | 1.5 days | 2.5 days |
| **Stage 1: Public, School & Admin REST APIs** | 1.0 days | 1.5 days | 2.0 days |
| **Stage 1: Security, Rate Limits, Honeypot & Commands** | 0.5 days | 1.0 days | 1.5 days |
| **Stage 1: Automated Test Suite & Neutrality Scanner** | 1.0 days | 1.5 days | 2.0 days |
| **Stage 2: Public UI (Leaderboard, Profile, Compare, Methodology)** | 1.5 days | 2.5 days | 3.5 days |
| **Stage 2: School Portal & Platform Admin Moderation Pages** | 1.0 days | 2.0 days | 2.5 days |
| **Stage 2: E2E Playwright Tests & Mobile Responsive Polish** | 1.0 days | 1.5 days | 2.0 days |
| **Total Cumulative Effort** | **7.5 days** | **12.5 days** | **17.5 days** |

---
*Status: Stage 0 Plan Approved. Proceeding immediately to Stage 1 Backend Implementation & Tests without stopping.*
