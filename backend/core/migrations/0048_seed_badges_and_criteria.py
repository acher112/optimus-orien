# Generated data migration to seed the approved 46 BadgeDefinitions and criteria v1

from django.db import migrations

BADGE_SEEDS = [
    # PRINCIPAL (5 included)
    {
        'slug': 'principal_attendance_guardian',
        'name': 'Attendance Guardian',
        'category': 'principal',
        'tier': 'silver',
        'description': 'Awarded to campus principals whose school achieves 90% or higher overall attendance in a calendar month.',
        'criteria_summary': 'School-wide attendance >= 90.0% for a calendar month (min 15 instructional days). Excused absences excluded per platform policy.',
        'icon_asset_name': 'badge_principal_attendance_guardian_silver.png',
        'is_manual': False,
        'rules': {'attendance_threshold': 90.0, 'min_days': 15, 'period_type': 'month'}
    },
    {
        'slug': 'principal_academic_steward',
        'name': 'Academic Steward',
        'category': 'principal',
        'tier': 'gold',
        'description': 'Awarded to principals leading a campus with an overall published student examination average of 70% or higher in a term.',
        'criteria_summary': 'Campus-wide student overall exam average >= 70.0% in published results for a term (min 30 assessed students).',
        'icon_asset_name': 'badge_principal_academic_steward_gold.png',
        'is_manual': False,
        'rules': {'average_threshold': 70.0, 'min_students': 30, 'period_type': 'term'}
    },
    {
        'slug': 'principal_student_development_leader',
        'name': 'Student Development Leader',
        'category': 'principal',
        'tier': 'gold',
        'description': 'Awarded to principals where 70% or more students demonstrated academic improvement between consecutive published terms.',
        'criteria_summary': '>= 70.0% of matched students improved overall examination percentage between consecutive terms (min 25 matched students).',
        'icon_asset_name': 'badge_principal_student_development_leader_gold.png',
        'is_manual': False,
        'rules': {'improvement_percentage': 70.0, 'min_students': 25, 'period_type': 'consecutive_terms'}
    },
    {
        'slug': 'principal_institutional_excellence',
        'name': 'Institutional Excellence',
        'category': 'principal',
        'tier': 'platinum',
        'description': 'Recognizes campus leadership sustaining both 75%+ school academic average and 90%+ attendance across two consecutive published terms.',
        'criteria_summary': 'School average >= 75.0% AND attendance >= 90.0% maintained across 2 consecutive published terms.',
        'icon_asset_name': 'badge_principal_institutional_excellence_platinum.png',
        'is_manual': False,
        'rules': {'average_threshold': 75.0, 'attendance_threshold': 90.0, 'terms_count': 2}
    },
    {
        'slug': 'principal_legacy_of_excellence',
        'name': 'Legacy of Excellence',
        'category': 'principal',
        'tier': 'diamond',
        'description': 'The pinnacle institutional accolade recognizing exceptional sustained leadership: 80%+ school average and 92%+ attendance across four consecutive terms.',
        'criteria_summary': 'School average >= 80.0% AND attendance >= 92.0% maintained across 4 consecutive published terms (2 academic years).',
        'icon_asset_name': 'badge_principal_legacy_of_excellence_diamond.png',
        'is_manual': False,
        'rules': {'average_threshold': 80.0, 'attendance_threshold': 92.0, 'terms_count': 4}
    },

    # TEACHER (8 included)
    {
        'slug': 'teacher_attendance_star',
        'name': 'Attendance Star',
        'category': 'teacher',
        'tier': 'bronze',
        'description': 'Awarded to class teachers whose assigned class achieves 95% or higher attendance for a calendar month.',
        'criteria_summary': 'Assigned class attendance >= 95.0% for a calendar month (min 15 instructional days).',
        'icon_asset_name': 'badge_teacher_attendance_star_bronze.png',
        'is_manual': False,
        'rules': {'attendance_threshold': 95.0, 'min_days': 15, 'period_type': 'month'}
    },
    {
        'slug': 'teacher_classroom_starter',
        'name': 'Classroom Starter',
        'category': 'teacher',
        'tier': 'bronze',
        'description': 'Awarded upon completing a first full month of digital pedagogical records (attendance, homework, and observations).',
        'criteria_summary': 'Recorded active classroom logs across at least 20 instructional days without missing entries.',
        'icon_asset_name': 'badge_teacher_classroom_starter_bronze.png',
        'is_manual': False,
        'rules': {'min_active_days': 20, 'period_type': 'month'}
    },
    {
        'slug': 'teacher_homework_guardian',
        'name': 'Homework Guardian',
        'category': 'teacher',
        'tier': 'silver',
        'description': 'Recognizes meticulous homework follow-through with 95%+ verified completed homework submissions for assigned classes.',
        'criteria_summary': 'Verified homework completion rate >= 95.0% for assigned classes in a calendar month (min 5 homework assignments).',
        'icon_asset_name': 'badge_teacher_homework_guardian_silver.png',
        'is_manual': False,
        'rules': {'verification_threshold': 95.0, 'min_assignments': 5, 'period_type': 'month'}
    },
    {
        'slug': 'teacher_consistency_champion',
        'name': 'Consistency Champion',
        'category': 'teacher',
        'tier': 'silver',
        'description': 'Awarded to class teachers whose class maintains 95%+ attendance across an entire published academic term.',
        'criteria_summary': 'Assigned class term-long attendance >= 95.0% (min 40 instructional days).',
        'icon_asset_name': 'badge_teacher_consistency_champion_silver.png',
        'is_manual': False,
        'rules': {'attendance_threshold': 95.0, 'min_days': 40, 'period_type': 'term'}
    },
    {
        'slug': 'teacher_subject_specialist',
        'name': 'Subject Specialist',
        'category': 'teacher',
        'tier': 'gold',
        'description': 'Awarded to subject teachers whose assigned class achieves an 80%+ average in published examination results.',
        'criteria_summary': 'Assigned class subject average >= 80.0% in published term results (min 10 students assessed).',
        'icon_asset_name': 'badge_teacher_subject_specialist_gold.png',
        'is_manual': False,
        'rules': {'average_threshold': 80.0, 'min_students': 10, 'period_type': 'term'}
    },
    {
        'slug': 'teacher_student_motivator',
        'name': 'Student Motivator',
        'category': 'teacher',
        'tier': 'gold',
        'description': 'Awarded to teachers where 70%+ of students in their subject improved their score between consecutive published terms.',
        'criteria_summary': '>= 70.0% of matched students improved their subject final score between consecutive terms (min 10 students).',
        'icon_asset_name': 'badge_teacher_student_motivator_gold.png',
        'is_manual': False,
        'rules': {'improvement_percentage': 70.0, 'min_students': 10, 'period_type': 'consecutive_terms'}
    },
    {
        'slug': 'teacher_academic_excellence',
        'name': 'Academic Excellence (Teacher)',
        'category': 'teacher',
        'tier': 'gold',
        'description': 'Recognizes outstanding subject instruction resulting in a 90%+ class subject average in published term examinations.',
        'criteria_summary': 'Assigned class subject average >= 90.0% in published term results (min 10 students assessed).',
        'icon_asset_name': 'badge_teacher_academic_excellence_gold.png',
        'is_manual': False,
        'rules': {'average_threshold': 90.0, 'min_students': 10, 'period_type': 'term'}
    },
    {
        'slug': 'teacher_master_educator',
        'name': 'Master Educator',
        'category': 'teacher',
        'tier': 'platinum',
        'description': 'Recognizes sustained pedagogical excellence across two consecutive terms: subject average 85%+ and homework verification 90%+.',
        'criteria_summary': 'Class subject average >= 85.0% AND homework verification >= 90.0% across 2 consecutive published terms.',
        'icon_asset_name': 'badge_teacher_master_educator_platinum.png',
        'is_manual': False,
        'rules': {'average_threshold': 85.0, 'homework_threshold': 90.0, 'terms_count': 2}
    },
    {
        'slug': 'teacher_legacy_teacher',
        'name': 'Legacy Teacher',
        'category': 'teacher',
        'tier': 'diamond',
        'description': 'Honours sustained teaching impact across four consecutive terms: 80%+ subject average and 65%+ student improvement rate.',
        'criteria_summary': 'Class subject average >= 80.0% AND student improvement rate >= 65.0% sustained across 4 consecutive published terms.',
        'icon_asset_name': 'badge_teacher_legacy_teacher_diamond.png',
        'is_manual': False,
        'rules': {'average_threshold': 80.0, 'improvement_threshold': 65.0, 'terms_count': 4}
    },

    # STUDENT (14 included)
    {
        'slug': 'student_first_achievement',
        'name': 'First Achievement',
        'category': 'student',
        'tier': 'bronze',
        'description': 'Awarded upon receiving your very first official published examination result.',
        'criteria_summary': 'First published CalculatedStudentResult recorded with completed status.',
        'icon_asset_name': 'badge_student_first_achievement_bronze.png',
        'is_manual': False,
        'rules': {'count': 1, 'trigger': 'first_result'}
    },
    {
        'slug': 'student_attendance_hero',
        'name': 'Attendance Hero',
        'category': 'student',
        'tier': 'bronze',
        'description': 'Awarded for achieving 95%+ attendance during a calendar month.',
        'criteria_summary': 'Individual attendance >= 95.0% for a calendar month (min 15 school days). Excused absences excluded.',
        'icon_asset_name': 'badge_student_attendance_hero_bronze.png',
        'is_manual': False,
        'rules': {'attendance_threshold': 95.0, 'min_days': 15, 'period_type': 'month'}
    },
    {
        'slug': 'student_homework_hero',
        'name': 'Homework Hero',
        'category': 'student',
        'tier': 'bronze',
        'description': 'Awarded for 100% verified homework completion in a calendar month.',
        'criteria_summary': '100% of assigned homework submissions verified completed by teacher (min 5 assigned).',
        'icon_asset_name': 'badge_student_homework_hero_bronze.png',
        'is_manual': False,
        'rules': {'completion_rate': 100.0, 'min_assignments': 5, 'period_type': 'month'}
    },
    {
        'slug': 'student_active_learner',
        'name': 'Active Learner',
        'category': 'student',
        'tier': 'bronze',
        'description': 'Recognizes enthusiastic classroom engagement with an 8.0/10+ participation average in a month.',
        'criteria_summary': 'Average participation rating >= 8.0 out of 10 in teacher observations for a calendar month (min 4 observations).',
        'icon_asset_name': 'badge_student_active_learner_bronze.png',
        'is_manual': False,
        'rules': {'participation_threshold': 8.0, 'min_observations': 4, 'period_type': 'month'}
    },
    {
        'slug': 'student_academic_climber',
        'name': 'Academic Climber',
        'category': 'student',
        'tier': 'silver',
        'description': 'Awarded for improving your overall examination score by 5 or more percentage points between consecutive terms.',
        'criteria_summary': 'Overall examination score improved by >= +5.0 percentage points from previous published term.',
        'icon_asset_name': 'badge_student_academic_climber_silver.png',
        'is_manual': False,
        'rules': {'improvement_delta': 5.0, 'period_type': 'consecutive_terms'}
    },
    {
        'slug': 'student_subject_explorer',
        'name': 'Subject Explorer',
        'category': 'student',
        'tier': 'silver',
        'description': 'Awarded for achieving 80%+ marks in at least three distinct subjects in a published exam term.',
        'criteria_summary': '>= 3 distinct subjects with final_percentage >= 80.0% in a single published term.',
        'icon_asset_name': 'badge_student_subject_explorer_silver.png',
        'is_manual': False,
        'rules': {'min_subjects': 3, 'subject_threshold': 80.0, 'period_type': 'term'}
    },
    {
        'slug': 'student_consistency_king',
        'name': 'Consistency King',
        'category': 'student',
        'tier': 'silver',
        'description': 'Recognizes sustained diligence with 85%+ overall exam average and 90%+ attendance across two consecutive terms.',
        'criteria_summary': 'Overall exam average >= 85.0% AND attendance >= 90.0% across 2 consecutive published terms.',
        'icon_asset_name': 'badge_student_consistency_king_silver.png',
        'is_manual': False,
        'rules': {'average_threshold': 85.0, 'attendance_threshold': 90.0, 'terms_count': 2}
    },
    {
        'slug': 'student_all_rounder',
        'name': 'All-Rounder',
        'category': 'student',
        'tier': 'gold',
        'description': 'Celebrates comprehensive excellence: 80%+ exam average, 90%+ attendance, 90%+ homework, and 7.5/10+ participation in one term.',
        'criteria_summary': 'Exam avg >= 80.0%, attendance >= 90.0%, homework >= 90.0%, and participation >= 7.5 in a single published term.',
        'icon_asset_name': 'badge_student_all_rounder_gold.png',
        'is_manual': False,
        'rules': {'exam_threshold': 80.0, 'attendance_threshold': 90.0, 'homework_threshold': 90.0, 'participation_threshold': 7.5, 'period_type': 'term'}
    },
    {
        'slug': 'student_academic_excellence',
        'name': 'Academic Excellence (Student)',
        'category': 'student',
        'tier': 'gold',
        'description': 'Awarded for achieving a 90% or higher overall percentage in published term examination results.',
        'criteria_summary': 'Overall published examination percentage >= 90.0% in a term configuration.',
        'icon_asset_name': 'badge_student_academic_excellence_gold.png',
        'is_manual': False,
        'rules': {'overall_threshold': 90.0, 'period_type': 'term'}
    },
    {
        'slug': 'student_perfect_attendance',
        'name': 'Perfect Attendance',
        'category': 'student',
        'tier': 'gold',
        'description': 'Awarded for 100% attendance across an entire term, strictly applying the school excused absence policy.',
        'criteria_summary': 'Zero unexcused absences across an entire published term (min 40 instructional days). Excused absences excluded per policy.',
        'icon_asset_name': 'badge_student_perfect_attendance_gold.png',
        'is_manual': False,
        'rules': {'attendance_threshold': 100.0, 'min_days': 40, 'period_type': 'term'}
    },
    {
        'slug': 'student_subject_master',
        'name': 'Subject Master',
        'category': 'student',
        'tier': 'gold',
        'description': 'Awarded for scoring 95%+ in any individual subject in published term examination results.',
        'criteria_summary': '>= 95.0% final percentage in at least one subject in published results.',
        'icon_asset_name': 'badge_student_subject_master_gold.png',
        'is_manual': False,
        'rules': {'subject_threshold': 95.0, 'period_type': 'term'}
    },
    {
        'slug': 'student_rising_legend',
        'name': 'Rising Legend',
        'category': 'student',
        'tier': 'platinum',
        'description': 'Recognizes extraordinary growth: 15+ percentage points exam improvement across two terms with 90%+ attendance.',
        'criteria_summary': 'Improvement >= +15.0 percentage points across two terms while maintaining >= 90.0% attendance.',
        'icon_asset_name': 'badge_student_rising_legend_platinum.png',
        'is_manual': False,
        'rules': {'improvement_delta': 15.0, 'attendance_threshold': 90.0, 'terms_count': 2}
    },
    {
        'slug': 'student_scholar_supreme',
        'name': 'Scholar Supreme',
        'category': 'student',
        'tier': 'platinum',
        'description': 'Reserved for elite scholarship: 95%+ overall percentage in published term examination results.',
        'criteria_summary': 'Overall published examination percentage >= 95.0% in a term configuration.',
        'icon_asset_name': 'badge_student_scholar_supreme_platinum.png',
        'is_manual': False,
        'rules': {'overall_threshold': 95.0, 'period_type': 'term'}
    },
    {
        'slug': 'student_the_unstoppable',
        'name': 'The Unstoppable',
        'category': 'student',
        'tier': 'diamond',
        'description': 'The ultimate student accolade: 90%+ overall examination average and 95%+ attendance across three consecutive published terms.',
        'criteria_summary': 'Overall exam avg >= 90.0% AND attendance >= 95.0% maintained across 3 consecutive published terms.',
        'icon_asset_name': 'badge_student_the_unstoppable_diamond.png',
        'is_manual': False,
        'rules': {'average_threshold': 90.0, 'attendance_threshold': 95.0, 'terms_count': 3}
    },

    # QUIZ (15 included)
    {
        'slug': 'quiz_novice',
        'name': 'Quiz Novice',
        'category': 'quiz',
        'tier': 'bronze',
        'description': 'Awarded upon successfully completing your first official school quiz competition.',
        'criteria_summary': 'Completed >= 1 official quiz attempt (is_official=True).',
        'icon_asset_name': 'badge_quiz_novice_bronze.png',
        'is_manual': False,
        'rules': {'attempt_count': 1}
    },
    {
        'slug': 'quiz_regular',
        'name': 'Quiz Regular',
        'category': 'quiz',
        'tier': 'bronze',
        'description': 'Awarded for completing 10 official quiz competitions.',
        'criteria_summary': 'Completed >= 10 official quiz attempts.',
        'icon_asset_name': 'badge_quiz_regular_bronze.png',
        'is_manual': False,
        'rules': {'attempt_count': 10}
    },
    {
        'slug': 'quiz_veteran',
        'name': 'Quiz Veteran',
        'category': 'quiz',
        'tier': 'silver',
        'description': 'Awarded for completing 50 official quiz competitions.',
        'criteria_summary': 'Completed >= 50 official quiz attempts.',
        'icon_asset_name': 'badge_quiz_veteran_silver.png',
        'is_manual': False,
        'rules': {'attempt_count': 50}
    },
    {
        'slug': 'quiz_master',
        'name': 'Quiz Master',
        'category': 'quiz',
        'tier': 'gold',
        'description': 'Awarded for completing 100 official quiz competitions.',
        'criteria_summary': 'Completed >= 100 official quiz attempts.',
        'icon_asset_name': 'badge_quiz_master_gold.png',
        'is_manual': False,
        'rules': {'attempt_count': 100}
    },
    {
        'slug': 'quiz_champion',
        'name': 'Quiz Champion',
        'category': 'quiz',
        'tier': 'platinum',
        'description': 'Awarded for completing 250 official quiz competitions.',
        'criteria_summary': 'Completed >= 250 official quiz attempts.',
        'icon_asset_name': 'badge_quiz_champion_platinum.png',
        'is_manual': False,
        'rules': {'attempt_count': 250}
    },
    {
        'slug': 'quiz_legend',
        'name': 'Quiz Legend',
        'category': 'quiz',
        'tier': 'diamond',
        'description': 'The ultimate quiz participation milestone: completing 1,000 official quiz competitions.',
        'criteria_summary': 'Completed >= 1,000 official quiz attempts.',
        'icon_asset_name': 'badge_quiz_legend_diamond.png',
        'is_manual': False,
        'rules': {'attempt_count': 1000}
    },
    {
        'slug': 'quiz_sharpshooter',
        'name': 'Sharpshooter',
        'category': 'quiz',
        'tier': 'bronze',
        'description': 'Awarded for achieving 80%+ accuracy on an official quiz competition.',
        'criteria_summary': 'Accuracy percentage >= 80.0% on at least 1 official quiz attempt.',
        'icon_asset_name': 'badge_quiz_sharpshooter_bronze.png',
        'is_manual': False,
        'rules': {'accuracy_threshold': 80.0, 'count': 1}
    },
    {
        'slug': 'quiz_precision_scholar',
        'name': 'Precision Scholar',
        'category': 'quiz',
        'tier': 'silver',
        'description': 'Awarded for achieving 90%+ accuracy on at least 5 official quiz competitions.',
        'criteria_summary': 'Accuracy percentage >= 90.0% on >= 5 official quiz attempts.',
        'icon_asset_name': 'badge_quiz_precision_scholar_silver.png',
        'is_manual': False,
        'rules': {'accuracy_threshold': 90.0, 'count': 5}
    },
    {
        'slug': 'quiz_mastermind',
        'name': 'Mastermind',
        'category': 'quiz',
        'tier': 'gold',
        'description': 'Awarded for achieving 95%+ accuracy on at least 10 official quiz competitions.',
        'criteria_summary': 'Accuracy percentage >= 95.0% on >= 10 official quiz attempts.',
        'icon_asset_name': 'badge_quiz_mastermind_gold.png',
        'is_manual': False,
        'rules': {'accuracy_threshold': 95.0, 'count': 10}
    },
    {
        'slug': 'quiz_flawless_genius',
        'name': 'Flawless Genius',
        'category': 'quiz',
        'tier': 'platinum',
        'description': 'Awarded for achieving a perfect 100% score on at least 5 official quiz competitions.',
        'criteria_summary': 'Accuracy percentage == 100.0% on >= 5 official quiz attempts.',
        'icon_asset_name': 'badge_quiz_flawless_genius_platinum.png',
        'is_manual': False,
        'rules': {'accuracy_threshold': 100.0, 'count': 5}
    },
    {
        'slug': 'quiz_subject_specialist',
        'name': 'Quiz Subject Specialist',
        'category': 'quiz',
        'tier': 'silver',
        'description': 'Awarded for completing 10+ official quizzes in a single subject with 85%+ average accuracy.',
        'criteria_summary': '>= 10 official attempts in one subject with average accuracy >= 85.0%.',
        'icon_asset_name': 'badge_quiz_subject_specialist_silver.png',
        'is_manual': False,
        'rules': {'min_attempts': 10, 'accuracy_threshold': 85.0}
    },
    {
        'slug': 'quiz_multidisciplinary',
        'name': 'Multidisciplinary Scholar',
        'category': 'quiz',
        'tier': 'gold',
        'description': 'Demonstrated breadth by achieving 80%+ accuracy across at least 3 distinct quiz subjects.',
        'criteria_summary': '>= 3 distinct quiz subjects with accuracy >= 80.0% in each.',
        'icon_asset_name': 'badge_quiz_multidisciplinary_gold.png',
        'is_manual': False,
        'rules': {'min_distinct_subjects': 3, 'accuracy_threshold': 80.0}
    },
    {
        'slug': 'quiz_speed_scholar',
        'name': 'Speed Scholar',
        'category': 'quiz',
        'tier': 'gold',
        'description': 'Scored 90%+ on an official quiz while finishing in less than half the allocated duration.',
        'criteria_summary': 'Score >= 90.0% with time_spent_seconds < (duration_minutes * 60 / 2).',
        'icon_asset_name': 'badge_quiz_speed_scholar_gold.png',
        'is_manual': False,
        'rules': {'score_threshold': 90.0, 'time_ratio_threshold': 0.5}
    },
    {
        'slug': 'quiz_streak_30',
        'name': '30-Quiz Streak',
        'category': 'quiz',
        'tier': 'platinum',
        'description': 'Maintained a 30-day streak with at least one official quiz completed each calendar day.',
        'criteria_summary': '>= 30 consecutive calendar days with an official quiz attempt.',
        'icon_asset_name': 'badge_quiz_streak_30_platinum.png',
        'is_manual': False,
        'rules': {'consecutive_days': 30}
    },
    {
        'slug': 'quiz_grandmaster',
        'name': 'Quiz Grandmaster',
        'category': 'quiz',
        'tier': 'diamond',
        'description': 'Elite academic competitor: 100+ official quizzes, 90%+ average accuracy, and top 5% campus quiz percentile.',
        'criteria_summary': '>= 100 official quizzes, overall accuracy >= 90.0%, and campus percentile >= 95th.',
        'icon_asset_name': 'badge_quiz_grandmaster_diamond.png',
        'is_manual': False,
        'rules': {'min_attempts': 100, 'accuracy_threshold': 90.0, 'percentile_threshold': 95.0}
    },

    # MANUAL RECOGNITION (4 included)
    {
        'slug': 'manual_inspirational_teacher',
        'name': 'Inspirational Teacher',
        'category': 'manual',
        'tier': 'gold',
        'description': 'Conferred by an Organisation Admin or Principal in recognition of inspiring pedagogy and devotion.',
        'criteria_summary': 'Conferred manually with mandatory audit justification by authorized administrator.',
        'icon_asset_name': 'badge_manual_inspirational_teacher_gold.png',
        'is_manual': True,
        'rules': {'min_reason_length': 10, 'allowed_grantor_roles': ['organisation_admin', 'school_admin', 'principal']}
    },
    {
        'slug': 'manual_principal_honour',
        'name': "Principal's Honour",
        'category': 'manual',
        'tier': 'gold',
        'description': 'Conferred in recognition of distinguished campus leadership or institutional stewardship.',
        'criteria_summary': 'Conferred manually by Organisation Admin to Principal, or Principal to Teacher.',
        'icon_asset_name': 'badge_manual_principal_honour_gold.png',
        'is_manual': True,
        'rules': {'min_reason_length': 10, 'allowed_grantor_roles': ['organisation_admin', 'principal']}
    },
    {
        'slug': 'manual_teachers_commendation',
        'name': "Teacher's Commendation",
        'category': 'manual',
        'tier': 'silver',
        'description': 'Conferred by a teacher to a student of their assigned class for remarkable character, effort, or growth.',
        'criteria_summary': 'Conferred manually by Class/Subject Teacher to a student of their assigned class.',
        'icon_asset_name': 'badge_manual_teachers_commendation_silver.png',
        'is_manual': True,
        'rules': {'min_reason_length': 10, 'allowed_grantor_roles': ['teacher', 'principal']}
    },
    {
        'slug': 'manual_leadership_distinction',
        'name': 'Leadership Distinction',
        'category': 'manual',
        'tier': 'platinum',
        'description': 'Executive commendation awarded by an Organisation Admin for exceptional leadership innovation.',
        'criteria_summary': 'Conferred manually by Organisation Admin to an Institutional Leader / Principal.',
        'icon_asset_name': 'badge_manual_leadership_distinction_platinum.png',
        'is_manual': True,
        'rules': {'min_reason_length': 10, 'allowed_grantor_roles': ['organisation_admin']}
    },
]


def seed_badges(apps, schema_editor):
    BadgeDefinition = apps.get_model('core', 'BadgeDefinition')
    BadgeCriteria = apps.get_model('core', 'BadgeCriteria')

    for item in BADGE_SEEDS:
        badge, created = BadgeDefinition.objects.update_or_create(
            slug=item['slug'],
            defaults={
                'name': item['name'],
                'category': item['category'],
                'tier': item['tier'],
                'description': item['description'],
                'criteria_summary': item['criteria_summary'],
                'icon_asset_name': item['icon_asset_name'],
                'is_active': True,
                'is_manual': item['is_manual'],
            }
        )
        BadgeCriteria.objects.update_or_create(
            badge=badge,
            version=1,
            defaults={
                'rules': item['rules'],
                'active': True,
                'explanation_of_change': 'Initial version 1 criteria baseline.',
            }
        )


def revert_badges(apps, schema_editor):
    BadgeDefinition = apps.get_model('core', 'BadgeDefinition')
    BadgeDefinition.objects.filter(slug__in=[b['slug'] for b in BADGE_SEEDS]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0047_badges_and_achievements'),
    ]

    operations = [
        migrations.RunPython(seed_badges, revert_badges),
    ]
