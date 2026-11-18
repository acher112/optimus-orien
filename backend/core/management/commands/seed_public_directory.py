"""Management Command: seed_public_directory

Seeds ~20 realistic, clearly fictional campus listings across 3 countries (Pakistan, UK, UAE)
with diverse examination boards, grade levels, AQI performance bands, and historical snapshots.
STRICTLY FAKE DATA ONLY - no real school names, no real persons, no child photos.
"""
from decimal import Decimal
from django.core.management.base import BaseCommand
from django.utils import timezone
from django.utils.text import slugify
from core.models import (
    Organisation, School, User, AcademicYear, SchoolClass, Subject, ClassSubject,
    Student, Enrollment, Assessment, Grade, ExamConfiguration,
    CalculatedStudentResult, PublicCampusListing, PublicRankSnapshot,
    PublicListingConsent, PublicListingEvent, SchoolPublicProfileDraft
)
from core.services.public_directory_service import refresh_public_snapshots


FICTIONAL_CAMPUSES = [
    # ---------------- Pakistan Campuses ----------------
    {
        'code': 'LHR-FALC',
        'name': 'Falcon Horizon Grammar School',
        'country': 'Pakistan',
        'province': 'Punjab',
        'city': 'Lahore',
        'address': 'Plot 42, Sector F-1, Fictional Greens, Lahore',
        'lat': Decimal('31.520400'),
        'lng': Decimal('74.358700'),
        'boards': ['Cambridge', 'Federal Board'],
        'levels': ['Primary', 'Middle', 'Secondary'],
        'gender': 'co-ed',
        'medium': 'english',
        'est': 2008,
        'facilities': ['Robotics Lab', 'Indoor Badminton Court', 'Digital Library', 'Science Laboratory'],
        'tagline': 'Excellence through curiosity, leadership, and scientific inquiry.',
        'about': 'A premier progressive academic institution dedicated to cultivating critical thinking, STEM mastery, and ethical civic responsibility in learners.',
        'principal': 'Dr. Arsalan Fictional-Lead',
        'show_principal': True,
        'consent_direct': True,
        'phone': '+92-42-5550101',
        'email': 'admissions@falcon-horizon-test.edu.pk',
        'direct_phone': '+92-300-5550101',
        'direct_email': 'principal.arsalan@falcon-horizon-test.edu.pk',
        'contact_mode': 'official_contact',
        'rank_mode': 'exact_rank',
        'admission': 'open',
        'base_aqi': Decimal('93.40'),
        'prev_aqi': Decimal('89.20'),
        'students_count': 45,
        'status': 'live',
    },
    {
        'code': 'LHR-CRES',
        'name': 'Crescent Valley Model Academy',
        'country': 'Pakistan',
        'province': 'Punjab',
        'city': 'Lahore',
        'address': '88 Canal Promenade, Gulberg Vista, Lahore',
        'lat': Decimal('31.505000'),
        'lng': Decimal('74.342000'),
        'boards': ['Punjab Board', 'Federal Board'],
        'levels': ['Middle', 'Secondary', 'Higher Secondary'],
        'gender': 'co-ed',
        'medium': 'english',
        'est': 2012,
        'facilities': ['Chemistry Lab', 'Football Ground', 'Auditorium', 'Coding Center'],
        'tagline': 'Inspiring academic discipline and modern technological competence.',
        'about': 'Providing rigorous secondary education with equal emphasis on national curriculum excellence and modern extracurricular growth.',
        'principal': 'Mrs. Samina Placeholder-Principal',
        'show_principal': True,
        'consent_direct': False,
        'phone': '+92-42-5550102',
        'email': 'office@crescent-valley-test.edu.pk',
        'contact_mode': 'enquiry_only',
        'rank_mode': 'exact_rank',
        'admission': 'open',
        'base_aqi': Decimal('88.10'),
        'prev_aqi': Decimal('82.50'),
        'students_count': 60,
        'status': 'live',
    },
    {
        'code': 'ISB-MARG',
        'name': 'Margalla Summit International Academy',
        'country': 'Pakistan',
        'province': 'Federal Capital',
        'city': 'Islamabad',
        'address': 'Sector E-7 Hillside Road, Islamabad',
        'lat': Decimal('33.729400'),
        'lng': Decimal('73.093100'),
        'boards': ['Cambridge', 'Federal Board'],
        'levels': ['Primary', 'Middle', 'Secondary'],
        'gender': 'co-ed',
        'medium': 'english',
        'est': 2004,
        'facilities': ['Olympic-size Pool', 'Observatory', 'Orchestra Hall', 'Language Studio'],
        'tagline': 'Global vision anchored in timeless values.',
        'about': 'Ranked among the premier benchmark institutions in the northern capital region, offering dual international and national certifications.',
        'principal': 'Dr. Tariq Demo-Scholar',
        'show_principal': True,
        'consent_direct': True,
        'phone': '+92-51-5550103',
        'email': 'enquiries@margalla-summit-test.edu.pk',
        'direct_phone': '+92-333-5550103',
        'direct_email': 'tariq.scholar@margalla-summit-test.edu.pk',
        'contact_mode': 'principal_direct',
        'rank_mode': 'exact_rank',
        'admission': 'open',
        'base_aqi': Decimal('95.80'),
        'prev_aqi': Decimal('94.10'),
        'students_count': 75,
        'status': 'live',
    },
    {
        'code': 'ISB-CAPT',
        'name': 'Capital Crest Secondary School',
        'country': 'Pakistan',
        'province': 'Federal Capital',
        'city': 'Islamabad',
        'address': 'Street 14, Sector G-10/4, Islamabad',
        'lat': Decimal('33.684400'),
        'lng': Decimal('73.010200'),
        'boards': ['Federal Board'],
        'levels': ['Secondary', 'Higher Secondary'],
        'gender': 'boys',
        'medium': 'english',
        'est': 2015,
        'facilities': ['Cricket Academy', 'Physics Lab', 'Library'],
        'tagline': 'Building character, resilience, and intellectual capability.',
        'about': 'Focused on preparatory rigor and board exam distinction with disciplined mentoring.',
        'principal': 'Mr. Haroon Test-Administrator',
        'show_principal': False,
        'consent_direct': False,
        'phone': '+92-51-5550104',
        'email': 'info@capital-crest-test.edu.pk',
        'contact_mode': 'official_contact',
        'rank_mode': 'tier_only',
        'admission': 'closed',
        'base_aqi': Decimal('84.20'),
        'prev_aqi': Decimal('80.00'),
        'students_count': 50,
        'status': 'live',
    },
    {
        'code': 'KHI-JASM',
        'name': 'Jasmine Harbor Collegiate',
        'country': 'Pakistan',
        'province': 'Sindh',
        'city': 'Karachi',
        'address': 'Marine Drive, Block 2, Clifton Beachway, Karachi',
        'lat': Decimal('24.813800'),
        'lng': Decimal('67.030000'),
        'boards': ['Cambridge', 'Aga Khan Board'],
        'levels': ['Primary', 'Middle', 'Secondary'],
        'gender': 'co-ed',
        'medium': 'english',
        'est': 2001,
        'facilities': ['Marine Biology Club', 'Squash Courts', 'Maker Space', 'Cafeteria'],
        'tagline': 'Empowering future leaders by the sea.',
        'about': 'A renowned metropolitan school combining rigorous arts, sciences, and environmental citizenship programs.',
        'principal': 'Ms. Zubeida Mock-Educator',
        'show_principal': True,
        'consent_direct': False,
        'phone': '+92-21-5550105',
        'email': 'frontdesk@jasmine-harbor-test.edu.pk',
        'contact_mode': 'official_contact',
        'rank_mode': 'exact_rank',
        'admission': 'open',
        'base_aqi': Decimal('91.50'),
        'prev_aqi': Decimal('88.40'),
        'students_count': 90,
        'status': 'live',
    },
    {
        'code': 'KHI-SEAV',
        'name': 'Seaview Vista High School',
        'country': 'Pakistan',
        'province': 'Sindh',
        'city': 'Karachi',
        'address': 'Phase 6, Defense Extension, Karachi',
        'lat': Decimal('24.795000'),
        'lng': Decimal('67.060000'),
        'boards': ['Sindh Board', 'Federal Board'],
        'levels': ['Middle', 'Secondary'],
        'gender': 'girls',
        'medium': 'english',
        'est': 2016,
        'facilities': ['Art Gallery', 'Computer Lab', 'Gymnasium'],
        'tagline': 'Nurturing female leaders in science, technology, and humanities.',
        'about': 'Dedicated all-girls secondary institution prioritizing STEM careers and holistic self-confidence.',
        'principal': 'Dr. Nighat Fake-Director',
        'show_principal': True,
        'consent_direct': True,
        'phone': '+92-21-5550106',
        'email': 'contact@seaview-vista-test.edu.pk',
        'direct_phone': '+92-321-5550106',
        'direct_email': 'nighat.dir@seaview-vista-test.edu.pk',
        'contact_mode': 'principal_direct',
        'rank_mode': 'exact_rank',
        'admission': 'open',
        'base_aqi': Decimal('79.10'),
        'prev_aqi': Decimal('71.30'),
        'students_count': 40,
        'status': 'live',
    },
    {
        'code': 'RWP-POTO',
        'name': 'Potohar Ridge Grammar Campus',
        'country': 'Pakistan',
        'province': 'Punjab',
        'city': 'Rawalpindi',
        'address': 'Chaklala Scheme III, Rawalpindi',
        'lat': Decimal('33.590000'),
        'lng': Decimal('73.080000'),
        'boards': ['Punjab Board', 'Federal Board'],
        'levels': ['Primary', 'Middle', 'Secondary'],
        'gender': 'co-ed',
        'medium': 'english',
        'est': 2018,
        'facilities': ['Science Lab', 'Badminton Court', 'Library'],
        'tagline': 'Solid academic roots for a changing world.',
        'about': 'Providing balanced educational pathways with supportive cohort attention and strong foundation skills.',
        'principal': 'Mr. Faisal Fictitious-Head',
        'show_principal': False,
        'consent_direct': False,
        'phone': '+92-51-5550107',
        'email': 'admin@potohar-ridge-test.edu.pk',
        'contact_mode': 'enquiry_only',
        'rank_mode': 'unranked_listing',
        'admission': 'open',
        'base_aqi': Decimal('64.30'),
        'prev_aqi': Decimal('60.00'),
        'students_count': 35,
        'status': 'live',
    },
    {
        'code': 'FSD-LYAL',
        'name': 'Lyallpur Oasis Modern School',
        'country': 'Pakistan',
        'province': 'Punjab',
        'city': 'Faisalabad',
        'address': 'East Canal Express Road, Faisalabad',
        'lat': Decimal('31.418700'),
        'lng': Decimal('73.079100'),
        'boards': ['Punjab Board'],
        'levels': ['Primary', 'Middle', 'Secondary'],
        'gender': 'co-ed',
        'medium': 'urdu',
        'est': 2010,
        'facilities': ['Audio-Visual Hall', 'Biology Lab', 'Playground'],
        'tagline': 'Quality education rooted in bilingual competence and community spirit.',
        'about': 'A respected regional center delivering strong science foundation and rich community programs.',
        'principal': 'Mr. Asim Test-Dean',
        'show_principal': True,
        'consent_direct': False,
        'phone': '+92-41-5550108',
        'email': 'info@lyallpur-oasis-test.edu.pk',
        'contact_mode': 'official_contact',
        'rank_mode': 'exact_rank',
        'admission': 'closed',
        'base_aqi': Decimal('71.80'),
        'prev_aqi': Decimal('67.40'),
        'students_count': 55,
        'status': 'live',
    },
    {
        'code': 'PEW-KHYB',
        'name': 'Khyber Vista Collegiate',
        'country': 'Pakistan',
        'province': 'Khyber Pakhtunkhwa',
        'city': 'Peshawar',
        'address': 'University Town Avenue, Peshawar',
        'lat': Decimal('34.015100'),
        'lng': Decimal('71.524900'),
        'boards': ['Federal Board'],
        'levels': ['Middle', 'Secondary'],
        'gender': 'boys',
        'medium': 'english',
        'est': 2014,
        'facilities': ['Science Wing', 'Library', 'Sports Arena'],
        'tagline': 'Courage, intellectual discipline, and academic honor.',
        'about': 'A structured boys secondary campus fostering academic perseverance and leadership values.',
        'principal': 'Prof. Shakir Simulated-Principal',
        'show_principal': False,
        'consent_direct': False,
        'phone': '+92-91-5550109',
        'email': 'reception@khyber-vista-test.edu.pk',
        'contact_mode': 'enquiry_only',
        'rank_mode': 'exact_rank',
        'admission': 'open',
        'base_aqi': Decimal('62.90'),
        'prev_aqi': Decimal('58.10'),
        'students_count': 30,
        'status': 'live',
    },
    {
        'code': 'LHR-SILV',
        'name': 'Silverleaf Collegiate Campus',
        'country': 'Pakistan',
        'province': 'Punjab',
        'city': 'Lahore',
        'address': 'Block J, Johar Town, Lahore',
        'lat': Decimal('31.469700'),
        'lng': Decimal('74.272800'),
        'boards': ['Cambridge'],
        'levels': ['Primary', 'Middle'],
        'gender': 'co-ed',
        'medium': 'english',
        'est': 2019,
        'facilities': ['Junior Science Lab', 'Activity Hub', 'Mini Football Pitch'],
        'tagline': 'Nurturing foundational wonder and independent minds.',
        'about': 'Focusing on primary and middle school inquiry methods, small classes, and individualized learning paths.',
        'principal': 'Ms. Farzana Dummy-Head',
        'show_principal': True,
        'consent_direct': False,
        'phone': '+92-42-5550110',
        'email': 'hello@silverleaf-test.edu.pk',
        'contact_mode': 'official_contact',
        'rank_mode': 'exact_rank',
        'admission': 'open',
        'base_aqi': Decimal('68.20'),
        'prev_aqi': Decimal('65.00'),
        'students_count': 25,
        'status': 'live',
    },
    {
        'code': 'LHR-MEAD',
        'name': 'Badshahi Meadows High School',
        'country': 'Pakistan',
        'province': 'Punjab',
        'city': 'Lahore',
        'address': 'Old Circular Parkways, Lahore',
        'lat': Decimal('31.582000'),
        'lng': Decimal('74.313000'),
        'boards': ['Punjab Board'],
        'levels': ['Secondary'],
        'gender': 'co-ed',
        'medium': 'bilingual',
        'est': 2021,
        'facilities': ['Classrooms', 'Science Cabinet'],
        'tagline': 'Accessible quality education for developing learners.',
        'about': 'Providing dedicated secondary support and bridge learning programs.',
        'principal': 'Mr. Qasim Example-Admin',
        'show_principal': False,
        'consent_direct': False,
        'phone': '+92-42-5550111',
        'email': 'contact@badshahi-meadows-test.edu.pk',
        'contact_mode': 'enquiry_only',
        'rank_mode': 'unranked_listing',
        'admission': 'open',
        'base_aqi': Decimal('56.40'),
        'prev_aqi': Decimal('52.00'),
        'students_count': 20,
        'status': 'live',
    },

    # ---------------- United Kingdom Campuses ----------------
    {
        'code': 'LON-THAM',
        'name': 'Thames Valley Collegiate Academy',
        'country': 'United Kingdom',
        'province': 'Greater London',
        'city': 'London',
        'address': '12 Victoria Embankment Gardens, London',
        'lat': Decimal('51.508500'),
        'lng': Decimal('-0.125700'),
        'boards': ['Cambridge', 'Edexcel'],
        'levels': ['Middle', 'Secondary', 'Higher Secondary'],
        'gender': 'co-ed',
        'medium': 'english',
        'est': 1998,
        'facilities': ['Biotechnology Suite', 'Fencing Hall', 'Digital Media Studio', 'Black Box Theatre'],
        'tagline': 'Tradition of scholarship, vision of modern innovation.',
        'about': 'An internationally recognized UK secondary campus with historic examination honors and deep university placement success.',
        'principal': 'Prof. Julian Mock-Fellow',
        'show_principal': True,
        'consent_direct': True,
        'phone': '+44-20-79460112',
        'email': 'registrar@thames-valley-test.co.uk',
        'direct_phone': '+44-7700-900112',
        'direct_email': 'julian.fellow@thames-valley-test.co.uk',
        'contact_mode': 'official_contact',
        'rank_mode': 'exact_rank',
        'admission': 'open',
        'base_aqi': Decimal('94.10'),
        'prev_aqi': Decimal('91.80'),
        'students_count': 80,
        'status': 'live',
    },
    {
        'code': 'LON-CANA',
        'name': 'Canary Wharf Preparatory School',
        'country': 'United Kingdom',
        'province': 'Greater London',
        'city': 'London',
        'address': '25 Bank Street Plaza, Canary Wharf, London',
        'lat': Decimal('51.503300'),
        'lng': Decimal('-0.019500'),
        'boards': ['Edexcel'],
        'levels': ['Primary', 'Middle'],
        'gender': 'co-ed',
        'medium': 'english',
        'est': 2011,
        'facilities': ['STEM Innovation Pod', 'Music Conservatory', 'Rooftop Sports Astro'],
        'tagline': 'Precision learning in the heart of global commerce.',
        'about': 'Cultivating numeracy, digital literacy, and collaborative leadership from an early age.',
        'principal': 'Ms. Eleanor Fictitious-Head',
        'show_principal': True,
        'consent_direct': False,
        'phone': '+44-20-79460113',
        'email': 'admissions@canary-wharf-prep-test.co.uk',
        'contact_mode': 'official_contact',
        'rank_mode': 'exact_rank',
        'admission': 'open',
        'base_aqi': Decimal('86.50'),
        'prev_aqi': Decimal('84.00'),
        'students_count': 50,
        'status': 'live',
    },
    {
        'code': 'LON-GREE',
        'name': 'Greenwich Maritime Academy',
        'country': 'United Kingdom',
        'province': 'Greater London',
        'city': 'London',
        'address': 'King William Walk, Greenwich, London',
        'lat': Decimal('51.482600'),
        'lng': Decimal('-0.007700'),
        'boards': ['Cambridge'],
        'levels': ['Secondary', 'Higher Secondary'],
        'gender': 'co-ed',
        'medium': 'english',
        'est': 2017,
        'facilities': ['Astronomy Lab', 'Rowing Club', 'IT Pavilion'],
        'tagline': 'Navigating knowledge, mastering tomorrow.',
        'about': 'Offering distinctive scientific inquiry programs with heritage maritime surroundings.',
        'principal': 'Dr. Arthur Placeholder-Director',
        'show_principal': False,
        'consent_direct': False,
        'phone': '+44-20-79460114',
        'email': 'office@greenwich-maritime-test.co.uk',
        'contact_mode': 'enquiry_only',
        'rank_mode': 'tier_only',
        'admission': 'closed',
        'base_aqi': Decimal('78.40'),
        'prev_aqi': Decimal('73.90'),
        'students_count': 40,
        'status': 'live',
    },
    {
        'code': 'MAN-PENN',
        'name': 'Pennine Moor High School',
        'country': 'United Kingdom',
        'province': 'Greater Manchester',
        'city': 'Manchester',
        'address': 'Oxford Road Academic Quarter, Manchester',
        'lat': Decimal('53.466800'),
        'lng': Decimal('-2.233900'),
        'boards': ['Edexcel'],
        'levels': ['Middle', 'Secondary'],
        'gender': 'co-ed',
        'medium': 'english',
        'est': 2015,
        'facilities': ['Engineering Workshop', 'Football Pitch', 'Library'],
        'tagline': 'Practical excellence and academic grit.',
        'about': 'A progressive Manchester campus bridging strong academic outcomes with practical technical discovery.',
        'principal': 'Mr. George Dummy-Executive',
        'show_principal': True,
        'consent_direct': False,
        'phone': '+44-161-4960115',
        'email': 'info@pennine-moor-test.co.uk',
        'contact_mode': 'official_contact',
        'rank_mode': 'exact_rank',
        'admission': 'open',
        'base_aqi': Decimal('72.00'),
        'prev_aqi': Decimal('66.50'),
        'students_count': 35,
        'status': 'live',
    },

    # ---------------- United Arab Emirates Campuses ----------------
    {
        'code': 'DXB-WAHA',
        'name': 'Al-Waha Oasis International School',
        'country': 'United Arab Emirates',
        'province': 'Dubai',
        'city': 'Dubai',
        'address': 'Al Barsha South Boulevard, Dubai',
        'lat': Decimal('25.070000'),
        'lng': Decimal('55.230000'),
        'boards': ['Cambridge', 'Edexcel'],
        'levels': ['Primary', 'Middle', 'Secondary', 'Higher Secondary'],
        'gender': 'co-ed',
        'medium': 'english',
        'est': 2007,
        'facilities': ['Hydroponic Green Lab', 'VR Innovation Hub', 'Semi-Olympic Pool', 'Auditorium'],
        'tagline': 'Shaping global changemakers in a future-ready ecosystem.',
        'about': 'A flagship international curriculum institution setting regional benchmarks for pedagogical research and learner achievement.',
        'principal': 'Dr. Mansoor Simulated-Head',
        'show_principal': True,
        'consent_direct': True,
        'phone': '+971-4-5550116',
        'email': 'enquiries@alwaha-oasis-test.ae',
        'direct_phone': '+971-50-5550116',
        'direct_email': 'mansoor.head@alwaha-oasis-test.ae',
        'contact_mode': 'principal_direct',
        'rank_mode': 'exact_rank',
        'admission': 'open',
        'base_aqi': Decimal('96.20'),
        'prev_aqi': Decimal('93.50'),
        'students_count': 110,
        'status': 'live',
    },
    {
        'code': 'DXB-JUME',
        'name': 'Jumeirah Palms Grammar Academy',
        'country': 'United Arab Emirates',
        'province': 'Dubai',
        'city': 'Dubai',
        'address': 'Jumeirah Beachway 3, Dubai',
        'lat': Decimal('25.141200'),
        'lng': Decimal('55.185200'),
        'boards': ['Cambridge'],
        'levels': ['Primary', 'Middle', 'Secondary'],
        'gender': 'co-ed',
        'medium': 'english',
        'est': 2013,
        'facilities': ['Robotics Arena', 'Tennis Courts', 'Performing Arts Studio'],
        'tagline': 'Cultivating visionary intellect and compassionate character.',
        'about': 'Delivering world-class British curriculum education infused with international cultural enrichment.',
        'principal': 'Mrs. Sarah Mock-Leader',
        'show_principal': True,
        'consent_direct': False,
        'phone': '+971-4-5550117',
        'email': 'contact@jumeirah-palms-test.ae',
        'contact_mode': 'official_contact',
        'rank_mode': 'exact_rank',
        'admission': 'open',
        'base_aqi': Decimal('89.70'),
        'prev_aqi': Decimal('85.10'),
        'students_count': 65,
        'status': 'live',
    },
    {
        'code': 'DXB-BURJ',
        'name': 'Burj Skyline Secondary Campus',
        'country': 'United Arab Emirates',
        'province': 'Dubai',
        'city': 'Dubai',
        'address': 'Business Bay Central, Dubai',
        'lat': Decimal('25.186700'),
        'lng': Decimal('55.274400'),
        'boards': ['Edexcel'],
        'levels': ['Middle', 'Secondary'],
        'gender': 'co-ed',
        'medium': 'english',
        'est': 2020,
        'facilities': ['Design Studio', 'Digital Commons', 'Fitness Suite'],
        'tagline': 'High achievement at the intersection of commerce and creativity.',
        'about': 'Modern metropolitan campus tailored for secondary learners aiming for competitive university entries.',
        'principal': 'Mr. Omar Fictional-Administrator',
        'show_principal': False,
        'consent_direct': False,
        'phone': '+971-4-5550118',
        'email': 'admissions@burj-skyline-test.ae',
        'contact_mode': 'enquiry_only',
        'rank_mode': 'tier_only',
        'admission': 'open',
        'base_aqi': Decimal('74.50'),
        'prev_aqi': Decimal('70.00'),
        'students_count': 40,
        'status': 'live',
    },
    {
        'code': 'AUH-CORN',
        'name': 'Corniche Blue High School',
        'country': 'United Arab Emirates',
        'province': 'Abu Dhabi',
        'city': 'Abu Dhabi',
        'address': 'Corniche West Promenade, Abu Dhabi',
        'lat': Decimal('24.466700'),
        'lng': Decimal('54.366700'),
        'boards': ['Cambridge'],
        'levels': ['Primary', 'Middle', 'Secondary'],
        'gender': 'co-ed',
        'medium': 'english',
        'est': 2016,
        'facilities': ['Olympic Running Track', 'Science Center', 'Music Hall'],
        'tagline': 'Striving for highest honors under tranquil skies.',
        'about': 'A premier Abu Dhabi British curriculum institution renowned for mathematics and scientific honors.',
        'principal': 'Dr. Rashid Example-Head',
        'show_principal': True,
        'consent_direct': False,
        'phone': '+971-2-5550119',
        'email': 'office@corniche-blue-test.ae',
        'contact_mode': 'official_contact',
        'rank_mode': 'exact_rank',
        'admission': 'closed',
        'base_aqi': Decimal('81.30'),
        'prev_aqi': Decimal('78.00'),
        'students_count': 55,
        'status': 'live',
    },

    # ---------------- Boundary Testing: Small Cohort / Unranked Campus ----------------
    {
        'code': 'KHI-TINY',
        'name': 'Little Lantern Micro Campus',
        'country': 'Pakistan',
        'province': 'Sindh',
        'city': 'Karachi',
        'address': 'Plot 7, Street 2, Gulshan Sector 5, Karachi',
        'lat': Decimal('24.918000'),
        'lng': Decimal('67.097000'),
        'boards': ['Sindh Board'],
        'levels': ['Primary'],
        'gender': 'co-ed',
        'medium': 'english',
        'est': 2024,
        'facilities': ['Montessori Room'],
        'tagline': 'Gentle first steps in structured learning.',
        'about': 'A newly established boutique early learning center with an initial experimental pilot cohort.',
        'principal': 'Ms. Hira Small-Cohort-Test',
        'show_principal': True,
        'consent_direct': False,
        'phone': '+92-21-5550120',
        'email': 'info@little-lantern-test.edu.pk',
        'contact_mode': 'enquiry_only',
        'rank_mode': 'unranked_listing',
        'admission': 'open',
        'base_aqi': None,  # Not eligible (too few students)
        'prev_aqi': None,
        'students_count': 6,  # Below threshold of 15
        'status': 'live',
    },

    # ---------------- Governance Testing: Pending Moderation ----------------
    {
        'code': 'ISB-NEWP',
        'name': 'Pine Ridge New Preparatory',
        'country': 'Pakistan',
        'province': 'Federal Capital',
        'city': 'Islamabad',
        'address': 'Chatha Bakhtawar, Islamabad',
        'lat': Decimal('33.680000'),
        'lng': Decimal('73.140000'),
        'boards': ['Federal Board'],
        'levels': ['Primary', 'Middle'],
        'gender': 'co-ed',
        'medium': 'english',
        'est': 2023,
        'facilities': ['Computer Room', 'Play Area'],
        'tagline': 'Modern schooling for the neighborhood.',
        'about': 'Pending administrative review before official publication.',
        'principal': 'Mr. Waqas Pending-Moderator',
        'show_principal': False,
        'consent_direct': False,
        'phone': '+92-51-5550121',
        'email': 'hello@pineridge-test.edu.pk',
        'contact_mode': 'enquiry_only',
        'rank_mode': 'exact_rank',
        'admission': 'open',
        'base_aqi': Decimal('75.00'),
        'prev_aqi': None,
        'students_count': 22,
        'status': 'pending_approval',
    },
]


class Command(BaseCommand):
    help = "Seeds ~20 realistic fictional campus listings, published exam structures, and historical performance snapshots."

    def handle(self, *args, **options):
        self.stdout.write("Starting fictional campus seeding for Public Directory...")

        # Setup or get organisation
        org, _ = Organisation.objects.get_or_create(
            code="fictional-network",
            defaults={'name': "Optimus Orien Fictional Network"}
        )

        admin_user = User.objects.filter(role='owner').first()
        if not admin_user:
            admin_user, _ = User.objects.get_or_create(
                username='platform_owner_demo',
                defaults={
                    'email': 'owner@optimus-orien-test.internal',
                    'role': 'owner',
                    'is_staff': True,
                    'is_superuser': True,
                }
            )

        seeded_count = 0

        for cdata in FICTIONAL_CAMPUSES:
            # 1. School Model
            school, _ = School.objects.get_or_create(
                organisation=org,
                code=cdata['code'],
                defaults={
                    'name': cdata['name'],
                    'city': cdata['city'],
                }
            )

            # 2. Academic Year
            ay, _ = AcademicYear.objects.get_or_create(
                school=school,
                name='2025-2026',
                defaults={
                    'start_date': timezone.now().date() - timezone.timedelta(days=180),
                    'end_date': timezone.now().date() + timezone.timedelta(days=180),
                    'active': True,
                }
            )

            # 3. Core Class & Subjects
            s_class, _ = SchoolClass.objects.get_or_create(
                school=school,
                name='Grade 8-A',
                defaults={'academic_year': ay}
            )

            subjects = []
            for sname in ['Mathematics', 'English Language', 'General Science', 'Computer Studies']:
                subj, _ = Subject.objects.get_or_create(
                    school=school,
                    name=sname,
                    defaults={'code': f"{sname[:4].upper()}-{school.code}"}
                )
                subjects.append(subj)
                ClassSubject.objects.get_or_create(school_class=s_class, subject=subj)

            # 4. Enrolled Students
            existing_students = Student.objects.filter(school=school, active=True).count()
            target_count = cdata['students_count']
            if existing_students < target_count:
                needed = target_count - existing_students
                for i in range(needed):
                    idx = existing_students + i + 1
                    gender = 'male' if (idx % 2 == 0) else 'female'
                    s_obj = Student.objects.create(
                        school=school,
                        first_name=f"Learner{idx}",
                        last_name=f"Cohort{school.code[:3]}",
                        admission_number=f"{school.code}-{idx:03d}",
                        gender=gender,
                        enrolled_on=ay.start_date,
                        active=True
                    )
                    Enrollment.objects.get_or_create(
                        student=s_obj,
                        school_class=s_class,
                        defaults={'start_date': ay.start_date}
                    )

            # 5. Published Exam Configuration & Completed Results
            config, _ = ExamConfiguration.objects.get_or_create(
                school=school,
                name=f"Annual Examination 2025 - {cdata['name']}",
                defaults={
                    'academic_year': ay,
                    'school_class': s_class,
                    'status': 'published',
                    'reporting_scale': Decimal('100.00'),
                }
            )

            # If campus has a base AQI, generate sample published assessment results
            if cdata['base_aqi'] is not None:
                # Add Assessment record for each subject
                for subj in subjects:
                    assm, _ = Assessment.objects.get_or_create(
                        school_class=s_class,
                        subject=subj,
                        title=f"{subj.name} Term 2 Assessment",
                        defaults={
                            'date': timezone.now().date() - timezone.timedelta(days=30),
                            'max_marks': Decimal('100.00'),
                            'weight': Decimal('1.00'),
                            'published': True,
                        }
                    )

                # CalculatedStudentResult
                students_qs = Student.objects.filter(school=school, active=True)[:cdata['students_count']]
                for s in students_qs:
                    CalculatedStudentResult.objects.update_or_create(
                        student=s,
                        school_class=s_class,
                        configuration=config,
                        defaults={
                            'academic_year': ay,
                            'completed': True,
                            'overall_percentage': cdata['base_aqi'],
                            'passed': True,
                        }
                    )

            # 6. School Public Profile Draft
            draft, _ = SchoolPublicProfileDraft.objects.update_or_create(
                school=school,
                defaults={
                    'display_name': cdata['name'],
                    'tagline': cdata['tagline'],
                    'about': cdata['about'],
                    'country': cdata['country'],
                    'province': cdata['province'],
                    'city': cdata['city'],
                    'address': cdata['address'],
                    'latitude': cdata['lat'],
                    'longitude': cdata['lng'],
                    'boards': cdata['boards'],
                    'levels': cdata['levels'],
                    'gender_type': cdata['gender'],
                    'medium': cdata['medium'],
                    'established_year': cdata['est'],
                    'facilities': cdata['facilities'],
                    'website': f"https://www.{slugify(cdata['name'])}.example.org",
                    'social_links': {'facebook': f"https://facebook.com/{slugify(cdata['name'])}"},
                    'admission_status': cdata['admission'],
                    'contact_mode': cdata['contact_mode'],
                    'official_phone': cdata['phone'],
                    'official_email': cdata['email'],
                    'rank_display_mode': cdata['rank_mode'],
                    'is_opted_in': True,
                }
            )

            # 7. Public Campus Listing (Platform Table)
            slug = slugify(f"{cdata['name']}-{cdata['city']}")
            listing, _ = PublicCampusListing.objects.update_or_create(
                school=school,
                defaults={
                    'slug': slug,
                    'display_name': cdata['name'],
                    'tagline': cdata['tagline'],
                    'about': cdata['about'],
                    'logo_url': f"https://placehold.co/120x120/1e293b/ffffff?text={cdata['code'][:4]}",
                    'country': cdata['country'],
                    'province': cdata['province'],
                    'city': cdata['city'],
                    'address': cdata['address'],
                    'latitude': cdata['lat'],
                    'longitude': cdata['lng'],
                    'boards': cdata['boards'],
                    'levels': cdata['levels'],
                    'gender_type': cdata['gender'],
                    'medium': cdata['medium'],
                    'established_year': cdata['est'],
                    'facilities': cdata['facilities'],
                    'website': f"https://www.{slugify(cdata['name'])}.example.org",
                    'social_links': {'facebook': f"https://facebook.com/{slugify(cdata['name'])}"},
                    'admission_status': cdata['admission'],
                    'principal_name': cdata['principal'],
                    'show_principal_name': cdata['show_principal'],
                    'contact_mode': cdata['contact_mode'],
                    'official_phone': cdata['phone'],
                    'official_email': cdata['email'],
                    'principal_direct_phone': cdata.get('direct_phone', ''),
                    'principal_direct_email': cdata.get('direct_email', ''),
                    'rank_display_mode': cdata['rank_mode'],
                    'status': cdata['status'],
                    'approved_by': admin_user if cdata['status'] == 'live' else None,
                    'approved_at': timezone.now() if cdata['status'] == 'live' else None,
                }
            )

            # 8. Legal Consent Records
            PublicListingConsent.objects.get_or_create(
                listing=listing,
                user=admin_user,
                consent_type='school_publish',
                defaults={'agreed': True, 'consent_text_version': 'v1.0'}
            )

            if cdata['show_principal']:
                PublicListingConsent.objects.get_or_create(
                    listing=listing,
                    user=admin_user,
                    consent_type='principal_name',
                    defaults={'agreed': True, 'consent_text_version': 'v1.0'}
                )

            if cdata.get('consent_direct'):
                PublicListingConsent.objects.get_or_create(
                    listing=listing,
                    user=admin_user,
                    consent_type='principal_contact',
                    defaults={'agreed': True, 'consent_text_version': 'v1.0'}
                )

            # 9. Audit Event
            PublicListingEvent.objects.get_or_create(
                listing=listing,
                event_type='approved' if cdata['status'] == 'live' else 'opt_in_submitted',
                defaults={
                    'actor': admin_user,
                    'reason': 'Initial demo environment seed publication.',
                    'metadata': {'status': cdata['status']}
                }
            )

            # 10. Historical Previous Period Snapshot (if prev_aqi provided)
            if cdata['prev_aqi'] is not None:
                PublicRankSnapshot.objects.update_or_create(
                    listing=listing,
                    period_name='2024-2025 Term 2',
                    defaults={
                        'academic_year': '2024-2025',
                        'aqi_score': cdata['prev_aqi'],
                        'band': 'Strong' if cdata['prev_aqi'] < Decimal('80.00') else 'Outstanding',
                        'student_count': cdata['students_count'],
                        'assessment_count': 4,
                        'subjects_count': 4,
                        'is_eligible': True,
                    }
                )

            seeded_count += 1

        self.stdout.write(f"Seeded {seeded_count} fictional campus models. Generating rankings...")

        # Run snapshot refresh to calculate rankings, ties, tiers, and deltas
        summary = refresh_public_snapshots(period_name='2025-2026 Term 2')

        self.stdout.write(
            self.style.SUCCESS(
                f"Public directory seeded successfully! {summary['eligible_count']} ranked campuses live."
            )
        )
