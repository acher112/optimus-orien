"""
PostgreSQL EXPLAIN ANALYZE benchmark for OPTIMUS ORIEN core queries.
Compares Query Plans (Seq Scan vs Composite Index Scan) on realistic volume.
"""
import os
import sys
import time
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

from django.db import connection, transaction
from core.models import (
    Organisation, School, AcademicYear, SchoolClass, Subject, Student,
    Enrollment, Attendance, FeeHead, FinanceCategory, StudentFee, FeePayment,
    ExamComponent, ExamStructure, ExamConfiguration, ExamStudentMark
)

def seed_benchmark_data():
    org, _ = Organisation.objects.get_or_create(code='perf-org', defaults={'name': 'Performance Benchmark Org'})
    school, _ = School.objects.get_or_create(code='PERF1', defaults={'name': 'Benchmark Model School', 'organisation': org})
    today = date(2026, 11, 2)
    ay, _ = AcademicYear.objects.get_or_create(
        school=school, name='2026-2027',
        defaults={'start_date': date(2026, 8, 1), 'end_date': date(2027, 6, 30)}
    )

    # Check if already seeded
    student_count = Student.objects.filter(school=school).count()
    if student_count >= 1000 and ExamStudentMark.objects.filter(school_class__school=school).exists():
        print(f"Benchmark school already has {student_count} students and exam marks. Skipping re-seed.")
        return school, ay

    print("Seeding 1,000 students, classes, attendance, fees, and marks...")
    classes = []
    for g in range(1, 11):
        for sec in ['A', 'B', 'C']:
            sc, _ = SchoolClass.objects.get_or_create(school=school, academic_year=ay, name=f"Grade {g}", section=sec)
            classes.append(sc)

    subjects = []
    for sub_name in ['English', 'Mathematics', 'Science', 'Urdu', 'Social Studies']:
        sb, _ = Subject.objects.get_or_create(school=school, code=sub_name[:4].upper(), defaults={'name': sub_name})
        subjects.append(sb)

    # Bulk create 1,000 students
    students = []
    for i in range(1, 1001):
        students.append(Student(
            school=school,
            admission_number=f"ADM-PERF-{i:04d}",
            first_name=f"Student{i}",
            last_name=f"Benchmark",
            enrolled_on=date(2026, 8, 1),
            active=True
        ))
    Student.objects.bulk_create(students, ignore_conflicts=True)
    all_students = list(Student.objects.filter(school=school))

    # Enrollments
    enrollments = []
    for idx, st in enumerate(all_students):
        sc = classes[idx % len(classes)]
        enrollments.append(Enrollment(
            student=st,
            school_class=sc,
            start_date=date(2026, 8, 1)
        ))
    Enrollment.objects.bulk_create(enrollments, ignore_conflicts=True)

    # Seed 50 school days of attendance for 1,000 students = 50,000 records
    print("Generating 50,000 attendance records...")
    att_records = []
    for day_offset in range(50):
        d = today - timedelta(days=day_offset)
        if d.weekday() >= 5: continue
        for idx, st in enumerate(all_students):
            sc = classes[idx % len(classes)]
            status = 'present' if (idx + day_offset) % 10 != 0 else 'absent'
            att_records.append(Attendance(
                student=st,
                school_class=sc,
                date=d,
                status=status
            ))
            if len(att_records) >= 10000:
                Attendance.objects.bulk_create(att_records, ignore_conflicts=True)
                att_records = []
    if att_records:
        Attendance.objects.bulk_create(att_records, ignore_conflicts=True)

    # Seed Fee records
    print("Generating fee records and receipts...")
    fcat, _ = FinanceCategory.objects.get_or_create(school=school, name='Tuition Fees', defaults={'kind': 'income'})
    fhead, _ = FeeHead.objects.get_or_create(school=school, name='Monthly Tuition', defaults={'category': fcat})
    fee_lines = []
    for month in ['2026-08', '2026-09', '2026-10', '2026-11']:
        for idx, st in enumerate(all_students):
            st_status = 'paid' if (idx % 4 != 0) else 'unpaid'
            fee_lines.append(StudentFee(
                student=st,
                head=fhead,
                period=month,
                amount_due=Decimal('5000.00'),
                discount=Decimal('0.00'),
                status=st_status,
                due_date=date(2026, int(month.split('-')[1]), 10)
            ))
    StudentFee.objects.bulk_create(fee_lines, ignore_conflicts=True)

    payments = []
    for idx, st in enumerate(all_students[:600]):
        payments.append(FeePayment(
            student=st,
            school=school,
            receipt_number=f"REC-PERF-{idx:05d}",
            amount=Decimal('5000.00'),
            method='bank',
            paid_on=today - timedelta(days=idx % 30),
            status='approved'
        ))
    FeePayment.objects.bulk_create(payments, ignore_conflicts=True)

    # Seed Exam marks
    print("Generating exam marks...")
    cfg, _ = ExamConfiguration.objects.get_or_create(school=school, academic_year=ay, name='Standard Exam Config')
    comp, _ = ExamComponent.objects.get_or_create(
        configuration=cfg, name='Midterm Exam',
        defaults={'default_max_marks': Decimal('100.00'), 'weight_percentage': Decimal('40.00')}
    )
    marks = []
    for st in all_students:
        sc = classes[st.id % len(classes)]
        for sb in subjects:
            marks.append(ExamStudentMark(
                student=st,
                component=comp,
                subject=sb,
                school_class=sc,
                academic_year=ay,
                marks_obtained=Decimal('78.50'),
                result_status='recorded'
            ))
    ExamStudentMark.objects.bulk_create(marks, ignore_conflicts=True)
    print("Seeding complete!")
    return school, ay

def run_explain(name, sql, params=None):
    with connection.cursor() as cur:
        explain_sql = f"EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) {sql}"
        cur.execute(explain_sql, params or [])
        res = cur.fetchall()
        import json
        plan_data = res[0][0][0]
        exec_time = plan_data['Execution Time']
        plan = plan_data['Plan']
        node_type = plan['Node Type']
        total_cost = plan['Total Cost']
        return exec_time, node_type, total_cost

def benchmark():
    school, ay = seed_benchmark_data()
    sample_class = SchoolClass.objects.filter(school=school).first()
    sample_student = Student.objects.filter(school=school).first()
    sample_subject = Subject.objects.filter(school=school).first()
    sample_comp = ExamComponent.objects.first()

    benchmarks = [
        (
            "1. Attendance Roster (Class + Date)",
            "SELECT * FROM core_attendance WHERE school_class_id = %s AND date = '2026-10-30'",
            [sample_class.id],
            "att_class_date_idx"
        ),
        (
            "2. Student Attendance History (Student + Date range)",
            "SELECT * FROM core_attendance WHERE student_id = %s AND date >= '2026-09-01'",
            [sample_student.id],
            "att_std_date_st_idx"
        ),
        (
            "3. Exam Marks Grid (Class + Component + Subject)",
            "SELECT * FROM core_examstudentmark WHERE school_class_id = %s AND component_id = %s AND subject_id = %s",
            [sample_class.id, sample_comp.id, sample_subject.id],
            "mark_cls_comp_sb_idx"
        ),
        (
            "4. Fee Defaulters (Status + Due Date)",
            "SELECT sf.* FROM core_studentfee sf JOIN core_student st ON sf.student_id = st.id WHERE st.school_id = %s AND sf.status IN ('unpaid', 'partial') AND sf.due_date < '2026-11-01'",
            [school.id],
            "fee_stat_due_idx"
        ),
        (
            "5. Approved Fee Receipts (School + Paid Date range)",
            "SELECT * FROM core_feepayment WHERE school_id = %s AND paid_on BETWEEN '2026-10-01' AND '2026-11-02' AND status = 'approved' AND voided = false",
            [school.id],
            "feepay_sch_paid_idx"
        ),
    ]

    print("\n" + "="*80)
    print("EXPLAIN ANALYZE QUERY BENCHMARK: BEFORE (SEQ SCAN) vs AFTER (COMPOSITE INDEX)")
    print("="*80)

    results = []
    with connection.cursor() as cur:
        for title, query, params, idx_name in benchmarks:
            # Measure with Index (AFTER)
            cur.execute("SET enable_seqscan = off")
            time_after, plan_after, cost_after = run_explain(title, query, params)

            # Measure without Index (BEFORE - simulate full table seq scan)
            cur.execute("SET enable_indexscan = off; SET enable_bitmapscan = off; SET enable_seqscan = on")
            time_before, plan_before, cost_before = run_explain(title, query, params)

            # Reset planner
            cur.execute("SET enable_indexscan = on; SET enable_bitmapscan = on; SET enable_seqscan = on")

            speedup = (time_before / time_after) if time_after > 0 else 1.0
            results.append({
                'title': title,
                'time_before': time_before,
                'plan_before': plan_before,
                'time_after': time_after,
                'plan_after': plan_after,
                'speedup': speedup,
                'idx_name': idx_name
            })

            print(f"\n{title}")
            print(f"  Index:            {idx_name}")
            print(f"  BEFORE (No Idx):  {time_before:.3f} ms | Plan: {plan_before}")
            print(f"  AFTER  (Indexed): {time_after:.3f} ms | Plan: {plan_after}")
            print(f"  SPEEDUP:          {speedup:.1f}x faster")

    print("\n" + "="*80)
    print("SUMMARY TABLE:")
    print(f"{'Query':<45} | {'Before (ms)':<11} | {'After (ms)':<11} | {'Speedup'}")
    print("-" * 80)
    for r in results:
        print(f"{r['title']:<45} | {r['time_before']:<11.3f} | {r['time_after']:<11.3f} | {r['speedup']:.1f}x")
    print("="*80)

if __name__ == '__main__':
    benchmark()
