import logging
from decimal import Decimal
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.utils import timezone
from datetime import timedelta
from core.models import (
    LandingHeroSlide,
    LandingCoreFeature,
    LandingFAQ,
    LandingPlan,
    LandingSiteSetting,
    LandingContactMessage,
)

logger = logging.getLogger(__name__)


def get_public_landing_data(locale: str = 'en') -> dict:
    """
    Returns public landing page content (active records only).
    Localizes titles, descriptions, and feature lists based on locale ('en' or 'ur').
    """
    is_ur = (locale or '').lower().startswith('ur')

    # 1. Hero Slides
    slides_qs = LandingHeroSlide.objects.filter(is_active=True).order_by('sort_order', 'id')
    slides_data = []
    for s in slides_qs:
        slides_data.append({
            'id': s.id,
            'title': s.title_ur if is_ur and s.title_ur else s.title,
            'subtitle': s.subtitle_ur if is_ur and s.subtitle_ur else s.subtitle,
            'image_url': s.image_url,
            'mobile_image_url': s.mobile_image_url,
            'cta_text': s.cta_text_ur if is_ur and s.cta_text_ur else s.cta_text,
            'cta_link': s.cta_link,
            'sort_order': s.sort_order,
        })

    # 2. Core Features (6 features)
    features_qs = LandingCoreFeature.objects.filter(is_active=True).order_by('sort_order', 'id')
    features_data = []
    for f in features_qs:
        features_data.append({
            'id': f.id,
            'title': f.title_ur if is_ur and f.title_ur else f.title,
            'description': f.description_ur if is_ur and f.description_ur else f.description,
            'icon_key': f.icon_key,
            'sort_order': f.sort_order,
        })

    # 3. FAQs (12 items)
    faqs_qs = LandingFAQ.objects.filter(is_active=True).order_by('sort_order', 'id')
    faqs_data = []
    for q in faqs_qs:
        faqs_data.append({
            'id': q.id,
            'question': q.question_ur if is_ur and q.question_ur else q.question,
            'answer': q.answer_ur if is_ur and q.answer_ur else q.answer,
            'category': q.category,
            'sort_order': q.sort_order,
        })

    # 4. Pricing Plans
    plans_qs = LandingPlan.objects.filter(is_active=True).order_by('sort_order', 'id')
    plans_data = []
    for p in plans_qs:
        feat_list = p.features_ur if is_ur and p.features_ur else p.features
        plans_data.append({
            'id': p.id,
            'name': p.name_ur if is_ur and p.name_ur else p.name,
            'slug': p.slug,
            'tagline': p.tagline_ur if is_ur and p.tagline_ur else p.tagline,
            'description': p.description_ur if is_ur and p.description_ur else p.description,
            'price_usd_per_student': str(p.price_usd_per_student),
            'price_pkr_per_student': str(p.price_pkr_per_student),
            'student_limit': p.student_limit,
            'campus_limit': p.campus_limit,
            'interval': p.interval,
            'trial_days': p.trial_days,
            'features': feat_list or [],
            'is_featured': p.is_featured,
            'sort_order': p.sort_order,
        })

    # 5. Site Settings
    settings_qs = LandingSiteSetting.objects.all()
    settings_dict = {}
    for st in settings_qs:
        settings_dict[st.key] = st.value_ur if is_ur and st.value_ur else st.value

    return {
        'locale': 'ur' if is_ur else 'en',
        'is_rtl': is_ur,
        'hero_slides': slides_data,
        'core_features': features_data,
        'faqs': faqs_data,
        'plans': plans_data,
        'settings': settings_dict,
    }


def submit_contact_form(data: dict, ip_address: str = None) -> dict:
    """
    Validates and stores contact form submission.
    Rate limits to 5 submissions per IP per hour.
    Checks honeypot field 'website'.
    Never logs personal data or plain messages in system logs.
    """
    # 1. Honeypot check
    honeypot = data.get('website', '').strip()
    if honeypot:
        # Silent success to prevent bot retry
        logger.warning("Spam bot detected in landing contact form via honeypot.")
        return {'success': True, 'message': 'Thank you! Your message has been received.'}

    # 2. Rate limiting check (max 5 submissions per hour per IP)
    if ip_address:
        one_hour_ago = timezone.now() - timedelta(hours=1)
        recent_count = LandingContactMessage.objects.filter(
            ip_address=ip_address,
            created_at__gte=one_hour_ago
        ).count()
        if recent_count >= 5:
            raise ValidationError("Too many inquiries from this connection. Please try again later.")

    # 3. Field validation
    name = (data.get('name') or '').strip()
    email = (data.get('email') or '').strip()
    phone = (data.get('phone') or '').strip()
    company = (data.get('company') or '').strip()
    subject = (data.get('subject') or '').strip()
    message = (data.get('message') or '').strip()

    if not name:
        raise ValidationError({'name': 'Name is required.'})
    if len(name) > 255:
        raise ValidationError({'name': 'Name cannot exceed 255 characters.'})

    if not email:
        raise ValidationError({'email': 'Email is required.'})
    try:
        validate_email(email)
    except ValidationError:
        raise ValidationError({'email': 'Please enter a valid email address.'})
    if len(email) > 255:
        raise ValidationError({'email': 'Email cannot exceed 255 characters.'})

    if len(phone) > 50:
        raise ValidationError({'phone': 'Phone number cannot exceed 50 characters.'})

    if len(company) > 255:
        raise ValidationError({'company': 'Company name cannot exceed 255 characters.'})

    if len(subject) > 255:
        raise ValidationError({'subject': 'Subject cannot exceed 255 characters.'})

    if not message:
        raise ValidationError({'message': 'Message is required.'})
    if len(message) > 5000:
        raise ValidationError({'message': 'Message cannot exceed 5000 characters.'})

    # 4. Save record
    contact = LandingContactMessage.objects.create(
        name=name,
        email=email,
        phone=phone,
        company=company,
        subject=subject,
        message=message,
        ip_address=ip_address,
        status='new',
    )

    # Safe log without personal data
    domain = email.split('@')[-1] if '@' in email else 'unknown'
    logger.info(f"Landing contact inquiry #{contact.id} created from domain @{domain}. No PII logged.")

    return {
        'success': True,
        'message': 'Thank you! Your message has been received. Our team will contact you within 24 hours.'
    }


def seed_default_landing_content():
    """
    Seeds initial landing page CMS models with exact text from old platform.
    Idempotent. Safe to run multiple times.
    """
    # 1. Hero Slide
    if not LandingHeroSlide.objects.exists():
        LandingHeroSlide.objects.create(
            title="OPTIMUS ORIEN",
            title_ur="آپٹیمس اورین",
            subtitle="School Performance Intelligence & Early Intervention. One platform, multiple perspectives.",
            subtitle_ur="سکول کارکردگی انٹیلی جنس اور قبل از وقت رہنمائی۔ ایک پلیٹ فارم، مختلف زاویے۔",
            cta_text="Register your school",
            cta_text_ur="اپنا اسکول رجسٹر کریں",
            cta_link="/login?tab=register",
            sort_order=1,
            is_active=True,
        )

    # 2. Core Features (6 features)
    features_seed = [
        {
            'title': 'Academic Performance',
            'title_ur': 'تعلیمی کارکردگی',
            'description': 'Track student performance across subjects, assessments, terms, and academic years.',
            'description_ur': 'مضامین، امتحانات، ٹرمز اور تعلیمی سالوں میں طلباء کی کارکردگی کا جائزہ لیں۔',
            'icon_key': 'academic',
            'sort_order': 1,
        },
        {
            'title': 'Attendance Intelligence',
            'title_ur': 'حاضری کی ذہین نگرانی',
            'description': 'Monitor attendance patterns and identify students whose attendance may require attention.',
            'description_ur': 'حاضری کے رجحانات کی نگرانی کریں اور ان طلباء کی نشاندہی کریں جنہیں توجہ کی ضرورت ہے۔',
            'icon_key': 'attendance',
            'sort_order': 2,
        },
        {
            'title': 'Skills Assessment',
            'title_ur': 'مہارتوں کا جائزہ',
            'description': 'Record subject-specific skill ratings and monitor development beyond examination marks.',
            'description_ur': 'مضمون کے لحاظ سے مہارتوں کی درجہ بندی اور نمبروں سے آگے ترقی کی نگرانی۔',
            'icon_key': 'skills',
            'sort_order': 3,
        },
        {
            'title': 'Class Performance',
            'title_ur': 'کلاس کی مجموعی کارکردگی',
            'description': 'Understand how each class is performing by comparing subject-level performance and class averages.',
            'description_ur': 'مضامین اور کلاس کے اوسط کی بنیاد پر جانچیں کہ ہر کلاس کیسی کارکردگی دکھا رہی ہے۔',
            'icon_key': 'class',
            'sort_order': 4,
        },
        {
            'title': 'Student Risk Identification',
            'title_ur': 'ضرورت مند طلباء کی شناخت',
            'description': 'Identify students whose combined performance indicators suggest that they may require additional support.',
            'description_ur': 'کارکردگی اشاریوں کے امتزاج سے ان طلباء کی بروقت نشاندہی کریں جنہیں اضافی تعاون درکار ہے۔',
            'icon_key': 'risk',
            'sort_order': 5,
        },
        {
            'title': 'Longitudinal Analysis',
            'title_ur': 'طویل مدتی تجزیہ',
            'description': 'Track performance over time instead of looking at isolated examination results.',
            'description_ur': 'صرف ایک امتحان کے نتائج کی بجائے وقت کے ساتھ ساتھ مجموعی ترقی کا موازنہ۔',
            'icon_key': 'longitudinal',
            'sort_order': 6,
        },
    ]
    for f in features_seed:
        LandingCoreFeature.objects.get_or_create(
            title=f['title'],
            defaults=f,
        )

    # 3. FAQs (12 items)
    faqs_seed = [
        {
            'question': 'Is Optimus Orien an LMS?',
            'question_ur': 'کیا آپٹیمس اورین ایک LMS ہے؟',
            'answer': '<p>No. Optimus Orien is primarily a School Performance Intelligence and Early Intervention platform. It focuses on understanding student, classroom, and school performance rather than delivering learning content.</p>',
            'answer_ur': '<p>نہیں، آپٹیمس اورین بنیادی طور پر سکول پرفارمنس انٹیلی جنس اور قبل از وقت رہنمائی کا پلیٹ فارم ہے۔ یہ صرف تعلیمی مواد فراہم کرنے کے بجائے طالب علم، کلاس اور سکول کی کارکردگی کے گہرے تجزیے پر توجہ مرکوز کرتا ہے۔</p>',
            'sort_order': 1,
        },
        {
            'question': 'What grades does Optimus Orien support?',
            'question_ur': 'آپٹیمس اورین کن کلاسوں کے لیے موزوں ہے؟',
            'answer': '<p>Optimus Orien is designed for Grades 1–12.</p>',
            'answer_ur': '<p>آپٹیمس اورین گریڈ 1 تا 12 کے لیے ڈیزائن کیا گیا ہے۔</p>',
            'sort_order': 2,
        },
        {
            'question': 'Who can use Optimus Orien?',
            'question_ur': 'آپٹیمس اورین کو کون استعمال کر سکتا ہے؟',
            'answer': '<p>School owners, administrators, principals, teachers, students and parents can access role-specific portals.</p>',
            'answer_ur': '<p>سکول مالکان، ایڈمنسٹریٹر، پرنسپل، اساتذہ، طلباء اور والدین اپنے کردار کے مخصوص پورٹل تک رسائی حاصل کر سکتے ہیں۔</p>',
            'sort_order': 3,
        },
        {
            'question': "Does Optimus Orien replace the school's existing LMS or ERP?",
            'question_ur': 'کیا آپٹیمس اورین سکول کے موجودہ LMS یا ERP کی جگہ لے لیتا ہے؟',
            'answer': '<p>Optimus Orien can complement existing school systems by focusing specifically on performance intelligence, analysis and early intervention.</p>',
            'answer_ur': '<p>آپٹیمس اورین موجودہ نظاموں کے ساتھ مل کر کام کر سکتا ہے اور خاص طور پر کارکردگی کی ذہانت اور بروقت رہنمائی فراہم کرتا ہے۔</p>',
            'sort_order': 4,
        },
        {
            'question': 'What information can schools track?',
            'question_ur': 'سکول کس قسم کی معلومات کی نگرانی کر سکتے ہیں؟',
            'answer': '<p>Depending on the school\'s configuration, Optimus Orien can organize academic marks, attendance, subject skills, classroom performance and longitudinal performance data.</p>',
            'answer_ur': '<p>سکول کی ترتیبات کے مطابق، آپٹیمس اورین امتحانی نمبر، حاضری، مضامین کی مہارتیں، کلاس کارکردگی اور سال بہ سال ترقی کا ریکارڈ مرتب کرتا ہے۔</p>',
            'sort_order': 5,
        },
        {
            'question': 'Can parents access student performance?',
            'question_ur': 'کیا والدین بچے کی کارکردگی دیکھ سکتے ہیں؟',
            'answer': '<p>Yes. The Parent Portal is designed to provide parents with relevant information about their child\'s academic performance, attendance, skills and progress.</p>',
            'answer_ur': '<p>جی ہاں، پیرنٹ پورٹل والدین کو اپنے بچے کی تعلیمی کارکردگی، حاضری، مہارتوں اور پیش رفت سے باخبر رکھتا ہے۔</p>',
            'sort_order': 6,
        },
        {
            'question': 'How does Optimus Orien identify students requiring attention?',
            'question_ur': 'آپٹیمس اورین توجہ طلب طلباء کی نشاندہی کیسے کرتا ہے؟',
            'answer': '<p>The platform analyzes configured performance indicators and patterns to help schools identify students who may require additional academic attention. It is a decision-support tool and does not replace professional educational judgment.</p>',
            'answer_ur': '<p>پلیٹ فارم طے شدہ کارکردگی کے اشاریوں اور رجحانات کا تجزیہ کر کے رہنمائی فراہم کرتا ہے، جو اساتذہ کے پیشہ ورانہ فیصلے میں مددگار ثابت ہوتا ہے۔</p>',
            'sort_order': 7,
        },
        {
            'question': 'How much does it cost?',
            'question_ur': 'اس کی فیس یا لاگت کیا ہے؟',
            'answer': '<p>International subscriptions are priced at $3.60 per student per month, and local subscriptions at 499 PKR per student per month.</p>',
            'answer_ur': '<p>بین الاقوامی سبسکرپشن 3.60 ڈالر فی طالب علم ماہانہ، اور مقامی سبسکرپشن 499 پاکستانی روپے فی طالب علم ماہانہ ہے۔</p>',
            'sort_order': 8,
        },
        {
            'question': "Is my school's data secure?",
            'question_ur': 'کیا ہمارے سکول کا ڈیٹا محفوظ ہے؟',
            'answer': '<p>Yes, data security and privacy are our top priorities. Optimus Orien employs enterprise-grade encryption, strict access controls, and regular security audits to ensure that all student and school data remains strictly confidential and fully compliant with educational data protection standards.</p>',
            'answer_ur': '<p>جی ہاں، ڈیٹا کی حفاظت اور رازداری ہماری اولین ترجیح ہے۔ جدید ترین انکرپشن اور سخت رسائی کے قواعد کے ذریعے تمام ڈیٹا مکمل محفوظ رہتا ہے۔</p>',
            'sort_order': 9,
        },
        {
            'question': 'Does Optimus Orien require special hardware or servers?',
            'question_ur': 'کیا اس کے لیے مخصوص ہارڈویئر یا سرور درکار ہے؟',
            'answer': '<p>No, Optimus Orien is completely cloud-based. Schools only need a web browser and an internet connection, eliminating the need for expensive on-premise servers or IT maintenance.</p>',
            'answer_ur': '<p>نہیں، یہ مکمل طور پر کلاؤڈ پر مبنی ہے۔ سکول کو صرف ایک انٹرنیٹ کنکشن اور ویب براؤزر کی ضرورت ہوتی ہے۔</p>',
            'sort_order': 10,
        },
        {
            'question': 'How long does it take to implement Optimus Orien?',
            'question_ur': 'سکول میں اسے نافذ کرنے میں کتنا وقت لگتا ہے؟',
            'answer': '<p>The implementation timeline varies depending on the school\'s existing data infrastructure, but our streamlined onboarding process typically gets most schools up and running within a few weeks.</p>',
            'answer_ur': '<p>ہمارے آسان آن بورڈنگ عمل کے ذریعے عام طور پر سکول چند ہفتوں میں مکمل طور پر فعال ہو جاتے ہیں۔</p>',
            'sort_order': 11,
        },
        {
            'question': 'Do you provide training for teachers and staff?',
            'question_ur': 'کیا اساتذہ اور عملے کو تربیت دی جاتی ہے؟',
            'answer': '<p>Yes! We provide comprehensive onboarding sessions, extensive training materials, and ongoing dedicated customer support to ensure your entire staff feels confident using the platform.</p>',
            'answer_ur': '<p>جی ہاں! ہم آن بورڈنگ سیشنز، وضاحتی گائیڈز اور مستقل تکنیکی معاونت فراہم کرتے ہیں۔</p>',
            'sort_order': 12,
        },
    ]
    for q in faqs_seed:
        LandingFAQ.objects.get_or_create(
            question=q['question'],
            defaults=q,
        )

    # 4. Plans (Standard and Premium)
    plans_seed = [
        {
            'name': 'Standard Tier',
            'name_ur': 'اسٹینڈرڈ پلان',
            'slug': 'standard',
            'tagline': 'Essential Performance Management',
            'tagline_ur': 'بنیادی کارکردگی کا انتظام',
            'description': 'Includes full access to the intelligence suite, core role portals, campus benchmarking, and early intervention tools.',
            'description_ur': 'بنیادی تجزیاتی ٹولز، تمام کرداروں کے پورٹل اور حاضری و کارکردگی کا مکمل انتظام۔',
            'price_usd_per_student': Decimal('3.60'),
            'price_pkr_per_student': Decimal('1000.00'),
            'student_limit': 0,
            'campus_limit': 1,
            'interval': 'monthly',
            'trial_days': 3,
            'features': [
                "Student Profiles",
                "Marks & Assessments",
                "Attendance Tracking",
                "Teacher Portal",
                "Student Portal",
                "Parent Portal",
                "Principal Dashboard",
                "Class & Subject Performance",
                "Basic Reports",
                "Performance Trends",
            ],
            'features_ur': [
                "طلباء کے پروفائل",
                "نمبر اور جائزے",
                "حاضری کا نظام",
                "ٹیچر پورٹل",
                "سٹوڈنٹ پورٹل",
                "پیرنٹ پورٹل",
                "پرنسپل ڈیش بورڈ",
                "کلاس اور مضمون کی کارکردگی",
                "بنیادی رپورٹس",
                "ترقی کے رجحانات",
            ],
            'is_featured': False,
            'sort_order': 1,
            'is_active': True,
        },
        {
            'name': 'Premium Tier',
            'name_ur': 'پریمیم پلان',
            'slug': 'premium',
            'tagline': 'Advanced Performance Intelligence',
            'tagline_ur': 'جامع اور جدید تجزیاتی نظام',
            'description': 'Everything in Standard, plus Early Intervention System, Academic Quality Index (AQI), 5-year longitudinal analysis, and multi-campus governance.',
            'description_ur': 'اسٹینڈرڈ کی تمام خصوصیات کے ساتھ قبل از وقت رہنمائی، تعلیمی معیار انڈیکس (AQI) اور 5 سالہ ترقیاتی تجزیہ۔',
            'price_usd_per_student': Decimal('7.20'),
            'price_pkr_per_student': Decimal('2000.00'),
            'student_limit': 0,
            'campus_limit': 5,
            'interval': 'monthly',
            'trial_days': 3,
            'features': [
                "Everything in Standard",
                "Early Intervention System",
                "Student Attention Indicators",
                "Automated Alerts & Notifications",
                "Academic Quality Index (AQI)",
                "Advanced Analytics",
                "5-Year Performance Analysis",
                "Advanced Class Intelligence",
                "Teacher Performance Insights",
                "School & Branch Comparison",
                "Organization-Wide Dashboard",
                "Intervention Tracking",
                "Advanced Reports",
            ],
            'features_ur': [
                "اسٹینڈرڈ کی تمام خصوصیات",
                "قبل از وقت رہنمائی کا نظام",
                "توجہ طلب طلباء کے اشاریے",
                "خودکار الرٹس اور اطلاعات",
                "تعلیمی معیار انڈیکس (AQI)",
                "اعلیٰ سطحی تجزیات",
                "5 سالہ تقابلی جائزہ",
                "کلاس انٹیلی جنس",
                "اساتذہ کی کارکردگی کے مشاہدات",
                "برانچوں کا موازنہ",
                "مرکزی تنظیمی ڈیش بورڈ",
                "اقدامات کی نگرانی",
                "تفصیلی برآمدی رپورٹس",
            ],
            'is_featured': True,
            'sort_order': 2,
            'is_active': True,
        },
    ]
    for p in plans_seed:
        LandingPlan.objects.get_or_create(
            slug=p['slug'],
            defaults=p,
        )

    # 5. Site Settings
    settings_seed = {
        'site_name': ('Optimus Orien', 'آپٹیمس اورین', 'Platform title'),
        'contact_email': ('optimusorien@gmail.com', 'optimusorien@gmail.com', 'Contact mailbox'),
        'hero_headline': ('OPTIMUS ORIEN', 'آپٹیمس اورین', 'Masthead brand wordmark'),
        'footer_tagline': ('School Performance Intelligence & Early Intervention', 'سکول کارکردگی انٹیلی جنس اور بروقت رہنمائی', 'Footer subtitle'),
        'trial_badge': ('Experience full platform access with a 3-day complimentary trial.', 'مکمل پلیٹ فارم تک رسائی کے لیے 3 روزہ اعزازی ٹرائل حاصل کریں۔', '3-day complimentary trial offer'),
    }
    for k, (v, vur, desc) in settings_seed.items():
        LandingSiteSetting.objects.get_or_create(
            key=k,
            defaults={'value': v, 'value_ur': vur, 'description': desc},
        )
