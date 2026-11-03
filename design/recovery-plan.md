# OPTIMUS ORIEN — Disaster Recovery, Backup & Business Continuity Plan

**Document Version:** 1.0  
**Target Architecture:** Multi-Tenant SaaS Educational ERP (500 to 1,000+ students per campus)  
**Target Stack:** PostgreSQL 16+ (Neon Pooled Architecture), Render Web/Workers, S3/Cloud Storage  
**Compliance Standard:** ISO 27001 / SOC 2 Type II / GDPR Educational Data Privacy  
**Classification:** Internal Confidential (Zero Secrets / Sanitized Specs)

---

## 1. Executive Summary & Continuity Targets

The OPTIMUS ORIEN educational platform serves as the mission-critical system of record for student academic transcripts, attendance rosters, examination results, fee billing, and behavioral evaluations. This document defines the backup cadence, tested disaster recovery playbooks, per-school export/deletion procedures, and provider verification requirements.

### Target Recovery Metrics
| Metric | Target | Description |
| :--- | :--- | :--- |
| **RPO (Recovery Point Objective)** | **< 15 minutes** | Maximum allowable data loss during a catastrophic outage or cluster loss. |
| **RTO (Recovery Time Objective)** | **< 30 minutes** | Maximum allowable downtime from disaster declaration to full platform readiness. |
| **Data Integrity Verification** | **100% Zero Corruption** | Enforced via foreign key constraints, checksum verification, and deep readiness probes. |
| **Tenant Isolation Guarantee** | **Absolute Isolation** | Zero cross-tenant data leakage during backups, exports, or restores. |

---

## 2. Backup Strategy & Scheduling

The system employs a multi-tiered defense-in-depth backup topology combining continuous Write-Ahead Log (WAL) archiving, daily immutable logical snapshots, and cross-region object storage replication.

```
       +-----------------------------------------------------------+
       |                  Optimus Orien System                     |
       +-----------------------------+-----------------------------+
                                     |
             +-----------------------+-----------------------+
             |                                               |
             v                                               v
+--------------------------+                   +--------------------------+
|  Continuous WAL Stream   |                   |   Nightly Logical Dump   |
|   (Neon PITR Engine)     |                   |  (pg_dump Custom Format) |
|   Granularity: Seconds   |                   |    Schedule: 02:00 UTC   |
|   Retention: 14-30 Days  |                   |   Retention: 30D/12M/7Y  |
+--------------------------+                   +--------------------------+
             |                                               |
             +-----------------------+-----------------------+
                                     |
                                     v
                       +---------------------------+
                       | Encrypted Backup Bucket   |
                       | (AES-256, WORM Immutable, |
                       | Cross-Region Replication) |
                       +---------------------------+
```

### 2.1 Continuous Point-in-Time Recovery (PITR)
- **Engine:** Neon Continuous WAL Streaming & Copy-on-Write Storage.
- **Granularity:** Sub-second recovery timestamps.
- **Retention Window:** 14 days on Stage 1; 30 days on Stage 2.
- **Purpose:** Immediate recovery against accidental bulk updates, malicious software flaws, or bad database migrations.

### 2.2 Nightly Encrypted Logical Dumps (`pg_dump`)
- **Execution:** Automated Render Cron Job running at `02:00 AM UTC` (lowest traffic window across supported school regions).
- **Command Specification:**
  ```bash
  pg_dump --format=custom \
          --compress=6 \
          --no-owner \
          --no-privileges \
          --file="/tmp/optimus_backup_${TIMESTAMP}.dump" \
          "$DATABASE_URL"
  ```
- **Encryption at Rest:** Uploaded dump files are client-side encrypted via AES-256-GCM before transport.
- **Storage Tier:** Dedicated off-site cloud storage bucket (AWS S3 / Cloudflare R2) located in an independent cloud region from the primary database.
- **WORM Immutability (Object Lock):** Backup bucket enforces S3 Object Lock in Compliance Mode for 30 days to guarantee protection against ransomware or rogue administrator deletion.
- **Snapshot Retention Schedule:**
  - *Daily Snapshots:* Kept for 30 days.
  - *Monthly Snapshots:* Captured on the 1st of each month, retained for 12 months.
  - *Annual Snapshots:* Captured on the close of each academic fiscal year, retained for 7 years (statutory requirement).

### 2.3 Object Storage Assets (Challan PDFs, Report Cards, Photos)
- **Bucket Versioning:** Enabled on all private storage buckets.
- **Replication:** Asynchronous Cross-Region Replication (CRR) mirroring assets to a secondary failover region within 15 minutes of upload.

---

## 3. Step-by-Step Tested Restore Procedure

### Scenario A: Full Disaster Recovery (Cluster Rebuild)
Used if the primary database cluster is destroyed, corrupted, or unavailable.

1. **Provision New Target PostgreSQL Instance:**
   - Deploy new Neon/PostgreSQL 16 instance in target region.
   - Verify network security groups and SSL enforcement (`sslmode=require`).

2. **Download & Decrypt Verified Snapshot:**
   ```bash
   aws s3 cp s3://optimus-backups-immutable/dumps/optimus_backup_latest.dump.enc /tmp/backup.dump.enc
   # Decrypt using secure vault key stored in CI/CD secret manager
   openssl enc -d -aes-256-cbc -pbkdf2 -in /tmp/backup.dump.enc -out /tmp/backup.dump -k "$BACKUP_ENCRYPTION_KEY"
   ```

3. **Execute High-Speed Parallel Restore:**
   ```bash
   pg_restore --clean \
              --if-exists \
              --no-owner \
              --no-privileges \
              --jobs=4 \
              --dbname="$NEW_DATABASE_URL" \
              /tmp/backup.dump
   ```

4. **Execute Post-Restore Schema Verification:**
   ```bash
   python manage.py showmigrations
   python manage.py check --deploy
   ```

5. **Verify Deep System Health & Connectivity:**
   Invoke the deep readiness endpoint:
   ```bash
   curl -f http://127.0.0.1:8000/api/health/ready/
   ```
   **Expected Response (HTTP 200):**
   ```json
   {
     "status": "ready",
     "service": "optimus-orien",
     "checks": {
       "database": "connected",
       "pending_migrations": 0,
       "migration_status": "up_to_date",
       "cache": "operational"
     }
   }
   ```

6. **Cut Over Traffic:**
   - Update Render web service `DATABASE_URL` to point to the newly restored instance.
   - Purge entire Redis/Django cache (`queryCache.clear()` and `cache.clear()`).
   - Monitor `/api/health/ready/` across all instances.

---

### Scenario B: Point-in-Time Recovery Rollback
Used if an accidental operation occurred at `14:32:00 UTC` (e.g. invalid bulk marks overwrite).

1. In the Neon Management Console or via Neon CLI:
   ```bash
   neon branches create \
     --project-id "$PROJECT_ID" \
     --name "recovery-point-1430" \
     --as-of "2026-11-03T14:30:00Z"
   ```
2. Inspect the recovered data in read-only mode to confirm record integrity.
3. Switch connection pooler endpoint to the recovered branch. Downtime: under 3 minutes.

---

## 4. Multi-Tenant Operations: Per-School Export & Deletion

In a SaaS multi-tenant platform, schools may request a complete export of their operational data (e.g. upon contract expiration) or mandate permanent GDPR deletion.

### 4.1 Per-School Data Export Protocol
The export utility operates strictly within the tenant scope:

```
[Request Per-School Export (school_id)]
                 │
                 ▼
[Validate Organisation Admin / Platform Landlord Permissions]
                 │
                 ▼
[Execute Scoped Tenant Extraction (school_id)]
  ├── School, Campuses & Academic Years
  ├── Classes, Sections, Subjects, Teachers
  ├── Students & Active Enrollments
  ├── Guardian Profiles & Verified Relationships
  ├── Complete Attendance History
  ├── Examination Marks & Published Report Cards
  └── Fee Ledgers, Invoices & Receipt History
                 │
                 ▼
[Bundle into Encrypted ZIP: JSON Schemas + Excel/CSV Ledgers]
                 │
                 ▼
[Generate Time-Limited Signed S3 URL (Expires in 24 Hours)]
```

### 4.2 Per-School Deletion Protocol (GDPR / Contract Termination)
To prevent accidental data loss, deletion follows a 2-stage lifecycle:

1. **Stage 1 — Soft Deactivation (Quarantine for 30 Days):**
   - The school's `active` flag is set to `False`.
   - All student, teacher, and parent logins belonging to this campus are immediately revoked:
     ```python
     User.objects.filter(school_id=target_school_id).update(is_active=False)
     ```
   - Invalidate all cached dashboard and AQI entries:
     ```python
     invalidate_school_cache(target_school_id)
     ```

2. **Stage 2 — Permanent Hard Deletion:**
   - Executed only after formal authorization and expiration of the 30-day quarantine.
   - Deletion occurs in a single database transaction ordered to respect referential integrity without orphan records:
     ```python
     with transaction.atomic():
         # 1. Background Jobs
         BackgroundJob.objects.filter(school_id=sid).delete()
         # 2. Daily Attendance & Staff Logs
         Attendance.objects.filter(school_class__school_id=sid).delete()
         StaffAttendance.objects.filter(school_id=sid).delete()
         # 3. Marks & Academic Results
         ExamStudentMark.objects.filter(school_class__school_id=sid).delete()
         Grade.objects.filter(assessment__school_class__school_id=sid).delete()
         Assessment.objects.filter(school_class__school_id=sid).delete()
         # 4. Financial Records
         FeePayment.objects.filter(school_id=sid).delete()
         StudentFee.objects.filter(student__school_id=sid).delete()
         FeeHead.objects.filter(school_id=sid).delete()
         # 5. Enrollments & Students
         GuardianRelationship.objects.filter(student__school_id=sid).delete()
         Enrollment.objects.filter(school_class__school_id=sid).delete()
         Student.objects.filter(school_id=sid).delete()
         # 6. Academic Structure
         Subject.objects.filter(school_id=sid).delete()
         SchoolClass.objects.filter(school_id=sid).delete()
         AcademicYear.objects.filter(school_id=sid).delete()
         # 7. Staff & Campus
         StaffMember.objects.filter(school_id=sid).delete()
         User.objects.filter(school_id=sid).delete()
         School.objects.filter(id=sid).delete()
     ```
   - **Object Storage Cleanup:** Asynchronously purge all S3 objects under prefix `schools/{school_id}/*`.

---

## 5. Cloud Provider Verification Checklist

The platform administrator must verify the following settings on external infrastructure providers:

| Provider | Component | Configuration Setting | Verification Method |
| :--- | :--- | :--- | :--- |
| **Neon** | Connection Pooler | Transaction mode enabled (Port 6543) | `SHOW pool_mode;` returns `transaction` |
| **Neon** | Server-Side Cursors | Disabled | Django setting `DISABLE_SERVER_SIDE_CURSORS = True` |
| **Neon** | Continuous WAL | Retention set to 14+ days | Neon Console > Settings > History Retention |
| **Neon** | Cold-Start Timeout | Connection timeout = 10s | Django `connect_timeout: 10` in DB options |
| **Render** | Health Probe | Path: `/api/health/ready/` | Render Service > Health Check Path |
| **Render** | Worker Threads | 4 workers x 2 threads (`gthread`) | Verify `WEB_CONCURRENCY=4`, `GUNICORN_THREADS=2` |
| **Render** | Request Timeout | 30 seconds enforced | Gunicorn `timeout = 30` in `gunicorn.conf.py` |
| **Cloud Storage** | Object Immutability | S3 Object Lock Compliance Mode | Bucket Properties > Object Lock: Enabled |
| **Cloud Storage** | Encryption | AES-256 / AWS-KMS | Bucket Properties > Default Encryption |

---

## 6. Bi-Annual Disaster Recovery Fire Drill
A scheduled fire drill is conducted twice every calendar year (prior to the beginning of Fall and Spring academic terms):
1. A fresh database snapshot is restored into an isolated staging environment.
2. The entire test suite (`python manage.py test`) is executed against the restored staging database.
3. End-to-end multi-tenant isolation tests and query budget benchmarks are verified.
4. Total elapsed restore time is logged and certified against the 30-minute RTO requirement.
