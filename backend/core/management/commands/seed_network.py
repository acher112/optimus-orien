"""
Management command to seed realistic, clearly fictional demo data for the Network feature.
FAKE DATA ONLY - No real people, schools, or children's personal information.
Generates strong demo passwords printed once to terminal.
"""
import secrets
import string
from decimal import Decimal
from django.core.management.base import BaseCommand
from django.utils import timezone
from core.models import (
    Organisation, School, User, Student, Subject, SchoolClass, AcademicYear,
    Assessment, Grade, SchoolNetworkSetting, NetworkProfile,
    NetworkConsent, ConnectionRequest, Connection, Block, Mute,
    Report, BoardSnapshot, BadgeAward
)
from core.services.network_ranking import refresh_network_snapshots_for_period


def generate_strong_password(length=16):
    alphabet = string.ascii_letters + string.digits + "!@#$%^&*"
    while True:
        pwd = ''.join(secrets.choice(alphabet) for _ in range(length))
        if (any(c.islower() for c in pwd)
                and any(c.isupper() for c in pwd)
                and any(c.isdigit() for c in pwd)
                and any(c in "!@#$%^&*" for c in pwd)):
            return pwd


class Command(BaseCommand):
    help = "Seeds FAKE fictional data for the Optimus Orien Network feature across 3 countries."

    def handle(self, *args, **options):
        self.stdout.write(self.style.WARNING("Seeding fictional demo data for Network feature..."))

        demo_passwords = {}

        # ---------------------------------------------------------------------
        # 1. ORGANISATIONS & SCHOOLS ACROSS 3 COUNTRIES
        # ---------------------------------------------------------------------
        org_pk, _ = Organisation.objects.get_or_create(
            code="FK-PK-01",
            defaults={"name": "Al-Khwarizmi Educational Trust"}
        )
        school_pk_1, _ = School.objects.get_or_create(
            code="AK-KHI-01",
            organisation=org_pk,
            defaults={"name": "Al-Khwarizmi Collegiate Karachi", "city": "Karachi"}
        )
        school_pk_2, _ = School.objects.get_or_create(
            code="AK-LHR-02",
            organisation=org_pk,
            defaults={"name": "Al-Khwarizmi Collegiate Lahore", "city": "Lahore"}
        )

        org_uk, _ = Organisation.objects.get_or_create(
            code="FK-UK-01",
            defaults={"name": "Newton Cambridge Trust"}
        )
        school_uk, _ = School.objects.get_or_create(
            code="NW-LON-01",
            organisation=org_uk,
            defaults={"name": "Newton Cambridge Academy London", "city": "London"}
        )

        org_ae, _ = Organisation.objects.get_or_create(
            code="FK-AE-01",
            defaults={"name": "Al-Amal Global Schools"}
        )
        school_ae, _ = School.objects.get_or_create(
            code="AM-DXB-01",
            organisation=org_ae,
            defaults={"name": "Al-Amal International Dubai", "city": "Dubai"}
        )

        # Institutional settings: enable network for all demo schools
        for s in [school_pk_1, school_pk_2, school_uk, school_ae]:
            SchoolNetworkSetting.objects.update_or_create(
                school=s,
                defaults={
                    "network_enabled": True,
                    "staff_board_enabled": True,
                    "student_board_enabled": True
                }
            )

        # ---------------------------------------------------------------------
        # 2. PRINCIPALS & TEACHERS
        # ---------------------------------------------------------------------
        def create_user_with_profile(username, email, first, last, role, school, headline, subjects, consented=True, rank_mode='exact'):
            pwd = generate_strong_password()
            user, created = User.objects.get_or_create(
                username=username,
                defaults={
                    "email": email,
                    "first_name": first,
                    "last_name": last,
                    "role": role,
                    "organisation": school.organisation,
                    "school": school,
                    "is_active": True
                }
            )
            if created:
                user.set_password(pwd)
                user.save()
                demo_passwords[username] = pwd

            country_map = {"Karachi": "PK", "Lahore": "PK", "London": "GB", "Dubai": "AE"}
            prof, _ = NetworkProfile.objects.update_or_create(
                user=user,
                defaults={
                    "headline": headline,
                    "bio": f"Experienced professional at {school.name}.",
                    "experience_years": 8,
                    "subjects": subjects,
                    "city_display": school.city,
                    "country_display": country_map.get(school.city, "PK"),
                    "rank_display_mode": rank_mode,
                    "is_platform_verified": role in ('principal', 'school_admin')
                }
            )

            if consented:
                consent_type = 'principal_board' if role in ('principal', 'school_admin') else 'teacher_board'
                NetworkConsent.objects.update_or_create(
                    user=user,
                    consent_type=consent_type,
                    defaults={"granted": True, "version": "2026.1"}
                )
            return user

        # Principals
        p_khi = create_user_with_profile("demo_p_khi", "p_khi@fictional.test", "Tariq", "Mansoor", "principal", school_pk_1, "Principal | Al-Khwarizmi Karachi", ["Administration"], consented=True)
        p_lhr = create_user_with_profile("demo_p_lhr", "p_lhr@fictional.test", "Saima", "Iqbal", "principal", school_pk_2, "Campus Principal | Al-Khwarizmi Lahore", ["Administration"], consented=True)
        p_uk = create_user_with_profile("demo_p_uk", "p_uk@fictional.test", "Arthur", "Pendleton", "principal", school_uk, "Headmaster | Newton Cambridge", ["Leadership"], consented=True)
        p_ae = create_user_with_profile("demo_p_ae", "p_ae@fictional.test", "Rashid", "Al-Falasi", "principal", school_ae, "Executive Principal | Dubai", ["Management"], consented=False) # Without consent

        # Teachers
        t_math_1 = create_user_with_profile("demo_t_math1", "t_math1@fictional.test", "Elena", "Rostova", "teacher", school_uk, "Senior Mathematics Specialist", ["Mathematics"], consented=True, rank_mode='exact')
        t_math_2 = create_user_with_profile("demo_t_math2", "t_math2@fictional.test", "David", "Sterling", "teacher", school_uk, "Secondary Mathematics Educator", ["Mathematics"], consented=True, rank_mode='tier_only')
        t_math_3 = create_user_with_profile("demo_t_math3", "t_math3@fictional.test", "Farhan", "Siddiqui", "teacher", school_pk_1, "Head of STEM & Math", ["Mathematics"], consented=True, rank_mode='none')
        t_math_ineligible = create_user_with_profile("demo_t_inelig", "t_inelig@fictional.test", "Sam", "Fisher", "teacher", school_ae, "Math Teacher (New Intake)", ["Mathematics"], consented=True) # Ineligible (<15 students)

        # ---------------------------------------------------------------------
        # 3. CURRICULUM, ASSESSMENTS & GRADES (Generating Ties & Most Improved)
        # ---------------------------------------------------------------------
        today = timezone.localdate()
        year_uk, _ = AcademicYear.objects.get_or_create(
            school=school_uk, name="2025-2026",
            defaults={"start_date": today - timezone.timedelta(days=180), "end_date": today + timezone.timedelta(days=180)}
        )
        subj_math, _ = Subject.objects.get_or_create(school=school_uk, code="MATH-SEC", defaults={"name": "Mathematics"})
        c_sec_a, _ = SchoolClass.objects.get_or_create(school=school_uk, academic_year=year_uk, name="Grade 9-A")
        c_sec_b, _ = SchoolClass.objects.get_or_create(school=school_uk, academic_year=year_uk, name="Grade 9-B")

        # Create 16 students for Grade 9-A (Elena) and Grade 9-B (David)
        for i in range(1, 17):
            s_a, _ = Student.objects.get_or_create(
                school=school_uk,
                admission_number=f"ST-UK-A{i}",
                defaults={"first_name": f"StudentA{i}", "last_name": "Smith", "enrolled_on": timezone.localdate()}
            )
            s_b, _ = Student.objects.get_or_create(
                school=school_uk,
                admission_number=f"ST-UK-B{i}",
                defaults={"first_name": f"StudentB{i}", "last_name": "Taylor", "enrolled_on": timezone.localdate()}
            )

        ass_1, _ = Assessment.objects.get_or_create(school_class=c_sec_a, subject=subj_math, title="Term 2 Mid Exam", defaults={"date": timezone.localdate(), "max_marks": 100})
        ass_2, _ = Assessment.objects.get_or_create(school_class=c_sec_a, subject=subj_math, title="Term 2 Final Exam", defaults={"date": timezone.localdate(), "max_marks": 100})

        ass_b1, _ = Assessment.objects.get_or_create(school_class=c_sec_b, subject=subj_math, title="Term 2 Mid Exam", defaults={"date": timezone.localdate(), "max_marks": 100})
        ass_b2, _ = Assessment.objects.get_or_create(school_class=c_sec_b, subject=subj_math, title="Term 2 Final Exam", defaults={"date": timezone.localdate(), "max_marks": 100})

        # Produce identical 85.00% score for Elena and David to verify ties (1, 2, 2, 4)
        for i in range(1, 17):
            st_a = Student.objects.get(school=school_uk, admission_number=f"ST-UK-A{i}")
            st_b = Student.objects.get(school=school_uk, admission_number=f"ST-UK-B{i}")
            Grade.objects.update_or_create(assessment=ass_1, student=st_a, defaults={"marks": Decimal('85.00')})
            Grade.objects.update_or_create(assessment=ass_2, student=st_a, defaults={"marks": Decimal('85.00')})
            Grade.objects.update_or_create(assessment=ass_b1, student=st_b, defaults={"marks": Decimal('85.00')})
            Grade.objects.update_or_create(assessment=ass_b2, student=st_b, defaults={"marks": Decimal('85.00')})

        # ---------------------------------------------------------------------
        # 4. STUDENT ACHIEVERS WITH GUARDIAN CONSENT
        # ---------------------------------------------------------------------
        guardian_user, _ = User.objects.get_or_create(
            username="demo_guardian",
            defaults={"email": "guardian@fictional.test", "first_name": "Zahid", "last_name": "Khan", "role": "parent", "is_active": True}
        )
        st_achiever = Student.objects.get(school=school_uk, admission_number="ST-UK-A1")
        st_achiever_user, _ = User.objects.get_or_create(
            username="demo_student_achiever",
            defaults={"role": "student", "first_name": "Zainab", "last_name": "Khan", "is_active": True}
        )
        st_achiever.user = st_achiever_user
        st_achiever.first_name = "Zainab"
        st_achiever.last_name = "Khan"
        st_achiever.save()

        # Grant guardian consent
        NetworkConsent.objects.update_or_create(
            user=st_achiever_user,
            consent_type='student_recognition',
            defaults={"granted": True, "guardian_user": guardian_user, "version": "2026.1"}
        )

        # ---------------------------------------------------------------------
        # 5. CONNECTIONS, REQUESTS, BLOCKS
        # ---------------------------------------------------------------------
        # Accepted connection between Elena and Farhan
        min_u, max_u = min(t_math_1.id, t_math_3.id), max(t_math_1.id, t_math_3.id)
        Connection.objects.update_or_create(user_a_id=min_u, user_b_id=max_u, defaults={"status": "active"})

        # Pending request from David to Farhan
        ConnectionRequest.objects.update_or_create(
            from_user=t_math_2, to_user=t_math_3, status="pending",
            defaults={"note": "Hi Farhan, excited to exchange ideas on high-school calculus curriculum!"}
        )

        # Declined request between Arthur and Rashid
        ConnectionRequest.objects.update_or_create(
            from_user=p_uk, to_user=p_ae, status="declined",
            defaults={"note": "Greetings from London.", "responded_at": timezone.now()}
        )

        # Block relationship: Tariq blocks Sam
        Block.objects.update_or_create(blocker=p_khi, blocked=t_math_ineligible, defaults={"reason": "Unsolicited spam messages"})

        # ---------------------------------------------------------------------
        # 6. REFRESH SNAPSHOTS & BADGE AWARDS
        # ---------------------------------------------------------------------
        refresh_network_snapshots_for_period(period_identifier="2025-2026 Term 2", academic_year_name="2025-2026")

        self.stdout.write(self.style.SUCCESS("\nNetwork Demo Seeding Complete!"))
        self.stdout.write(self.style.SUCCESS("Demo Accounts & Credentials:"))
        for uname, pwd in demo_passwords.items():
            self.stdout.write(f" - {uname:25} : {pwd}")
