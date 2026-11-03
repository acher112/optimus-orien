OPTIMUS ORIEN
PSYCHOLOGICAL EVALUATION MODULE
Developer Implementation Specification — Version 1.0

1. Module Overview
Add a separate sidebar module named Psychological Evaluation.
Purpose:
- Conduct weekly teacher-led student behavioural and developmental observations.
- Track changes in student behaviour and learning-related habits over time.
- Identify students who may benefit from additional guidance or support.
- Provide a visual profile using a six-dimensional radar (spider-web) chart.
- Allow authorized users to review evaluations according to the existing school hierarchy.
IMPORTANT: This module is a school-based behavioural observation and student development system. It is not a clinical psychological assessment, diagnostic instrument, or personality test.
Do not generate diagnoses, clinical labels, mental health classifications, or claims about fixed personality traits.

2. User Access Hierarchy
Implement the following permissions:
System Administrator
- Can view evaluations across all schools and campuses.
- Can filter by school, campus, academic year, class, section, student, teacher, gender, and date.
- Can view individual student histories and aggregate reports.
- Can access system-wide evaluation statistics.
School Principal
- Can view evaluations belonging to their assigned school only.
- Can view all campuses, classes, teachers, and students within their school.
- Can view individual student histories and school-level trends.
- Cannot access another school's records.
Class Teacher
- Can evaluate students in their assigned class and sections.
- Can view evaluation histories of students in their assigned class.
- Can view the student's overall behavioural development profile.
- Cannot access students outside their assigned classes.
Subject Teacher
- Can evaluate students in classes and subjects assigned to them.
- Can view their own submitted evaluations.
- Can view the relevant student's development profile only where school permissions allow it.
- Cannot evaluate students outside their assigned teaching assignments.
Student
- Can view only their own published evaluation profile.
- Can view their own historical development trends.
- Cannot see teacher-only notes, internal flags, other students' evaluations, or confidential referrals.
- Cannot edit submitted evaluations.
All access must be enforced server-side, not merely by hiding frontend navigation items.

3. Weekly Evaluation Questionnaire
Create an original 18-item observation questionnaire.
Administration instructions displayed to teachers:
"Evaluate the student's observable behaviour during the previous five school days. Base your responses on actual interactions and classroom observations. Do not make assumptions about the student's personality, family circumstances, mental health, or behaviour outside the setting you observed."
Use the following five-point Likert frequency scale:
1 — Never observed
2 — Rarely observed
3 — Sometimes observed
4 — Frequently observed
5 — Consistently observed
Provide an additional option: Not Observed / Insufficient Opportunity
This option must be stored as null and excluded from scoring. It must never be treated as zero.
Dimension A: Learning Engagement
1. Participates in classroom learning activities.
2. Shows interest or curiosity when introduced to new topics.
3. Makes an effort to continue working when a learning task becomes challenging.
Dimension B: Self-Regulation
4. Maintains attention during appropriate learning activities.
5. Follows classroom instructions and agreed routines.
6. Manages impulses in a way that supports learning and classroom activities.
Dimension C: Emotional Regulation
7. Responds constructively when facing mistakes or setbacks.
8. Communicates feelings in an appropriate and understandable way.
9. Uses appropriate strategies to regain focus after becoming upset or frustrated.
Dimension D: Social Interaction
10. Treats classmates and teachers with respect.
11. Cooperates with others during group activities.
12. Demonstrates consideration for other people's feelings and perspectives.
Dimension E: Responsibility & Independence
13. Takes responsibility for assigned tasks.
14. Makes an effort to complete work within reasonable timeframes.
15. Takes care of personal learning materials and shared classroom resources.
Dimension F: Communication & Help-Seeking
16. Expresses ideas, questions, or needs clearly.
17. Seeks assistance when experiencing difficulty with a task.
18. Listens to feedback and makes an effort to respond constructively.
All statements must remain positively framed. Avoid questions that label a student as aggressive, lazy, antisocial, disobedient, unstable, or similar.

4. Questionnaire Administration
- One evaluation period per school week.
- Class teachers and subject teachers can submit separate evaluations.
- Each evaluation must record the teacher, student, class, subject (where applicable), observation context, and evaluation week.
- A teacher must only evaluate students they are authorized to teach.
- Subject teachers should evaluate only behaviours they have had a reasonable opportunity to observe in their subject setting.
- Class teachers may complete the broader classroom observation questionnaire.
- A teacher must not be forced to answer items they have not had an opportunity to observe.
- Allow draft saving and later submission.
- Submitted evaluations become immutable records. Corrections must be recorded as amendments with an audit trail.
- Prevent duplicate submissions by the same teacher for the same student, evaluation period, and observation context unless an authorized revision is made.
Optional teacher reflection:
- Student strengths observed this week.
- Area where the student may benefit from support.
- Suggested classroom support action.
These fields should be brief, factual, and non-diagnostic. Do not expose confidential internal notes to students.

5. Scoring Engine
Calculate each dimension independently.
Domain Score: Average of all valid item responses within that domain.
Convert to a 0–100 scale:
Domain Score = ((Average Response - 1) / 4) × 100
Example: Responses: 4, 3, 5. Average = 4. Domain Score = ((4 - 1) / 4) × 100 = 75
A score of 75 means the teacher frequently observed the relevant behaviours. It does not mean the student has a 75% personality trait or psychological ability.
Rules:
- Minimum 2 valid responses out of 3 are required to calculate a domain score.
- If fewer than 2 valid responses exist, display "Insufficient observations".
- Never convert missing responses into zero.
- Calculate domain scores without intermediate rounding.
- Round only for display.
- Preserve individual item responses and original evaluation records.
- Do not calculate an overall psychological score.
- Do not create clinical risk scores or automatic diagnostic categories.

6. Multiple Teacher Evaluations
Store each teacher's evaluation independently. Do not overwrite one teacher's evaluation with another teacher's evaluation.
The system must distinguish: Class teacher observation; Subject teacher observation; Observation context; Individual teacher scores; Combined developmental summary.
For a combined student profile:
- Aggregate valid domain scores across eligible teacher evaluations for the same evaluation week.
- Use the arithmetic mean of eligible teacher domain scores.
- Display the number of contributing teachers.
- Display the observation context and date.
- Require at least two valid teacher evaluations before presenting a combined multi-teacher weekly score.
- If only one evaluation exists, label it "Single-teacher observation".
- If there is no sufficient data, show "Insufficient observations".
Do not present the combined score as a definitive or objective personality measurement.

7. Student Behavioural & Development Profile
Create a spider-web/radar chart with six axes: 1. Learning Engagement 2. Self-Regulation 3. Emotional Regulation 4. Social Interaction 5. Responsibility & Independence 6. Communication & Help-Seeking
Each axis uses the corresponding 0–100 domain score.
Chart requirements:
- Six clearly labelled axes.
- Scale from 0 to 100.
- Display the numerical score when a user selects or hovers over a dimension.
- Use distinct visual states for insufficient data.
- Allow users to compare two selected evaluation periods.
- Include a date/week selector.
- Include an option to view the latest available evaluation.
- Show the number of teacher evaluations contributing to each profile.
- Provide an accessible tabular alternative to the chart.
Title: "Student Behavioural & Development Profile"
Subtitle: "Based on teacher observations during the selected period. This profile reflects observed behaviours, not a psychological diagnosis or fixed personality assessment."
Do not use labels such as "Bad Personality", "Weak Student", "Aggressive", "Introvert", "Low Intelligence", or "Psychologically Unstable".

8. Historical Development Tracking
Provide a weekly timeline. Users should be able to:
- View individual weekly evaluation records.
- Compare domain scores across weeks.
- Identify improving, declining, or relatively stable observed patterns.
- Compare current and previous evaluation periods.
- View teacher-specific observations separately.
- View the combined profile when sufficient observations exist.
Use line charts for domain trends and radar charts for selected-period profiles.
A change in score must not automatically be described as psychological deterioration or improvement. Use neutral descriptions such as "observed score increased" or "observed score decreased".
Do not compare scores from different questionnaire versions as if they were equivalent.

9. Hierarchical Dashboard Navigation
Follow the existing Optimus Orien hierarchy.
Level 1 — School/System Overview: Total students evaluated this week; Evaluation completion rate; Number of students with insufficient observations; School/campus comparison; Evaluation trends; Gender-based aggregate summaries where permitted. System administrators can view all schools. Principals can view only their own school.
Level 2 — Campus Overview: Classes and sections; Evaluation completion by class; Class-level aggregate domain profiles; Student evaluation coverage; Historical campus trends.
Level 3 — Class Overview: Student list; Evaluation completion status; Class-level domain averages; Individual student profile access; Class teacher and subject teacher evaluation coverage.
Level 4 — Student Profile: Six-dimensional radar chart; Weekly historical trends; Individual teacher observations; Combined profile when sufficient data exists; Strengths and suggested support areas; Student-visible published profile.
The hierarchy must follow existing school, campus, class, section, subject, and student relationships.

10. Gender-Based Analytics
Provide optional gender-based aggregate reporting.
- Use the student's existing recorded gender field.
- Never infer gender from names.
- Keep unknown or unrecorded categories separate.
- Calculate each group's statistics using only eligible records.
- Show group sample sizes.
- Display N/A when there is insufficient data.
- Do not expose individual student records through gender aggregate reports.
- Avoid comparisons that imply one gender is psychologically or behaviourally superior to another.

11. Student Interface
Students should have a separate "My Development Profile" page. They can see: their latest published radar chart; the six behavioural development dimensions; their historical trend; teacher feedback specifically approved for student viewing; constructive development suggestions.
Use encouraging, non-judgmental language. Example: "Your recent observations show that you frequently participate in classroom activities. You can continue developing this strength by taking part in group discussions."
Students must not see: internal teacher notes; confidential safeguarding records; private staff discussions; other students' data; unpublished evaluations.

12. Teacher Interface
Create a weekly evaluation workspace. Features: assigned class and subject filters; student list; evaluation completion indicators; start/resume evaluation; draft and submit; submission history; individual student profile, subject to permissions.
Display completion status: Not Started; Draft; Submitted; Revised.
Teachers should be able to complete the questionnaire efficiently on mobile and desktop.

13. Privacy, Safeguarding & Audit
This module contains sensitive student information. Implement:
- Role-based access control.
- School and campus data isolation.
- Encrypted data transmission and secure storage.
- Audit logs for viewing, submitting, editing, exporting, and publishing records.
- Restricted export permissions.
- Secure session and authentication controls.
- Configurable data retention policies.
- Clear access and correction procedures.
- Appropriate school authorization and parent/guardian communication processes before deployment.
Teacher observations must not automatically trigger disciplinary action, exclusion, grading penalties, or high-stakes decisions.
If a teacher identifies an immediate safeguarding concern, provide a separate restricted referral workflow to the school's designated safeguarding personnel. Do not use the radar chart or questionnaire score as a safeguarding risk detector.

14. Psychometric Validation Requirements
The 18-item questionnaire is an original proposed observation framework. It must not be advertised as a validated psychological test until evidence supports that claim.
Before production use as a formal assessment instrument:
1. Have the questionnaire reviewed by qualified educational psychologists and psychometricians.
2. Establish clear construct definitions and a content-validity review process.
3. Conduct cognitive interviews with teachers to ensure questions are interpreted consistently.
4. Pilot the questionnaire across representative schools, age groups, and classroom contexts.
5. Evaluate internal consistency for each proposed dimension. Do not rely on one reliability statistic alone.
6. Evaluate inter-rater reliability by comparing independent teacher ratings of the same students in comparable observation contexts.
7. Examine factor structure to determine whether the six proposed dimensions are supported by the collected data.
8. Examine fairness and measurement comparability across relevant age groups, languages, genders, and school contexts.
9. Document limitations, scoring rules, intended uses, and prohibited uses.
10. Revalidate after material changes to questions, scoring, population, or administration.
Weekly repeated observations measure changing behaviour in changing contexts. Do not assume that low week-to-week score stability necessarily indicates poor reliability. Inter-rater agreement and consistency of measurement must be evaluated separately from genuine behavioural change.
Until validation is completed, display: "Developmental observation framework — validation in progress."
Do not market the module as clinically validated or psychometrically standardized.

15. Technical Data Model
Suggested database entities:
evaluation_templates: id, version, name, status, effective_from, effective_to, validation_status
evaluation_dimensions: id, template_id, dimension_name, description, display_order
evaluation_questions: id, dimension_id, question_text, display_order, active
weekly_evaluations: id, student_id, teacher_id, school_id, campus_id, class_id, section_id, subject_id (nullable), observation_context, evaluation_week, template_version, status, submitted_at, created_at, updated_at
evaluation_responses: id, evaluation_id, question_id, response_value (1–5 or null), observation_note (optional)
evaluation_domain_scores: id, evaluation_id, dimension_id, valid_response_count, average_response, normalized_score, score_status
evaluation_publications: id, student_id, evaluation_week, published_by, published_at, visibility_status
evaluation_audit_logs: id, actor_id, action, record_type, record_id, timestamp, relevant_metadata
Use template versioning so historical evaluations retain the exact questionnaire version and scoring logic used at the time.

16. Backend Calculation and Reporting
Implement a central evaluation calculation service. All domain calculations, weekly aggregates, historical trends, and radar-chart data must use the same backend calculation logic. The frontend must not independently calculate or modify official scores.
Implement: database indexes for student, teacher, school, campus, class, subject, and evaluation week; server-side authorization on every record request; pagination for student lists and evaluation histories; caching for aggregate dashboards where appropriate; cache invalidation after a valid submission or correction; duplicate-submission protection; consistent aggregation across dashboards, reports, and APIs.

17. Acceptance Tests
The feature is accepted only when the following tests pass:
1. Administrator can access records across all authorized schools.
2. Principal cannot access another school's records.
3. Class teacher can evaluate only assigned students.
4. Subject teacher can evaluate only students in assigned classes and subjects.
5. Student can view only their own published profile.
6. Unobserved items are excluded from calculations.
7. A domain with fewer than two valid responses displays insufficient observations.
8. Domain score calculations match the documented formula.
9. Separate teacher submissions remain independently accessible.
10. Combined profiles require at least two eligible teacher evaluations.
11. Radar-chart values match backend domain scores.
12. Historical comparisons use the correct questionnaire version.
13. Unpublished evaluations are not visible to students.
14. Internal notes are never exposed to students.
15. Gender analytics do not infer or merge missing gender records.
16. Unauthorized API requests are rejected.
17. All submissions and amendments are recorded in audit logs.
18. Dashboard aggregates reconcile with underlying eligible records.
19. Mobile and desktop questionnaire submission works correctly.
20. No diagnosis or fixed personality label is generated from the scores.

18. Final Implementation Rule
The Psychological Evaluation module must operate as a separate module while using Optimus Orien's existing user accounts, academic hierarchy, class assignments, student records, and permission system. Do not duplicate the school's existing student or teacher records. Prioritize student wellbeing, privacy, fairness, transparent scoring, and evidence-based interpretation over producing attractive but unsupported psychological scores.
