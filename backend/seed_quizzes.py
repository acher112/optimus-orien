import os
import sys
import django

# Setup Django environment
sys.path.insert(0, r'd:\optimus-orien\optimus-orien\backend')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config')
django.setup()

from core.models import School, User, Student, QuizCompetition, QuizQuestion, QuizAttempt

def seed_quizzes():
    print("Seeding Quiz Competitions & Questions...")
    
    # Grab representative schools or create/get
    beaconhouse = School.objects.filter(name__icontains='Falcon').first() or School.objects.first()
    albion = School.objects.filter(name__icontains='Margalla').first() or School.objects.last()
    alnoor = School.objects.filter(name__icontains='Crescent').first() or School.objects.first()
    
    student_user = User.objects.filter(role='student').first() or User.objects.first()
    student_record = Student.objects.first()
    
    # 1. Math Olympiad
    comp1, _ = QuizCompetition.objects.update_or_create(
        title="Global Grade 8 Mathematics Olympiad 2026",
        defaults={
            "sponsor_school": beaconhouse,
            "sponsor_name": "Beaconhouse Gulberg Campus",
            "subject": "Mathematics",
            "grade_level": "Grade 8",
            "curriculum": "Cambridge IGCSE",
            "duration_minutes": 20,
            "max_participants": 2000,
            "registered_count": 642,
            "eligible_countries": "Global",
            "question_format_desc": "Numerical, MCQ, True/False, Matching",
            "total_marks": 40,
            "is_official": True,
            "difficulty": "Olympiad",
            "scope": "public",
            "invite_code": "OLYMP-M8"
        }
    )
    
    # Questions for comp1
    QuizQuestion.objects.filter(competition=comp1).delete()
    QuizQuestion.objects.create(
        competition=comp1,
        order=1,
        prompt="Calculate the exact value of x in the linear equation: 4(2x - 3) = 3(x + 6) + 11",
        question_type="numerical",
        options=[],
        correct_answer={"value": 8.2},
        tolerance=0.1,
        unit="",
        explanation="Expanding both sides: 8x - 12 = 3x + 18 + 11 => 8x - 12 = 3x + 29 => 5x = 41 => x = 8.2.",
        marks=10
    )
    QuizQuestion.objects.create(
        competition=comp1,
        order=2,
        prompt="Which of the following numbers is strictly an irrational real number?",
        question_type="multiple_choice",
        options=[
            {"id": "A", "text": "√16"},
            {"id": "B", "text": "22/7"},
            {"id": "C", "text": "√2"},
            {"id": "D", "text": "0.333..."}
        ],
        correct_answer={"id": "C"},
        explanation="√2 cannot be expressed as a ratio of two integers p/q, hence it is irrational. √16 = 4, 22/7 is rational, and 0.333... = 1/3.",
        marks=10
    )
    QuizQuestion.objects.create(
        competition=comp1,
        order=3,
        prompt="The diagonals of any rhombus always intersect at right angles (perpendicular bisectors).",
        question_type="true_false",
        options=[
            {"id": "true", "text": "True"},
            {"id": "false", "text": "False"}
        ],
        correct_answer={"id": "true"},
        explanation="By Euclidean geometry, the diagonals of a rhombus are mutually perpendicular and bisect opposite angles.",
        marks=10
    )
    QuizQuestion.objects.create(
        competition=comp1,
        order=4,
        prompt="Match each geometrical property with its associated formula:",
        question_type="matching",
        options=[
            {"left": "Area of Circle", "right_options": ["πr²", "2πr", "4/3 πr³", "4πr²"]},
            {"left": "Circumference of Circle", "right_options": ["πr²", "2πr", "4/3 πr³", "4πr²"]},
            {"left": "Volume of Sphere", "right_options": ["πr²", "2πr", "4/3 πr³", "4πr²"]},
            {"left": "Surface Area of Sphere", "right_options": ["πr²", "2πr", "4/3 πr³", "4πr²"]}
        ],
        correct_answer={
            "Area of Circle": "πr²",
            "Circumference of Circle": "2πr",
            "Volume of Sphere": "4/3 πr³",
            "Surface Area of Sphere": "4πr²"
        },
        explanation="Standard solid geometry definitions for circular and spherical measurements.",
        marks=10
    )

    # 2. Physics Diagnostic
    comp2, _ = QuizCompetition.objects.update_or_create(
        title="International Cambridge Physics Diagnostic",
        defaults={
            "sponsor_school": albion,
            "sponsor_name": "Albion Collegiate Academy",
            "subject": "Physics",
            "grade_level": "Grade 9-10",
            "curriculum": "British A-Level / IGCSE",
            "duration_minutes": 15,
            "max_participants": 1200,
            "registered_count": 419,
            "eligible_countries": "Global",
            "question_format_desc": "Numerical, MCQ, True/False, Matching",
            "total_marks": 40,
            "is_official": True,
            "difficulty": "Advanced",
            "scope": "public",
            "invite_code": "PHYS-IG10"
        }
    )
    QuizQuestion.objects.filter(competition=comp2).delete()
    QuizQuestion.objects.create(
        competition=comp2,
        order=1,
        prompt="A high-speed train accelerates uniformly from rest at 2.5 m/s² for exactly 8 seconds. Calculate its final velocity in m/s.",
        question_type="numerical",
        options=[],
        correct_answer={"value": 20.0},
        tolerance=0.2,
        unit="m/s",
        explanation="Using the first equation of motion v = u + at: with initial velocity u = 0, acceleration a = 2.5 m/s², and time t = 8s, we obtain v = 0 + (2.5 * 8) = 20.0 m/s.",
        marks=10
    )
    QuizQuestion.objects.create(
        competition=comp2,
        order=2,
        prompt="Which of Newton's laws of motion provides the theoretical basis for the conservation of linear momentum in isolated collisions?",
        question_type="multiple_choice",
        options=[
            {"id": "A", "text": "Newton's First Law of Inertia"},
            {"id": "B", "text": "Newton's Second Law (F = dp/dt)"},
            {"id": "C", "text": "Newton's Third Law (Action & Reaction)"},
            {"id": "D", "text": "Newton's Law of Universal Gravitation"}
        ],
        correct_answer={"id": "C"},
        explanation="Newton's Third Law states every action has an equal and opposite reaction. Over the interaction time Δt, impulses are equal and opposite, conserving total momentum.",
        marks=10
    )
    QuizQuestion.objects.create(
        competition=comp2,
        order=3,
        prompt="Mass is an intrinsic scalar quantity, whereas weight is a gravitational vector force dependent on local field strength.",
        question_type="true_false",
        options=[
            {"id": "true", "text": "True"},
            {"id": "false", "text": "False"}
        ],
        correct_answer={"id": "true"},
        explanation="Mass is invariant and measured in kilograms (scalar); weight is W = mg, directed downwards towards the gravitational centre (vector).",
        marks=10
    )
    QuizQuestion.objects.create(
        competition=comp2,
        order=4,
        prompt="Match each physical quantity with its derived SI unit:",
        question_type="matching",
        options=[
            {"left": "Force", "right_options": ["Newtons (N)", "Joules (J)", "Watts (W)", "Pascals (Pa)"]},
            {"left": "Work & Energy", "right_options": ["Newtons (N)", "Joules (J)", "Watts (W)", "Pascals (Pa)"]},
            {"left": "Power", "right_options": ["Newtons (N)", "Joules (J)", "Watts (W)", "Pascals (Pa)"]},
            {"left": "Pressure", "right_options": ["Newtons (N)", "Joules (J)", "Watts (W)", "Pascals (Pa)"]}
        ],
        correct_answer={
            "Force": "Newtons (N)",
            "Work & Energy": "Joules (J)",
            "Power": "Watts (W)",
            "Pressure": "Pascals (Pa)"
        },
        explanation="Force = kg·m/s² (N), Energy = N·m (J), Power = J/s (W), Pressure = N/m² (Pa).",
        marks=10
    )

    # 3. Biology Challenge
    comp3, _ = QuizCompetition.objects.update_or_create(
        title="IB & IGCSE Life Sciences Challenge",
        defaults={
            "sponsor_school": alnoor,
            "sponsor_name": "Al-Noor Horizon School",
            "subject": "Biology",
            "grade_level": "Grade 8-10",
            "curriculum": "IB MYP / Diploma",
            "duration_minutes": 15,
            "max_participants": 1500,
            "registered_count": 389,
            "eligible_countries": "Global",
            "question_format_desc": "Numerical, MCQ, True/False, Matching",
            "total_marks": 40,
            "is_official": True,
            "difficulty": "Intermediate",
            "scope": "public",
            "invite_code": "BIO-LIFE8"
        }
    )
    QuizQuestion.objects.filter(competition=comp3).delete()
    QuizQuestion.objects.create(
        competition=comp3,
        order=1,
        prompt="During aerobic cellular respiration in eukaryotic cells, which organelle generates the vast majority of ATP molecules?",
        question_type="multiple_choice",
        options=[
            {"id": "A", "text": "Ribosome"},
            {"id": "B", "text": "Mitochondria"},
            {"id": "C", "text": "Endoplasmic Reticulum"},
            {"id": "D", "text": "Golgi Apparatus"}
        ],
        correct_answer={"id": "B"},
        explanation="Mitochondria perform the citric acid cycle and oxidative phosphorylation, yielding approximately 30-32 ATP per glucose.",
        marks=10
    )
    QuizQuestion.objects.create(
        competition=comp3,
        order=2,
        prompt="Plant cells undergo plasmolysis when placed in a hypotonic solution.",
        question_type="true_false",
        options=[
            {"id": "true", "text": "True"},
            {"id": "false", "text": "False"}
        ],
        correct_answer={"id": "false"},
        explanation="Plasmolysis occurs in hypertonic solutions when water leaves the cell; hypotonic solutions produce turgid cells.",
        marks=10
    )
    QuizQuestion.objects.create(
        competition=comp3,
        order=3,
        prompt="How many hydrogen bonds connect Guanine and Cytosine in Watson-Crick double-stranded DNA base pairing?",
        question_type="numerical",
        options=[],
        correct_answer={"value": 3.0},
        tolerance=0.0,
        unit="bonds",
        explanation="G-C pairs form 3 hydrogen bonds, while A-T pairs form 2 hydrogen bonds.",
        marks=10
    )
    QuizQuestion.objects.create(
        competition=comp3,
        order=4,
        prompt="Match the biomolecule with its fundamental monomer building block:",
        question_type="matching",
        options=[
            {"left": "Protein", "right_options": ["Amino Acids", "Monosaccharides", "Nucleotides", "Fatty Acids"]},
            {"left": "Carbohydrate", "right_options": ["Amino Acids", "Monosaccharides", "Nucleotides", "Fatty Acids"]},
            {"left": "DNA / RNA", "right_options": ["Amino Acids", "Monosaccharides", "Nucleotides", "Fatty Acids"]},
            {"left": "Lipid Triglyceride", "right_options": ["Amino Acids", "Monosaccharides", "Nucleotides", "Fatty Acids"]}
        ],
        correct_answer={
            "Protein": "Amino Acids",
            "Carbohydrate": "Monosaccharides",
            "DNA / RNA": "Nucleotides",
            "Lipid Triglyceride": "Fatty Acids"
        },
        explanation="Proteins are polymers of amino acids; nucleic acids are polymers of nucleotides; carbohydrates derive from simple sugars.",
        marks=10
    )

    # 4. Student Practice Drills
    p1, _ = QuizCompetition.objects.update_or_create(
        invite_code="MATH-433",
        defaults={
            "title": "Linear Equations Speed Practice",
            "sponsor_name": "Ayesha Khan (Peer Drill)",
            "subject": "Mathematics",
            "grade_level": "Grade 8",
            "curriculum": "Cambridge IGCSE",
            "duration_minutes": 10,
            "max_participants": 50,
            "registered_count": 28,
            "eligible_countries": "Global",
            "total_marks": 30,
            "is_official": False,
            "difficulty": "Intermediate",
            "scope": "public",
            "created_by": student_user
        }
    )
    p2, _ = QuizCompetition.objects.update_or_create(
        invite_code="BIO-9042",
        defaults={
            "title": "Human Digestive System Drill",
            "sponsor_name": "Liam Vance-Sterling (Peer Drill)",
            "subject": "Biology",
            "grade_level": "Grade 8-9",
            "curriculum": "British A-Level",
            "duration_minutes": 12,
            "max_participants": 50,
            "registered_count": 19,
            "eligible_countries": "Global",
            "total_marks": 30,
            "is_official": False,
            "difficulty": "Foundation",
            "scope": "public",
            "created_by": student_user
        }
    )
    p3, _ = QuizCompetition.objects.update_or_create(
        invite_code="MATH-318",
        defaults={
            "title": "Quadratic Equations Rapid Practice",
            "sponsor_name": "Hamza Tariq (Peer Drill)",
            "subject": "Mathematics",
            "grade_level": "Grade 9",
            "curriculum": "Cambridge IGCSE",
            "duration_minutes": 8,
            "max_participants": 50,
            "registered_count": 14,
            "eligible_countries": "Global",
            "total_marks": 30,
            "is_official": False,
            "difficulty": "Advanced",
            "scope": "public",
            "created_by": student_user
        }
    )

    print("Competitions and Questions successfully seeded!")

if __name__ == '__main__':
    seed_quizzes()
