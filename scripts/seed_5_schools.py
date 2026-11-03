"""
Seed 5 schools with 1,000 students each (total 5,000 students) on local PostgreSQL.
Prepares comprehensive dataset for concurrent load testing, RLS isolation verification,
and query performance evaluation.
"""
import os
import sys
import time
import hashlib
from datetime import date, timedelta
from decimal import Decimal

os.environ['POSTGRES_DB'] = 'optimus_perf'
os.environ['POSTGRES_USER'] = 'postgres'
os.environ['POSTGRES_PASSWORD'] = 'admin'
os.environ['POSTGRES_HOST'] = 'localhost'
os.environ['POSTGRES_PORT'] = '5432'
os.environ['DJANGO_SETTINGS_MODULE'] = 'config'
sys.path.insert(0, 'backend')

import django
django.setup()

from django.contrib.auth.hashers import make_password
from django.db import connection, transaction
from core.models import (
    Organisation, School, AcademicYear, SchoolClass, Subject, Student,
    Enrollment, Attendance, FeeHead, FinanceCategory, StudentFee, FeePayment,
    ExamComponent, ExamStructure, ExamConfiguration, ExamStudentMark,
    User, GuardianProfile, GuardianRelationship
)

def seed_schools():
    start_time = time.monotonic()
    today = date(2026, 11, 2)
    print("Pre-computing password hash once for all test accounts...")
    hashed_password = make_password('Password123!')
    print("Starting seed for 5 schools x 1,000 students on optimus_perf...")

    for i in range(1, 6):
        s_start = time.monotonic()
        org_code = f"org-perf-{i}"
        sch_code = f"SCH-PERF-{i}"

        org, _ = Organisation.objects.get_or_create(
            code=org_code,
            defaults={'name': f'Benchmark Education Network {i}'}
        )
        school, _ = School.objects.get_or_create(
            code=sch_code,
            defaults={'name': f'Apex Academy Campus {i}', 'organisation': org}
        )

        existing_students = Student.objects.filter(school=school).count()
        if existing_students >= 1000 and User.objects.filter(school=school, role='parent').count() >= 50:
            print(f"School {i} ({school.name}) already has {existing_students} students and test users. Skipping.")
            continue
        elif existing_students > 0 or User.objects.filter(school=school, role='parent').exists():
            print(f"Cleaning partial records for {school.name}...")
            ExamStudentMark.objects.filter(school_class__school=school).delete()
            Attendance.objects.filter(student__school=school).delete()
            StudentFee.objects.filter(student__school=school).delete()
            GuardianRelationship.objects.filter(student__school=school).delete()
            GuardianProfile.objects.filter(organisation=org).delete()
            User.objects.filter(school=school, role='parent').delete()
            Enrollment.objects.filter(student__school=school).delete()
            Student.objects.filter(school=school).delete()

        ay, _ = AcademicYear.objects.get_or_create(
            school=school, name='2026-2027',
            defaults={'start_date': date(2026, 8, 1), 'end_date': date(2027, 6, 30)}
        )

        # 1. Classes & Subjects
        classes = []
        for g in range(1, 11):
            for sec in ['A', 'B', 'C']:
                sc, _ = SchoolClass.objects.get_or_create(
                    school=school, academic_year=ay, name=f"Grade {g}", section=sec
                )
                classes.append(sc)

        subjects = []
        for sname, scode in [('Mathematics', f'MTH{i}'), ('English', f'ENG{i}'), ('Science', f'SCI{i}')]:
            sub, _ = Subject.objects.get_or_create(
                school=school, code=scode, defaults={'name': sname}
            )
            subjects.append(sub)

        # 2. Staff & Teachers
        principal, _ = User.objects.get_or_create(
            username=f'principal_{i}',
            defaults={
                'email': f'principal{i}@apex{i}.edu',
                'password': hashed_password,
                'role': 'principal',
                'school': school,
                'organisation': org,
                'first_name': 'Principal',
                'last_name': f'School{i}'
            }
        )

        teachers = []
        for t_idx in range(1, 11):
            t_user, _ = User.objects.get_or_create(
                username=f'teacher_{i}_{t_idx}',
                defaults={
                    'email': f'teacher{t_idx}@apex{i}.edu',
                    'password': hashed_password,
                    'role': 'teacher',
                    'school': school,
                    'organisation': org,
                    'first_name': f'Teacher{t_idx}',
                    'last_name': f'Sch{i}'
                }
            )
            teachers.append(t_user)

        # 3. 1,000 Students
        print(f"Creating 1,000 students for {school.name}...")
        students_to_create = []
        for s_idx in range(1, 1001):
            students_to_create.append(Student(
                school=school,
                admission_number=f"ADM-S{i}-{s_idx:04d}",
                first_name=f"Student{s_idx}",
                last_name=f"Campus{i}",
                gender='female' if s_idx % 2 == 0 else 'male',
                active=True,
                enrolled_on=ay.start_date,
                date_of_birth=date(2012, 1, 1) + timedelta(days=s_idx % 1000)
            ))
        created_students = Student.objects.bulk_create(students_to_create)

        # 4. Enrollments (distribute 1,000 students evenly into 30 classes)
        enrollments = []
        for idx, st in enumerate(created_students):
            cls = classes[idx % len(classes)]
            enrollments.append(Enrollment(
                student=st,
                school_class=cls,
                start_date=ay.start_date,
            ))
        Enrollment.objects.bulk_create(enrollments, batch_size=2000)

        # 5. Parents / Guardians (100 parents, each linked to 1-2 students)
        print(f"Creating parent accounts for {school.name}...")
        for p_idx in range(1, 101):
            p_user, _ = User.objects.get_or_create(
                username=f'parent_{i}_{p_idx}',
                defaults={
                    'email': f'parent{p_idx}@family{i}.com',
                    'password': hashed_password,
                    'role': 'parent',
                    'school': school,
                    'organisation': org,
                    'first_name': f'Parent{p_idx}',
                    'last_name': f'Family{i}'
                }
            )

            id_str = f"42101-{i:02d}{p_idx:05d}-1"
            id_hash = hashlib.sha256(f"{org.id}:{id_str}".encode()).hexdigest()

            prof, _ = GuardianProfile.objects.get_or_create(
                user=p_user,
                defaults={
                    'organisation': org,
                    'first_name': f'Parent{p_idx}',
                    'last_name': f'Family{i}',
                    'email': p_user.email,
                    'mobile': f'+92300{i:02d}{p_idx:04d}',
                    'identity_type': 'cnic',
                    'identity_last4': id_str[-4:],
                    'identity_hash': id_hash,
                    'identity_number_encrypted': f'enc_{id_str}',
                }
            )

            linked_student = created_students[(p_idx - 1) * 2]
            GuardianRelationship.objects.get_or_create(
                student=linked_student,
                guardian=prof,
                defaults={'relationship': 'father', 'status': 'active'}
            )

        # 6. Fees
        print(f"Generating fee records for {school.name}...")
        cat, _ = FinanceCategory.objects.get_or_create(
            school=school, name='Academic Tuition', defaults={'kind': 'income'}
        )
        head, _ = FeeHead.objects.get_or_create(
            school=school, name='Monthly Tuition', defaults={'category': cat}
        )

        fees = []
        for st in created_students:
            fees.append(StudentFee(
                student=st,
                head=head,
                amount_due=Decimal('4500.00'),
                due_date=today + timedelta(days=10),
                period='2026-11',
                status='unpaid'
            ))
        StudentFee.objects.bulk_create(fees, batch_size=2000)

        # 7. Attendance (10 days of attendance for first 5 classes)
        print(f"Generating attendance history for {school.name}...")
        att_records = []
        for day_offset in range(10):
            att_date = today - timedelta(days=day_offset)
            if att_date.weekday() >= 5:  # skip weekends
                continue
            for cls in classes[:5]:
                cls_students = [e.student for e in enrollments if e.school_class == cls]
                for st in cls_students:
                    att_records.append(Attendance(
                        student=st,
                        school_class=cls,
                        date=att_date,
                        status='present' if (st.id + day_offset) % 7 != 0 else 'absent'
                    ))
        Attendance.objects.bulk_create(att_records, batch_size=5000)

        # 8. Exam Configuration & Component
        cfg, _ = ExamConfiguration.objects.get_or_create(
            school=school, academic_year=ay, name='Standard Exam Config'
        )
        comp, _ = ExamComponent.objects.get_or_create(
            configuration=cfg, name='Final Term',
            defaults={'default_max_marks': Decimal('100.00'), 'weight_percentage': Decimal('100.00')}
        )

        # 9. Marks for Grade 10 A
        g10_cls = next((c for c in classes if c.name == 'Grade 10' and c.section == 'A'), classes[0])
        g10_students = [e.student for e in enrollments if e.school_class == g10_cls]
        marks = []
        for st in g10_students:
            for sub in subjects:
                marks.append(ExamStudentMark(
                    student=st,
                    school_class=g10_cls,
                    subject=sub,
                    component=comp,
                    academic_year=ay,
                    marks_obtained=Decimal(str(50 + (st.id % 45))),
                    max_marks=Decimal('100.0')
                ))
        ExamStudentMark.objects.bulk_create(marks, batch_size=2000)

        s_elapsed = time.monotonic() - s_start
        print(f"Finished School {i} in {s_elapsed:.2f}s")

    total_elapsed = time.monotonic() - start_time
    total_students = Student.objects.filter(school__code__startswith='SCH-PERF').count()
    print(f"\nAll 5 schools seeded successfully in {total_elapsed:.2f}s! Total students across benchmark schools: {total_students}")

if __name__ == '__main__':
    seed_schools()
