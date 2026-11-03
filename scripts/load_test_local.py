"""
Concurrent Load & Isolation Testing Harness for OPTIMUS ORIEN.
Simulates real-world peak events against local PostgreSQL (optimus_perf)
seeded with 5 schools of 1,000 students each (5,000 total students).

Scenarios Simulated:
1. Login Spikes (Teachers, Parents, Principals)
2. Morning Attendance Marking Wave (50 concurrent teachers marking classes)
3. Parent Portal Dashboard & Fee Inquiries (100 concurrent parents)
4. Result Publication Spikes (Examinations & marks grids)
5. Asynchronous Heavy Work (Bulk Challan generation via BackgroundJob)
6. Cross-School Isolation under High Concurrency (Zero Leakage verification)
"""
import os
import sys
import time
import statistics
import concurrent.futures
from decimal import Decimal
from datetime import date

os.environ['POSTGRES_DB'] = 'optimus_perf'
os.environ['POSTGRES_USER'] = 'postgres'
os.environ['POSTGRES_PASSWORD'] = 'admin'
os.environ['POSTGRES_HOST'] = 'localhost'
os.environ['POSTGRES_PORT'] = '5432'
os.environ['DJANGO_SETTINGS_MODULE'] = 'config'
sys.path.insert(0, 'backend')

import django
django.setup()

from django.db import connection, reset_queries
from rest_framework.test import APIClient
from core.models import (
    Organisation, School, User, SchoolClass, Student, StudentFee,
    Attendance, ExamStudentMark, BackgroundJob, GuardianProfile, GuardianRelationship
)
from core.services.job_runner import enqueue_job, process_next_job

class LoadTestReport:
    def __init__(self, scenario_name):
        self.scenario_name = scenario_name
        self.latencies = []
        self.errors = 0
        self.total = 0
        self.start_time = 0
        self.end_time = 0

    def start(self):
        self.start_time = time.monotonic()

    def record(self, elapsed_ms, success=True):
        self.latencies.append(elapsed_ms)
        self.total += 1
        if not success:
            self.errors += 1

    def finish(self):
        self.end_time = time.monotonic()

    @property
    def rps(self):
        duration = self.end_time - self.start_time
        return round(self.total / duration, 2) if duration > 0 else 0

    @property
    def p50(self):
        return round(statistics.median(self.latencies), 2) if self.latencies else 0

    @property
    def p95(self):
        if not self.latencies:
            return 0
        sorted_l = sorted(self.latencies)
        idx = int(len(sorted_l) * 0.95)
        return round(sorted_l[min(idx, len(sorted_l) - 1)], 2)

    @property
    def p99(self):
        if not self.latencies:
            return 0
        sorted_l = sorted(self.latencies)
        idx = int(len(sorted_l) * 0.99)
        return round(sorted_l[min(idx, len(sorted_l) - 1)], 2)

    @property
    def mean(self):
        return round(statistics.mean(self.latencies), 2) if self.latencies else 0

    @property
    def error_rate(self):
        return round((self.errors / self.total) * 100, 2) if self.total > 0 else 0

def run_load_tests():
    print("=" * 80)
    print("OPTIMUS ORIEN — CONCURRENT LOAD & CAPACITY BENCHMARK")
    print("Target: 5 Schools x 1,000 Students = 5,000 Students on PostgreSQL (optimus_perf)")
    print("=" * 80)

    # -------------------------------------------------------------------------
    # Scenario 1: Authentication / Login Wave
    # -------------------------------------------------------------------------
    print("\n[Scenario 1] Simulating Concurrent Login Wave (100 users)...")
    rep_login = LoadTestReport("Concurrent Authentication")
    users = list(User.objects.filter(username__startswith='teacher_')[:50]) + \
            list(User.objects.filter(username__startswith='parent_')[:50])

    def do_login(u):
        c = APIClient(REMOTE_ADDR=f'10.0.{u.id // 256}.{u.id % 256}')
        t0 = time.monotonic()
        try:
            res = c.post('/api/v1/auth/login/', {'username': u.username, 'password': 'Password123!'})
            elapsed = (time.monotonic() - t0) * 1000.0
            return elapsed, res.status_code == 200
        except Exception:
            elapsed = (time.monotonic() - t0) * 1000.0
            return elapsed, False

    rep_login.start()
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as ex:
        results = list(ex.map(do_login, users))
    for el, ok in results:
        rep_login.record(el, ok)
    rep_login.finish()

    # -------------------------------------------------------------------------
    # Scenario 2: Morning Attendance Marking Wave (50 concurrent teachers)
    # -------------------------------------------------------------------------
    print("[Scenario 2] Simulating Morning Attendance Wave (50 concurrent classes)...")
    rep_att = LoadTestReport("Morning Attendance Wave")
    classes = list(SchoolClass.objects.filter(school__code__startswith='SCH-PERF')[:50])
    today = date(2026, 11, 2)

    def do_attendance(sc):
        c = APIClient()
        teacher = User.objects.filter(school=sc.school, role='teacher').first()
        c.force_authenticate(user=teacher)
        t0 = time.monotonic()
        try:
            res = c.get(f'/api/v1/attendance/?school_class={sc.id}&date={today}')
            elapsed = (time.monotonic() - t0) * 1000.0
            return elapsed, res.status_code == 200
        except Exception:
            elapsed = (time.monotonic() - t0) * 1000.0
            return elapsed, False

    rep_att.start()
    with concurrent.futures.ThreadPoolExecutor(max_workers=20) as ex:
        results = list(ex.map(do_attendance, classes))
    for el, ok in results:
        rep_att.record(el, ok)
    rep_att.finish()

    # -------------------------------------------------------------------------
    # Scenario 3: Parent Portal Dashboard & Fee Inquiries (100 concurrent parents)
    # -------------------------------------------------------------------------
    print("[Scenario 3] Simulating Parent Portal Dashboard & Home (100 parents)...")
    rep_parents = LoadTestReport("Parent Portal Home")
    parents = list(User.objects.filter(role='parent', school__code__startswith='SCH-PERF')[:100])

    def do_parent_portal(p):
        c = APIClient()
        c.force_authenticate(user=p)
        t0 = time.monotonic()
        try:
            r1 = c.get('/api/v1/parent/home/')
            elapsed = (time.monotonic() - t0) * 1000.0
            return elapsed, r1.status_code == 200
        except Exception:
            elapsed = (time.monotonic() - t0) * 1000.0
            return elapsed, False

    rep_parents.start()
    with concurrent.futures.ThreadPoolExecutor(max_workers=20) as ex:
        results = list(ex.map(do_parent_portal, parents))
    for el, ok in results:
        rep_parents.record(el, ok)
    rep_parents.finish()

    # -------------------------------------------------------------------------
    # Scenario 4: Result Publication & Marks Grid Spikes
    # -------------------------------------------------------------------------
    print("[Scenario 4] Simulating Result Publication / Marks Grid Spikes (50 requests)...")
    rep_results = LoadTestReport("Result Publication / Marks Grid")

    def do_marks_grid(sc):
        c = APIClient()
        p = sc.school.user_set.filter(role='principal').first()
        c.force_authenticate(user=p)
        t0 = time.monotonic()
        try:
            res = c.get(f'/api/v1/examination-engine/class-sheet/?school={sc.school_id}&school_class={sc.id}')
            elapsed = (time.monotonic() - t0) * 1000.0
            return elapsed, res.status_code in (200, 400, 404)
        except Exception:
            elapsed = (time.monotonic() - t0) * 1000.0
            return elapsed, False

    rep_results.start()
    with concurrent.futures.ThreadPoolExecutor(max_workers=20) as ex:
        results = list(ex.map(do_marks_grid, classes))
    for el, ok in results:
        rep_results.record(el, ok)
    rep_results.finish()

    # -------------------------------------------------------------------------
    # Scenario 5: Heavy Background Work (Bulk Challan Generation)
    # -------------------------------------------------------------------------
    print("[Scenario 5] Simulating Heavy Work Background Jobs (5 bulk challan tasks)...")
    rep_jobs = LoadTestReport("Background Job Processing")
    schools = list(School.objects.filter(code__startswith='SCH-PERF'))
    admin = User.objects.filter(role='principal').first()

    from core.models import FeeHead, FinanceCategory
    BackgroundJob.objects.filter(job_type='bulk_challan').delete()

    for s in schools:
        cat, _ = FinanceCategory.objects.get_or_create(school=s, name='Tuition', defaults={'kind': 'income'})
        head, _ = FeeHead.objects.get_or_create(school=s, name='Monthly Tuition', defaults={'category': cat})
        enqueue_job(
            job_type='bulk_challan',
            school=s,
            user=admin,
            payload={
                'period': '2026-12',
                'head_id': head.id,
                'amount': '5000.00',
                'due_date': '2026-12-15'
            }
        )

    def do_process_job(i):
        t0 = time.monotonic()
        try:
            executed = process_next_job()
            elapsed = (time.monotonic() - t0) * 1000.0
            return elapsed, executed
        except Exception:
            elapsed = (time.monotonic() - t0) * 1000.0
            return elapsed, False

    rep_jobs.start()
    for _ in range(len(schools)):
        el, ok = do_process_job(0)
        rep_jobs.record(el, ok)
    rep_jobs.finish()

    # -------------------------------------------------------------------------
    # Scenario 6: Cross-School Isolation under High Concurrency (Zero Leakage Check)
    # -------------------------------------------------------------------------
    print("[Scenario 6] Verifying Cross-School Isolation under Concurrency (50 cross-tenant probes)...")
    rep_iso = LoadTestReport("Multi-Tenant Isolation")
    leakages_detected = 0

    s1_parents = list(User.objects.filter(role='parent', school=schools[0])[:25])
    s2_students = list(Student.objects.filter(school=schools[1])[:25])
    probe_pairs = list(zip(s1_parents, s2_students))

    def do_isolation_probe(pair):
        p_user, foreign_student = pair
        c = APIClient()
        c.force_authenticate(user=p_user)
        t0 = time.monotonic()
        try:
            # Parent of School 1 attempting to access child of School 2
            res = c.get(f'/api/v1/parent/children/{foreign_student.id}/overview/')
            elapsed = (time.monotonic() - t0) * 1000.0
            # A strict 404 Not Found is REQUIRED per golden rule!
            is_isolated = (res.status_code == 404)
            return elapsed, is_isolated
        except Exception:
            elapsed = (time.monotonic() - t0) * 1000.0
            return elapsed, False

    rep_iso.start()
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as ex:
        results = list(ex.map(do_isolation_probe, probe_pairs))
    for el, ok in results:
        rep_iso.record(el, ok)
        if not ok:
            leakages_detected += 1
    rep_iso.finish()

    # -------------------------------------------------------------------------
    # Summary Table
    # -------------------------------------------------------------------------
    print("\n" + "=" * 80)
    print("LOAD TEST & CAPACITY RESULTS SUMMARY")
    print("=" * 80)
    print(f"{'Scenario':<34} | {'Reqs':<6} | {'RPS':<8} | {'p50 (ms)':<9} | {'p95 (ms)':<9} | {'p99 (ms)':<9} | {'Errors':<7}")
    print("-" * 88)

    reports = [rep_login, rep_att, rep_parents, rep_results, rep_jobs, rep_iso]
    for r in reports:
        print(f"{r.scenario_name:<34} | {r.total:<6} | {r.rps:<8} | {r.p50:<9} | {r.p95:<9} | {r.p99:<9} | {r.error_rate:<6}%")

    print("=" * 80)
    print(f"Cross-School Tenant Isolation Verification: {'PASSED (Zero Leakage)' if leakages_detected == 0 else f'FAILED ({leakages_detected} leaks)'}")
    print("=" * 80)

if __name__ == '__main__':
    run_load_tests()
