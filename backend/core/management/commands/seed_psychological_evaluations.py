"""Management command to seed realistic Psychological Evaluation demonstration data."""
from datetime import timedelta
from django.core.management.base import BaseCommand
from django.utils import timezone

from core.models import (
    School, SchoolClass, Subject, Student, User,
    WeeklyEvaluation, EvaluationResponse, EvaluationPublication,
    EvaluationSafeguardingReferral
)
from core.services.psychological_evaluation import (
    ensure_default_template, save_evaluation, get_current_school_week, log_audit
)


class Command(BaseCommand):
    help = "Seed demonstration behavioural and developmental evaluations for students"

    def handle(self, *args, **options):
        self.stdout.write("Ensuring evaluation template v1.0...")
        template = ensure_default_template()

        school_north = School.objects.filter(code='NORTH').first()
        school_west = School.objects.filter(code='WEST').first()

        if not school_north:
            self.stdout.write(self.style.WARNING("Northstar Academy (NORTH) not found. Run seed_demo first."))
            return

        teacher_north = User.objects.filter(username='teacher').first()
        principal_north = User.objects.filter(username='principal').first()
        admin_user = User.objects.filter(username='admin').first()

        class_north = SchoolClass.objects.filter(school=school_north).first()
        math_subj = Subject.objects.filter(school=school_north, code='MAT').first() or Subject.objects.filter(school=school_north).first()
        sci_subj = Subject.objects.filter(school=school_north, code='SCI').first()

        if class_north and teacher_north:
            from core.models import ClassTeacherAssignment, TeachingAssignment
            ClassTeacherAssignment.objects.get_or_create(
                school_class=class_north, teacher=teacher_north,
                defaults={'start_date': timezone.localdate() - timedelta(days=90)}
            )
            if math_subj:
                TeachingAssignment.objects.get_or_create(
                    school=school_north, teacher=teacher_north, school_class=class_north, subject=math_subj,
                    defaults={'start_date': timezone.localdate() - timedelta(days=90)}
                )

        students = list(Student.objects.filter(school=school_north, enrollments__school_class=class_north)[:8])

        cur_year, cur_wk_num, _ = timezone.localdate().isocalendar()
        weeks = [f"{cur_year}-W{max(1, cur_wk_num - i):02d}" for i in range(3, -1, -1)]

        self.stdout.write(f"Seeding evaluations for {len(students)} students across weeks: {weeks}...")

        # Pre-defined realistic patterns
        sample_comments = [
            ("Consistently contributes thoughtful questions during classroom discussions.", "Can hesitate when encountering multi-step word problems.", "Provide structured step-by-step problem templates."),
            ("Shows remarkable curiosity when discovering new scientific concepts.", "Occasionally rushes through written explanations.", "Encourage pausing to review work before submitting."),
            ("Demonstrates excellent cooperation and empathy during peer group tasks.", "Needs occasional encouragement to seek assistance when stuck.", "Introduce partner check-ins before independent tasks."),
            ("Maintains steady focus and respects classroom learning routines.", "Tends to be quiet in large group discussions.", "Offer opportunities to share ideas in small paired groups first."),
        ]

        questions = list(template.dimensions.prefetch_related('questions').all())
        q_objs = []
        for d in questions:
            for q in d.questions.all():
                q_objs.append(q)

        for s_idx, st in enumerate(students):
            strengths, support_area, support_action = sample_comments[s_idx % len(sample_comments)]

            for w_idx, wk in enumerate(weeks):
                # 1. Homeroom / Class Teacher evaluation
                responses_ct = {}
                for q_i, q in enumerate(q_objs):
                    base_val = 3 + ((s_idx * 3 + w_idx * 2 + q_i) % 3)
                    # Introduce occasional unobserved null (e.g. item 17 on week 1)
                    if (q_i + s_idx + w_idx) % 11 == 0:
                        responses_ct[q.id] = None
                    else:
                        responses_ct[q.id] = min(5, max(1, base_val))

                save_evaluation(teacher_north, {
                    'student_id': st.id,
                    'class_id': class_north.id,
                    'evaluation_week': wk,
                    'status': 'submitted',
                    'responses': responses_ct,
                    'strengths_observed': strengths,
                    'support_areas': support_area,
                    'support_action': support_action,
                    'teacher_notes': f"Internal observation note for {st.first_name} regarding learning pace.",
                    'student_visible_feedback': f"Great job on your classroom participation during {wk}! Continue your positive engagement.",
                })

                # 2. Subject Teacher evaluation for first 4 students (so combined multi-teacher works!)
                if s_idx < 4 and math_subj:
                    responses_st = {}
                    for q_i, q in enumerate(q_objs):
                        base_val = 3 + ((s_idx * 2 + w_idx * 3 + q_i) % 3)
                        responses_st[q.id] = min(5, max(1, base_val))

                    save_evaluation(teacher_north, {
                        'student_id': st.id,
                        'class_id': class_north.id,
                        'subject_id': math_subj.id,
                        'evaluation_week': wk,
                        'status': 'submitted',
                        'responses': responses_st,
                        'strengths_observed': "Strong analytical attention during math exercises.",
                        'support_areas': "Reviewing calculation steps before submitting.",
                        'support_action': "Use checking checklists for algebra exercises.",
                        'teacher_notes': "Student shows keen numerical reasoning.",
                        'student_visible_feedback': "Superb work on your mathematics problem-solving!",
                    })

                # 3. Publish profile for student 0 & 1 for all weeks
                if s_idx < 2:
                    EvaluationPublication.objects.get_or_create(
                        student=st,
                        evaluation_week=wk,
                        defaults={
                            'published_by': principal_north or admin_user,
                            'visibility_status': 'published',
                            'notes': 'Published for student & parent review.'
                        }
                    )

        # 4. Create one sample confidential safeguarding referral for demonstration
        if students:
            EvaluationSafeguardingReferral.objects.get_or_create(
                student=students[0],
                defaults={
                    'referred_by': teacher_north,
                    'school': school_north,
                    'concern_description': 'Student mentioned feeling anxious regarding transit home. Handled by pastoral staff.',
                    'urgency_level': 'standard',
                    'status': 'under_review',
                    'designated_lead_notes': 'School counselor met with student; parent contacted for coordination.',
                }
            )

        self.stdout.write(self.style.SUCCESS("Successfully seeded Psychological Evaluation demonstration records!"))
