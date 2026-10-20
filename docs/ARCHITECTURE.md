# Architecture reference

## Entity relationships (simplified)

```mermaid
erDiagram
 ORGANISATION ||--o{ SCHOOL : owns
 SCHOOL ||--o{ ACADEMIC_YEAR : configures
 SCHOOL ||--o{ SUBJECT : teaches
 SCHOOL ||--o{ STUDENT : enrolls
 SCHOOL ||--o{ SCHOOL_CLASS : contains
 ACADEMIC_YEAR ||--o{ SCHOOL_CLASS : schedules
 USER ||--o{ SCHOOL_CLASS : teaches
 STUDENT ||--o{ ENROLLMENT : has
 SCHOOL_CLASS ||--o{ ENROLLMENT : holds
 SCHOOL_CLASS ||--o{ ASSESSMENT : schedules
 SUBJECT ||--o{ ASSESSMENT : covers
 ASSESSMENT ||--o{ GRADE : contains
 STUDENT ||--o{ GRADE : receives
 STUDENT ||--o{ ATTENDANCE : records
 SCHOOL_CLASS ||--o{ HOMEWORK : assigns
 HOMEWORK ||--o{ HOMEWORK_SUBMISSION : receives
 STUDENT ||--o{ REVIEW_CASE : opens
 REVIEW_CASE ||--o{ INTERVENTION : tracks
 USER ||--o{ NOTIFICATION : receives
```

## Request flow

`Browser → /api/v1 → Django session/CSRF middleware → DRF authenticated route → scoped queryset → validated Django model → SQLite (development) / PostgreSQL (production)`.

## Module layout

`backend/core/models.py`: relational structures; `backend/core/views.py`: serializers, scoped resources, dashboard/reports; `backend/core/management/commands/seed_demo.py`: development fixtures; `backend/core/tests`: initial isolation tests; `frontend/src/main.tsx`: typed UI/screens; `frontend/src/api.ts`: typed HTTP functions; `frontend/src/style.css`: responsive design system.

This is a small monolith rather than a microservice system. No background queues, object store or third-party data exchange is implemented. Add these after operational requirements and data-governance rules have been established.
