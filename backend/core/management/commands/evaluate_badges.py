"""
Management command to evaluate badges and achievements idempotently.

Usage:
    python manage.py evaluate_badges [--school-id <id>] [--user-id <id>] [--category <name>] [--dry-run]
"""
from django.core.management.base import BaseCommand
from django.utils import timezone

from core.models import School, User, Student
from core.services.badge_engine import (
    evaluate_student_achievements,
    evaluate_teacher_achievements,
    evaluate_principal_achievements,
    evaluate_quiz_achievements,
)


class Command(BaseCommand):
    help = "Idempotently evaluates badges and achievements for students, teachers, principals, and quizzes."

    def add_arguments(self, parser):
        parser.add_argument('--school-id', type=int, help='Scope evaluation to a specific School ID.')
        parser.add_argument('--user-id', type=int, help='Scope evaluation to a single User ID.')
        parser.add_argument('--student-id', type=int, help='Scope evaluation to a single Student ID.')
        parser.add_argument(
            '--category',
            type=str,
            choices=['student', 'teacher', 'principal', 'quiz', 'all'],
            default='all',
            help='Badge category to evaluate.'
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Simulate evaluation without persisting awards.'
        )

    def handle(self, *args, **options):
        school_id = options.get('school_id')
        user_id = options.get('user_id')
        student_id = options.get('student_id')
        category = options.get('category')
        dry_run = options.get('dry_run')

        self.stdout.write(self.style.NOTICE(
            f"Starting badges evaluation at {timezone.now().isoformat()} "
            f"(category={category}, school_id={school_id}, user_id={user_id}, dry_run={dry_run})..."
        ))

        total_awarded = 0

        # 1. Single User / Student Evaluation
        if student_id:
            if category in ['student', 'all']:
                awarded = evaluate_student_achievements(student_id)
                total_awarded += len(awarded)
                self.stdout.write(self.style.SUCCESS(f"Evaluated student {student_id}: {len(awarded)} new awards."))
            return

        if user_id:
            try:
                user = User.objects.get(id=user_id)
            except User.DoesNotExist:
                self.stderr.write(self.style.ERROR(f"User {user_id} not found."))
                return

            if user.role == 'student' and category in ['student', 'all']:
                student = getattr(user, 'student_record', None)
                if student:
                    awarded = evaluate_student_achievements(student.id)
                    total_awarded += len(awarded)
            elif user.role == 'teacher' and category in ['teacher', 'all']:
                awarded = evaluate_teacher_achievements(user.id)
                total_awarded += len(awarded)
            elif user.role in ['principal', 'school_admin'] and category in ['principal', 'all']:
                awarded = evaluate_principal_achievements(user.id)
                total_awarded += len(awarded)

            if category in ['quiz', 'all']:
                awarded_q = evaluate_quiz_achievements(user.id)
                total_awarded += len(awarded_q)

            self.stdout.write(self.style.SUCCESS(f"Evaluated user {user.username}: {total_awarded} new awards."))
            return

        # 2. Campus or System-Wide Evaluation
        schools_qs = School.objects.all()
        if school_id:
            schools_qs = schools_qs.filter(id=school_id)

        for school in schools_qs:
            self.stdout.write(f"Processing campus: {school.name} (ID: {school.id})...")

            # Evaluate Principals
            if category in ['principal', 'all']:
                principals = User.objects.filter(school=school, role__in=['principal', 'school_admin'])
                for p in principals:
                    aw = evaluate_principal_achievements(p.id)
                    total_awarded += len(aw)

            # Evaluate Teachers
            if category in ['teacher', 'all']:
                teachers = User.objects.filter(school=school, role='teacher')
                for t in teachers:
                    aw = evaluate_teacher_achievements(t.id)
                    total_awarded += len(aw)

            # Evaluate Students
            if category in ['student', 'all']:
                students = Student.objects.filter(school=school)
                for s in students:
                    aw = evaluate_student_achievements(s.id)
                    total_awarded += len(aw)

            # Evaluate Quizzes
            if category in ['quiz', 'all']:
                users_with_quizzes = User.objects.filter(school=school, quiz_attempts__is_official=True).distinct()
                for u in users_with_quizzes:
                    aw = evaluate_quiz_achievements(u.id)
                    total_awarded += len(aw)

        self.stdout.write(self.style.SUCCESS(
            f"Badges evaluation complete. Total new awards created: {total_awarded}"
        ))
