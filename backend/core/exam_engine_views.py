"""API views for Configurable Examination and Academic Performance Engine."""
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from django.db import transaction
from django.db.models import Q, Avg, Count
from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.response import Response

from core.models import (
    School, SchoolClass, Subject, AcademicYear, Student, Enrollment, User,
    ExamConfiguration, ExamComponent, ExamComponentSubjectConfig,
    ExamSubjectWeight, ExamStudentMark, CalculatedSubjectResult,
    CalculatedStudentResult, ResultPublicationHistory
)
from core.services.access import schools_scope, classes_scope
from core.services.audit import record_event
from core.services.campus_filter import resolve_campus, apply_campus, get_campus_for_write, is_overall_mode
from core.services.exam_engine import (
    calculate_subject_result, calculate_student_average,
    calculate_group_average, calculate_gender_performance,
    calculate_subject_average, calculate_class_average,
    calculate_class_weighted_average, calculate_student_weighted_average,
    validate_configuration_for_publication,
    recalculate_configuration, recalculate_student, to_decimal, EPSILON
)

MANAGERS = ('organisation_admin', 'school_admin', 'principal')


def _require_manager(user):
    if not user.is_authenticated or not user.is_active:
        raise PermissionDenied('Active account required')
    if not user.is_superuser and user.role not in MANAGERS:
        raise PermissionDenied('Examination engine management requires administrator or principal role')


def _require_staff(user):
    if not user.is_authenticated or not user.is_active:
        raise PermissionDenied('Active account required')
    if not user.is_superuser and user.role not in MANAGERS and user.role != 'teacher':
        raise PermissionDenied('Access denied to examination engine')


# ------------------------------------------------------------------ Configurations CRUD
@api_view(['GET', 'POST'])
def engine_configurations(request):
    """List or create examination configurations."""
    user = request.user
    _require_staff(user)

    if request.method == 'GET':
        school_ids = resolve_campus(request)
        qs = ExamConfiguration.objects.filter(school_id__in=school_ids).select_related('school', 'academic_year', 'school_class', 'subject')
        if request.query_params.get('academic_year'):
            qs = qs.filter(academic_year_id=request.query_params['academic_year'])
        if request.query_params.get('class'):
            qs = qs.filter(school_class_id=request.query_params['class'])
        if request.query_params.get('status'):
            qs = qs.filter(status=request.query_params['status'])

        results = []
        for c in qs:
            comps = list(c.components.all().order_by('sequence', 'id'))
            total_weight = sum(comp.weight_percentage for comp in comps)
            results.append({
                'id': c.id,
                'name': c.name,
                'school_id': c.school_id,
                'school_name': c.school.name,
                'academic_year_id': c.academic_year_id,
                'academic_year_name': c.academic_year.name,
                'class_id': c.school_class_id,
                'class_name': c.school_class.name if c.school_class else 'All classes (School default)',
                'subject_id': c.subject_id,
                'subject_name': c.subject.name if c.subject else 'All subjects',
                'reporting_scale': str(c.reporting_scale),
                'rounding_precision': c.rounding_precision,
                'passing_threshold': str(c.passing_threshold),
                'subject_weighting_mode': c.subject_weighting_mode,
                'status': c.status,
                'version': c.version,
                'published_at': c.published_at.isoformat() if c.published_at else None,
                'components_count': len(comps),
                'total_weight': str(total_weight),
                'components': [{
                    'id': comp.id,
                    'name': comp.name,
                    'sequence': comp.sequence,
                    'weight_percentage': str(comp.weight_percentage),
                    'default_max_marks': str(comp.default_max_marks)
                } for comp in comps]
            })
        return Response({'results': results})

    # POST: create configuration
    _require_manager(user)
    school = get_campus_for_write(request, request.data)
    if not school:
        raise ValidationError({'school': 'Select a valid school campus.'})

    name = (request.data.get('name') or '').strip()[:120]
    if not name:
        raise ValidationError({'name': 'Configuration name is required.'})

    ay_id = request.data.get('academic_year')
    ay = AcademicYear.objects.filter(pk=ay_id, school=school).first()
    if not ay:
        ay = AcademicYear.objects.filter(school=school, active=True).first()
        if not ay:
            raise ValidationError({'academic_year': 'Active academic year required for campus.'})

    class_id = request.data.get('school_class')
    school_class = SchoolClass.objects.filter(pk=class_id, school=school).first() if class_id else None

    subject_id = request.data.get('subject')
    subject = Subject.objects.filter(pk=subject_id, school=school).first() if subject_id else None

    reporting_scale = to_decimal(request.data.get('reporting_scale', '100.00'))
    rounding_precision = int(request.data.get('rounding_precision', 2))
    passing_threshold = to_decimal(request.data.get('passing_threshold', '40.00'))
    weighting_mode = request.data.get('subject_weighting_mode', 'equal')
    if weighting_mode not in ('equal', 'custom'):
        weighting_mode = 'equal'

    components_data = request.data.get('components', [])
    if not isinstance(components_data, list) or len(components_data) == 0:
        raise ValidationError({'components': 'At least one examination component/term is required.'})

    with transaction.atomic():
        config = ExamConfiguration.objects.create(
            school=school,
            academic_year=ay,
            school_class=school_class,
            subject=subject,
            name=name,
            reporting_scale=reporting_scale,
            rounding_precision=rounding_precision,
            passing_threshold=passing_threshold,
            subject_weighting_mode=weighting_mode,
            status='draft',
            version=1,
            created_by=user
        )

        for idx, c_data in enumerate(components_data, start=1):
            c_name = str(c_data.get('name') or f"Term {idx}").strip()[:80]
            c_weight = to_decimal(c_data.get('weight_percentage', '0.00'))
            c_max = to_decimal(c_data.get('default_max_marks', '100.00'))
            comp = ExamComponent.objects.create(
                configuration=config,
                name=c_name,
                sequence=int(c_data.get('sequence', idx)),
                weight_percentage=c_weight,
                default_max_marks=c_max
            )

            # Subject max mark overrides
            subj_configs = c_data.get('subject_configs', [])
            for sc in subj_configs:
                s_id = sc.get('subject_id')
                subj_obj = Subject.objects.filter(pk=s_id, school=school).first()
                if subj_obj:
                    ExamComponentSubjectConfig.objects.create(
                        component=comp,
                        subject=subj_obj,
                        maximum_marks=to_decimal(sc.get('maximum_marks', c_max)),
                        is_optional=bool(sc.get('is_optional', False))
                    )

        # Subject weights
        subj_weights_data = request.data.get('subject_weights', [])
        for sw in subj_weights_data:
            s_id = sw.get('subject_id')
            subj_obj = Subject.objects.filter(pk=s_id, school=school).first()
            if subj_obj:
                ExamSubjectWeight.objects.create(
                    configuration=config,
                    subject=subj_obj,
                    weight=to_decimal(sw.get('weight', '1.00'))
                )

        record_event(actor=user, action='create', obj=config)

    return Response({'id': config.id, 'name': config.name, 'status': config.status, 'version': config.version}, status=201)


@api_view(['GET', 'PATCH', 'DELETE'])
def engine_configuration_detail(request, pk):
    """Retrieve, update, or delete a configuration."""
    user = request.user
    _require_staff(user)

    school_ids = resolve_campus(request)
    config = ExamConfiguration.objects.filter(pk=pk, school_id__in=school_ids).select_related(
        'school', 'academic_year', 'school_class', 'subject'
    ).first()
    if not config:
        raise NotFound('Examination configuration not found or outside authorized scope.')

    if request.method == 'GET':
        components = []
        for comp in config.components.all().order_by('sequence', 'id'):
            s_configs = [{
                'subject_id': sc.subject_id,
                'subject_name': sc.subject.name,
                'subject_code': sc.subject.code,
                'maximum_marks': str(sc.maximum_marks),
                'is_optional': sc.is_optional
            } for sc in comp.subject_configs.select_related('subject')]
            components.append({
                'id': comp.id,
                'name': comp.name,
                'sequence': comp.sequence,
                'weight_percentage': str(comp.weight_percentage),
                'default_max_marks': str(comp.default_max_marks),
                'subject_configs': s_configs
            })

        weights = [{
            'subject_id': sw.subject_id,
            'subject_name': sw.subject.name,
            'weight': str(sw.weight)
        } for sw in config.subject_weights.select_related('subject')]

        history = [{
            'version': h.version,
            'published_at': h.published_at.isoformat(),
            'published_by': h.published_by.username if h.published_by else 'System',
            'summary': h.summary
        } for h in config.publication_history.all()[:10]]

        return Response({
            'id': config.id,
            'name': config.name,
            'school_id': config.school_id,
            'school_name': config.school.name,
            'academic_year_id': config.academic_year_id,
            'academic_year_name': config.academic_year.name,
            'class_id': config.school_class_id,
            'class_name': config.school_class.name if config.school_class else None,
            'subject_id': config.subject_id,
            'subject_name': config.subject.name if config.subject else None,
            'reporting_scale': str(config.reporting_scale),
            'rounding_precision': config.rounding_precision,
            'passing_threshold': str(config.passing_threshold),
            'subject_weighting_mode': config.subject_weighting_mode,
            'status': config.status,
            'version': config.version,
            'published_at': config.published_at.isoformat() if config.published_at else None,
            'components': components,
            'subject_weights': weights,
            'history': history
        })

    _require_manager(user)

    if request.method == 'DELETE':
        if config.status == 'published' and CalculatedStudentResult.objects.filter(configuration=config).exists():
            raise PermissionDenied('Cannot delete published configuration with calculated student results.')
        with transaction.atomic():
            record_event(actor=user, action='delete', obj=config)
            config.delete()
        return Response({'success': True, 'detail': 'Configuration deleted.'})

    if request.method == 'PATCH':
        data = request.data
        with transaction.atomic():
            if 'name' in data:
                config.name = str(data['name']).strip()[:120]
            if 'reporting_scale' in data:
                config.reporting_scale = to_decimal(data['reporting_scale'])
            if 'rounding_precision' in data:
                config.rounding_precision = int(data['rounding_precision'])
            if 'passing_threshold' in data:
                config.passing_threshold = to_decimal(data['passing_threshold'])
            if 'subject_weighting_mode' in data and data['subject_weighting_mode'] in ('equal', 'custom'):
                config.subject_weighting_mode = data['subject_weighting_mode']

            # If components updated in PATCH
            if 'components' in data:
                config.components.all().delete()
                for idx, c_data in enumerate(data['components'], start=1):
                    comp = ExamComponent.objects.create(
                        configuration=config,
                        name=str(c_data.get('name') or f"Term {idx}").strip()[:80],
                        sequence=int(c_data.get('sequence', idx)),
                        weight_percentage=to_decimal(c_data.get('weight_percentage', '0.00')),
                        default_max_marks=to_decimal(c_data.get('default_max_marks', '100.00'))
                    )
                    for sc in c_data.get('subject_configs', []):
                        subj_obj = Subject.objects.filter(pk=sc.get('subject_id'), school=config.school).first()
                        if subj_obj:
                            ExamComponentSubjectConfig.objects.create(
                                component=comp,
                                subject=subj_obj,
                                maximum_marks=to_decimal(sc.get('maximum_marks', comp.default_max_marks)),
                                is_optional=bool(sc.get('is_optional', False))
                            )

            # If subject weights updated
            if 'subject_weights' in data:
                config.subject_weights.all().delete()
                for sw in data['subject_weights']:
                    subj_obj = Subject.objects.filter(pk=sw.get('subject_id'), school=config.school).first()
                    if subj_obj:
                        ExamSubjectWeight.objects.create(
                            configuration=config,
                            subject=subj_obj,
                            weight=to_decimal(sw.get('weight', '1.00'))
                        )

            config.save()
            record_event(actor=user, action='update', obj=config)

            # If already published, recalculate affected results automatically
            if config.status == 'published':
                recalc_res = recalculate_configuration(config.id)
                return Response({'id': config.id, 'status': config.status, 'recalculated': recalc_res})

        return Response({'id': config.id, 'status': config.status})


# ------------------------------------------------------------------ Publication & Recalculation
@api_view(['POST'])
def engine_configuration_publish(request, pk):
    """Publishes an examination configuration and automatically triggers recalculation."""
    user = request.user
    _require_manager(user)
    if user.role == 'principal':
        from core.models import OrganisationRolePolicy
        policy = OrganisationRolePolicy.get_effective_policy(user.organisation_id, 'principal')
        if not policy.get('results.approve', True):
            raise PermissionDenied('Principals are not permitted to approve/publish examination results.')

    school_ids = resolve_campus(request)
    config = ExamConfiguration.objects.filter(pk=pk, school_id__in=school_ids).first()
    if not config:
        raise NotFound('Configuration not found or outside authorized scope.')

    # Validate strictly before publication (Spec §3)
    try:
        validate_configuration_for_publication(config)
    except ValidationError as err:
        err_msg = err.detail if hasattr(err, 'detail') else (err.message if hasattr(err, 'message') else str(err))
        raise ValidationError({'detail': err_msg})
    except Exception as err:
        raise ValidationError({'detail': str(err)})

    components = list(config.components.all())

    with transaction.atomic():
        config.status = 'published'
        config.version += 1
        config.published_at = timezone.now()
        config.published_by = user
        config.save()

        # Run recalculation engine
        recalc_res = recalculate_configuration(config.id)

        # Record publication snapshot
        weights_snap = {
            c.name: {
                'weight': str(c.weight_percentage),
                'default_max': str(c.default_max_marks)
            } for c in components
        }
        ResultPublicationHistory.objects.create(
            configuration=config,
            version=config.version,
            published_by=user,
            weights_snapshot=weights_snap,
            summary=recalc_res
        )

        record_event(actor=user, action='publish', obj=config)

    return Response({
        'id': config.id,
        'status': config.status,
        'version': config.version,
        'published_at': config.published_at.isoformat(),
        'recalculation_summary': recalc_res
    })


@api_view(['POST'])
def engine_configuration_recalculate(request, pk):
    """Explicitly triggers recalculation of all results under a configuration."""
    user = request.user
    _require_manager(user)

    school_ids = resolve_campus(request)
    config = ExamConfiguration.objects.filter(pk=pk, school_id__in=school_ids).first()
    if not config:
        raise NotFound('Configuration not found or outside authorized scope.')

    summary = recalculate_configuration(config.id)
    return Response({'id': config.id, 'summary': summary})


# ------------------------------------------------------------------ Mark Entry Grid
@api_view(['GET', 'PUT'])
def engine_marks_grid(request, config_id):
    """Bulk mark entry grid across terms and subjects for a class."""
    user = request.user
    _require_staff(user)

    school_ids = resolve_campus(request)
    config = ExamConfiguration.objects.filter(pk=config_id, school_id__in=school_ids).select_related('school', 'academic_year').first()
    if not config:
        raise NotFound('Configuration not found or outside authorized scope.')

    class_id = request.query_params.get('class') or request.data.get('class')
    subject_id = request.query_params.get('subject') or request.data.get('subject')
    if not class_id or not subject_id:
        raise ValidationError({'detail': 'class and subject parameters are required.'})

    school_class = SchoolClass.objects.filter(pk=class_id, school=config.school).first()
    subject = Subject.objects.filter(pk=subject_id, school=config.school).first()
    if not school_class or not subject:
        raise NotFound('Class or subject not found.')

    components = list(config.components.all().order_by('sequence', 'id'))
    subject_configs = {
        sc.component_id: sc
        for sc in ExamComponentSubjectConfig.objects.filter(component__in=components, subject=subject)
    }

    if request.method == 'GET':
        enrollments = Enrollment.objects.filter(
            school_class=school_class
        ).filter(
            Q(end_date__isnull=True) | Q(end_date__gte=config.academic_year.start_date)
        ).select_related('student').order_by('student__last_name', 'student__first_name')

        existing_marks = {}
        for m in ExamStudentMark.objects.filter(
            component__in=components,
            subject=subject,
            school_class=school_class
        ):
            existing_marks[(m.student_id, m.component_id)] = m

        calculated_results = {
            r.student_id: r
            for r in CalculatedSubjectResult.objects.filter(
                configuration=config,
                subject=subject,
                school_class=school_class
            )
        }

        columns = []
        for c in components:
            sc = subject_configs.get(c.id)
            max_m = sc.maximum_marks if sc else c.default_max_marks
            columns.append({
                'id': c.id,
                'name': c.name,
                'sequence': c.sequence,
                'weight_percentage': str(c.weight_percentage),
                'max_marks': str(max_m),
                'is_optional': sc.is_optional if sc else False
            })

        rows = []
        for idx, en in enumerate(enrollments, start=1):
            st = en.student
            terms_data = {}
            for c in components:
                m = existing_marks.get((st.id, c.id))
                terms_data[c.id] = {
                    'marks_obtained': str(m.marks_obtained) if m and m.marks_obtained is not None else '',
                    'result_status': m.result_status if m else 'not_entered',
                    'is_exempt': m.is_exempt if m else False,
                    'feedback': m.feedback if m else ''
                }

            calc = calculated_results.get(st.id)
            rows.append({
                'student_id': st.id,
                'name': st.full_name,
                'admission_number': st.admission_number,
                'roll_number': getattr(st, 'roll_number', str(idx)),
                'gender': st.gender,
                'terms': terms_data,
                'completed': calc.completed if calc else False,
                'final_percentage': str(calc.final_percentage) if calc and calc.final_percentage is not None else None,
                'scaled_marks': str(calc.scaled_marks) if calc and calc.scaled_marks is not None else None,
                'current_percentage': str(calc.current_percentage) if calc and calc.current_percentage is not None else None,
                'assessed_weight': str(calc.assessed_weight) if calc else '0.00',
            })

        return Response({
            'configuration': {
                'id': config.id,
                'name': config.name,
                'status': config.status,
                'reporting_scale': str(config.reporting_scale),
                'passing_threshold': str(config.passing_threshold),
            },
            'class': {'id': school_class.id, 'name': school_class.name},
            'subject': {'id': subject.id, 'name': subject.name, 'code': subject.code},
            'columns': columns,
            'students': rows
        })

    # PUT: bulk update marks
    entries = request.data.get('marks', [])
    if not isinstance(entries, list):
        raise ValidationError({'marks': 'Expected a list of student marks.'})

    updated_count = 0
    affected_students = set()

    with transaction.atomic():
        for row in entries:
            student_id = row.get('student_id')
            student = Student.objects.filter(pk=student_id, school=config.school).first()
            if not student:
                continue

            terms_map = row.get('terms', {})
            for comp in components:
                c_data = terms_map.get(str(comp.id)) or terms_map.get(comp.id)
                if not c_data:
                    continue

                raw_val = c_data.get('marks_obtained')
                res_status = c_data.get('result_status', 'recorded')
                is_exempt = bool(c_data.get('is_exempt', False))
                feedback = (c_data.get('feedback') or '').strip()[:255]

                sc = subject_configs.get(comp.id)
                max_marks = sc.maximum_marks if sc else comp.default_max_marks

                marks_obtained = None
                if raw_val is not None and str(raw_val).strip() != '':
                    marks_obtained = to_decimal(raw_val)
                    if marks_obtained < Decimal('0.00') or marks_obtained > max_marks:
                        raise ValidationError(
                            f"Marks for {student.full_name} in {comp.name} ({marks_obtained}) outside valid range 0 to {max_marks}."
                        )

                mark_obj, _ = ExamStudentMark.objects.update_or_create(
                    student=student,
                    component=comp,
                    subject=subject,
                    defaults={
                        'school_class': school_class,
                        'academic_year': config.academic_year,
                        'marks_obtained': marks_obtained,
                        'result_status': res_status,
                        'is_exempt': is_exempt,
                        'feedback': feedback,
                        'entered_by': user
                    }
                )
                updated_count += 1
                affected_students.add(student.id)

        # Trigger automatic recalculation for affected students
        for s_id in affected_students:
            recalculate_student(s_id, config.id)

    return Response({
        'updated_marks': updated_count,
        'affected_students': len(affected_students)
    })


# ------------------------------------------------------------------ Analytics Dashboard
@api_view(['GET'])
def engine_analytics(request):
    """Comprehensive academic performance analytics at student, subject, class, branch, and school level.

    Supports:
    - Filters: school, academic_year, class, section, subject, gender.
    - Averaging method: student_weighted (headline default), class_weighted, branch_weighted.
    - Full gender analytics: boys' average, girls' average, and gender gap in percentage points.
    - Score distribution and academic support list.
    """
    user = request.user
    _require_staff(user)

    school_ids = resolve_campus(request)
    schools = School.objects.filter(id__in=school_ids)
    is_multi_campus = len(school_ids) > 1 or is_overall_mode(request)

    config_id = request.query_params.get('configuration')
    if config_id:
        config = ExamConfiguration.objects.filter(pk=config_id, school_id__in=school_ids).first()
        if not config:
            raise NotFound('Examination configuration not found or outside authorized scope.')
    else:
        config = ExamConfiguration.objects.filter(school_id__in=school_ids, status='published').first()
        if not config:
            config = ExamConfiguration.objects.filter(school_id__in=school_ids).first()

    # Available configs for filter dropdown (strictly within resolved campus scope)
    available_configs = [{
        'id': c.id,
        'name': c.name,
        'school_id': c.school_id,
        'school_name': c.school.name,
        'academic_year_name': c.academic_year.name,
        'status': c.status
    } for c in ExamConfiguration.objects.filter(school_id__in=school_ids)]

    if not config:
        return Response({
            'configuration': None,
            'available_configurations': available_configs,
            'summary': {
                'headline_average': None,
                'averaging_method': 'student_weighted',
                'student_weighted_average': None,
                'class_weighted_average': None,
                'branch_weighted_average': None,
                'boys_average': None,
                'girls_average': None,
                'gender_gap': None,
                'eligible_students_count': 0,
                'eligible_boys_count': 0,
                'eligible_girls_count': 0,
                'pending_students_count': 0,
                'pass_rate': None,
                'passing_threshold': '40.00'
            },
            'campus_performance': [],
            'subject_performance': [],
            'class_performance': [],
            'score_distribution': [],
            'support_needed': []
        })

    # Identify target classes in scope
    if is_multi_campus:
        target_classes_qs = SchoolClass.objects.filter(school_id__in=school_ids)
    else:
        target_classes_qs = SchoolClass.objects.filter(school=config.school)

    if request.query_params.get('class'):
        target_classes_qs = target_classes_qs.filter(pk=request.query_params['class'])
    elif config.school_class:
        target_classes_qs = target_classes_qs.filter(pk=config.school_class_id)
    else:
        target_classes_qs = target_classes_qs.filter(academic_year__name=config.academic_year.name)
    if request.query_params.get('section'):
        target_classes_qs = target_classes_qs.filter(section=request.query_params['section'])
    target_classes = list(target_classes_qs.select_related('school', 'academic_year').order_by('school__name', 'name', 'section'))

    # Identify target subjects in scope
    if config.subject:
        target_subjects = [config.subject]
    elif is_multi_campus:
        target_subjects = list(Subject.objects.filter(school_id__in=school_ids).select_related('school').order_by('school__name', 'name'))
    else:
        target_subjects = list(Subject.objects.filter(school=config.school).select_related('school').order_by('name'))

    # Fetch calculated student results for this configuration and class scope
    if config_id:
        student_results_qs = CalculatedStudentResult.objects.filter(
            configuration_id=config_id,
            school_class__in=target_classes
        ).select_related('student', 'school_class', 'school_class__school', 'highest_subject', 'lowest_subject')
    else:
        student_results_qs = CalculatedStudentResult.objects.filter(
            configuration__school_id__in=school_ids,
            configuration__status='published',
            school_class__in=target_classes
        ).select_related('student', 'school_class', 'school_class__school', 'highest_subject', 'lowest_subject')
        if not student_results_qs.exists() and config:
            student_results_qs = CalculatedStudentResult.objects.filter(
                configuration=config,
                school_class__in=target_classes
            ).select_related('student', 'school_class', 'school_class__school', 'highest_subject', 'lowest_subject')

    # Build student list
    student_records = []
    for r in student_results_qs:
        cl_name = f"{r.school_class.name} – {r.school_class.section}" if r.school_class.section else r.school_class.name
        if is_multi_campus:
            cl_name = f"{cl_name} ({r.school_class.school.name})"
        student_records.append({
            'student_id': r.student_id,
            'name': r.student.full_name,
            'gender': r.student.gender,
            'class_id': r.school_class_id,
            'class_name': cl_name,
            'branch_id': r.school_class.school_id,
            'branch_name': r.school_class.school.name,
            'overall_percentage': r.overall_percentage,
            'current_percentage': r.current_overall_percentage,
            'completed': r.completed,
            'passed': r.passed,
            'highest_subject': r.highest_subject.name if r.highest_subject else None,
            'lowest_subject': r.lowest_subject.name if r.lowest_subject else None
        })

    # Eligible: completed valid results
    eligible_students = [s for s in student_records if s['overall_percentage'] is not None]
    pending_count = sum(1 for s in student_records if s['overall_percentage'] is None)

    # Class performance table (Spec §7: Official Class Average = Equal-Subject Model)
    # SUM(Included Subject Averages) / Number of Included Subjects
    class_performance = []
    for klass in target_classes:
        # Active enrollments for this class
        klass_enrollments = Enrollment.objects.filter(
            school_class=klass
        ).filter(
            Q(end_date__isnull=True) | Q(end_date__gte=config.academic_year.start_date)
        ).select_related('student')
        klass_student_ids = set(en.student_id for en in klass_enrollments)
        klass_enrolled_count = len(klass_student_ids)

        klass_sub_results_qs = CalculatedSubjectResult.objects.filter(school_class=klass)
        if config_id:
            klass_sub_results_qs = klass_sub_results_qs.filter(configuration_id=config_id)
        else:
            klass_sub_results_qs = klass_sub_results_qs.filter(configuration__status='published')
            if not klass_sub_results_qs.exists() and config:
                klass_sub_results_qs = CalculatedSubjectResult.objects.filter(configuration=config, school_class=klass)
        klass_sub_results = list(klass_sub_results_qs.select_related('subject', 'student'))

        included_subject_averages = []
        included_boys_subject_averages = []
        included_girls_subject_averages = []

        for subj in target_subjects:
            subj_scores = [
                to_decimal(sr.final_percentage)
                for sr in klass_sub_results
                if sr.subject_id == subj.id and sr.final_percentage is not None
            ]
            subj_avg = calculate_group_average(subj_scores)
            if subj_avg is not None:
                included_subject_averages.append(subj_avg)

            # Gender-specific subject averages in this class (Spec §9)
            boys_scores = [
                to_decimal(sr.final_percentage)
                for sr in klass_sub_results
                if sr.subject_id == subj.id and sr.final_percentage is not None and sr.student.gender == 'male'
            ]
            boys_subj_avg = calculate_group_average(boys_scores)
            if boys_subj_avg is not None:
                included_boys_subject_averages.append(boys_subj_avg)

            girls_scores = [
                to_decimal(sr.final_percentage)
                for sr in klass_sub_results
                if sr.subject_id == subj.id and sr.final_percentage is not None and sr.student.gender == 'female'
            ]
            girls_subj_avg = calculate_group_average(girls_scores)
            if girls_subj_avg is not None:
                included_girls_subject_averages.append(girls_subj_avg)

        official_class_avg = calculate_class_average(included_subject_averages)
        class_boys_avg = calculate_class_average(included_boys_subject_averages)
        class_girls_avg = calculate_class_average(included_girls_subject_averages)
        class_gap = (class_girls_avg - class_boys_avg) if (class_girls_avg is not None and class_boys_avg is not None) else None

        # Student-weighted class average for comparison
        klass_students_records = [s for s in student_records if s['class_id'] == klass.id and s['overall_percentage'] is not None]
        klass_st_weighted_avg = calculate_student_weighted_average([to_decimal(s['overall_percentage']) for s in klass_students_records])
        klass_eligible_count = len(klass_students_records)
        klass_pending_count = max(0, klass_enrolled_count - klass_eligible_count)

        class_name_str = f"{klass.name} – {klass.section}" if klass.section else klass.name
        if is_multi_campus:
            class_name_str = f"{class_name_str} ({klass.school.name})"

        class_performance.append({
            'class_id': klass.id,
            'class_name': class_name_str,
            'school_id': klass.school_id,
            'school_name': klass.school.name,
            'average': round(float(official_class_avg), 2) if official_class_avg is not None else None,
            'student_weighted_average': round(float(klass_st_weighted_avg), 2) if klass_st_weighted_avg is not None else None,
            'boys_average': round(float(class_boys_avg), 2) if class_boys_avg is not None else None,
            'girls_average': round(float(class_girls_avg), 2) if class_girls_avg is not None else None,
            'gender_gap': round(float(class_gap), 2) if class_gap is not None else None,
            'eligible_count': klass_eligible_count,
            'enrolled_count': klass_enrolled_count,
            'pending_count': klass_pending_count,
            'included_subjects_count': len(included_subject_averages)
        })
    class_performance.sort(key=lambda x: -(x['average'] or 0))

    # School & Branch Level Aggregations (Spec §8)
    # A. Class-weighted average: SUM(Eligible Class Averages) / Number of Eligible Classes
    eligible_class_averages = [
        to_decimal(c['average'])
        for c in class_performance
        if c['average'] is not None
    ]
    class_weighted_avg = calculate_class_weighted_average(eligible_class_averages)

    # B. Student-weighted average: SUM(Eligible Students' Overall Percentages) / Eligible Student Count
    student_weighted_avg = calculate_student_weighted_average([
        to_decimal(s['overall_percentage']) for s in eligible_students
    ])

    # Gender-specific class-weighted averages (Spec §9)
    eligible_boys_class_avgs = [to_decimal(c['boys_average']) for c in class_performance if c['boys_average'] is not None]
    boys_class_weighted_avg = calculate_class_weighted_average(eligible_boys_class_avgs)

    eligible_girls_class_avgs = [to_decimal(c['girls_average']) for c in class_performance if c['girls_average'] is not None]
    girls_class_weighted_avg = calculate_class_weighted_average(eligible_girls_class_avgs)

    gender_gap_class_weighted = None
    if girls_class_weighted_avg is not None and boys_class_weighted_avg is not None:
        gender_gap_class_weighted = girls_class_weighted_avg - boys_class_weighted_avg

    # Gender-specific student-weighted averages (Spec §9)
    boys_eligible = [to_decimal(s['overall_percentage']) for s in eligible_students if s['gender'] == 'male']
    girls_eligible = [to_decimal(s['overall_percentage']) for s in eligible_students if s['gender'] == 'female']

    boys_student_weighted_avg = calculate_student_weighted_average(boys_eligible)
    girls_student_weighted_avg = calculate_student_weighted_average(girls_eligible)

    gender_gap_student_weighted = None
    if girls_student_weighted_avg is not None and boys_student_weighted_avg is not None:
        gender_gap_student_weighted = girls_student_weighted_avg - boys_student_weighted_avg

    # Branch-weighted average
    branch_groups = {}
    for s in eligible_students:
        branch_groups.setdefault(s['branch_id'], []).append(to_decimal(s['overall_percentage']))
    branch_avgs = [calculate_group_average(scores) for scores in branch_groups.values() if scores]
    branch_avgs_valid = [ba for ba in branch_avgs if ba is not None]
    branch_weighted_avg = calculate_group_average(branch_avgs_valid) if branch_avgs_valid else None

    # Headline average based on user preference or requested filter
    averaging_method = request.query_params.get('averaging_method', 'student_weighted')
    requested_gender = request.query_params.get('gender')

    if averaging_method == 'class_weighted':
        if requested_gender == 'male':
            headline_avg = boys_class_weighted_avg
        elif requested_gender == 'female':
            headline_avg = girls_class_weighted_avg
        else:
            headline_avg = class_weighted_avg
        boys_avg = boys_class_weighted_avg
        girls_avg = girls_class_weighted_avg
        gender_gap = gender_gap_class_weighted
    elif averaging_method == 'branch_weighted':
        headline_avg = branch_weighted_avg
        boys_avg = boys_student_weighted_avg
        girls_avg = girls_student_weighted_avg
        gender_gap = gender_gap_student_weighted
    else:
        averaging_method = 'student_weighted'
        if requested_gender == 'male':
            headline_avg = boys_student_weighted_avg
        elif requested_gender == 'female':
            headline_avg = girls_student_weighted_avg
        else:
            headline_avg = student_weighted_avg
        boys_avg = boys_student_weighted_avg
        girls_avg = girls_student_weighted_avg
        gender_gap = gender_gap_student_weighted

    # Pass rate
    passed_count = sum(1 for s in eligible_students if s['passed'] is True)
    pass_rate = round(float(passed_count / len(eligible_students) * 100), 1) if eligible_students else None

    # Score distribution histogram: 0-39, 40-49, 50-59, 60-69, 70-79, 80-89, 90-100
    bins = [
        {'range': '0–39%', 'count': 0},
        {'range': '40–49%', 'count': 0},
        {'range': '50–59%', 'count': 0},
        {'range': '60–69%', 'count': 0},
        {'range': '70–79%', 'count': 0},
        {'range': '80–89%', 'count': 0},
        {'range': '90–100%', 'count': 0},
    ]
    for s in eligible_students:
        pct = float(s['overall_percentage'])
        if pct < 40:
            bins[0]['count'] += 1
        elif pct < 50:
            bins[1]['count'] += 1
        elif pct < 60:
            bins[2]['count'] += 1
        elif pct < 70:
            bins[3]['count'] += 1
        elif pct < 80:
            bins[4]['count'] += 1
        elif pct < 90:
            bins[5]['count'] += 1
        else:
            bins[6]['count'] += 1

    # Subject performance with coverage metrics (Spec §6)
    total_enrolled_students = len(set(
        en.student_id
        for en in Enrollment.objects.filter(
            school_class__in=target_classes
        ).filter(
            Q(end_date__isnull=True) | Q(end_date__gte=config.academic_year.start_date)
        )
    ))

    if config_id:
        all_subject_results = list(CalculatedSubjectResult.objects.filter(
            configuration_id=config_id,
            school_class__in=target_classes
        ).select_related('subject', 'subject__school', 'student'))
    else:
        all_subject_results = list(CalculatedSubjectResult.objects.filter(
            configuration__school_id__in=school_ids,
            configuration__status='published',
            school_class__in=target_classes
        ).select_related('subject', 'subject__school', 'student'))
        if not all_subject_results and config:
            all_subject_results = list(CalculatedSubjectResult.objects.filter(
                configuration=config,
                school_class__in=target_classes
            ).select_related('subject', 'subject__school', 'student'))

    subject_performance = []
    for subj in target_subjects:
        subj_results = [sr for sr in all_subject_results if sr.subject_id == subj.id and sr.final_percentage is not None]
        eligible_scores = [to_decimal(sr.final_percentage) for sr in subj_results]

        sub_stats = calculate_subject_average(eligible_scores, enrolled_count=total_enrolled_students)

        boys_scores = [to_decimal(sr.final_percentage) for sr in subj_results if sr.student.gender == 'male']
        girls_scores = [to_decimal(sr.final_percentage) for sr in subj_results if sr.student.gender == 'female']

        s_boys_avg = calculate_group_average(boys_scores)
        s_girls_avg = calculate_group_average(girls_scores)
        s_gap = (s_girls_avg - s_boys_avg) if (s_girls_avg is not None and s_boys_avg is not None) else None

        subj_name_str = f"{subj.name} ({subj.school.name})" if is_multi_campus else subj.name
        subject_performance.append({
            'subject_id': subj.id,
            'subject_name': subj_name_str,
            'school_id': subj.school_id,
            'school_name': subj.school.name,
            'subject_code': subj.code,
            'average_percentage': round(float(sub_stats['average_percentage']), 2) if sub_stats['average_percentage'] is not None else None,
            'overall_average': round(float(sub_stats['average_percentage']), 2) if sub_stats['average_percentage'] is not None else None,
            'boys_average': round(float(s_boys_avg), 2) if s_boys_avg is not None else None,
            'girls_average': round(float(s_girls_avg), 2) if s_girls_avg is not None else None,
            'gender_gap': round(float(s_gap), 2) if s_gap is not None else None,
            'eligible_students': sub_stats['eligible_count'],
            'enrolled_students': sub_stats['enrolled_count'],
            'pending_students': sub_stats['pending_count'],
            'coverage_percentage': round(float(sub_stats['coverage_percentage']), 1) if sub_stats['coverage_percentage'] is not None else None,
            'highest': round(float(max(eligible_scores)), 2) if eligible_scores else None,
            'lowest': round(float(min(eligible_scores)), 2) if eligible_scores else None,
        })
    subject_performance.sort(key=lambda x: -(x['overall_average'] or 0))

    # Academic support needed list
    support_needed = [
        {
            'student_id': s['student_id'],
            'name': s['name'],
            'gender': s['gender'],
            'class_name': s['class_name'],
            'school_id': s['branch_id'],
            'school_name': s['branch_name'],
            'overall_percentage': round(float(s['overall_percentage']), 2) if s['overall_percentage'] is not None else None,
            'lowest_subject': s['lowest_subject']
        }
        for s in eligible_students
        if s['passed'] is False
    ]

    # Per-Campus breakdown (Spec §1.2 & §8)
    campus_performance = []
    if is_multi_campus:
        for sch in schools:
            sch_students = [s for s in eligible_students if s['branch_id'] == sch.id]
            sch_scores = [to_decimal(s['overall_percentage']) for s in sch_students]
            sch_avg = calculate_student_weighted_average(sch_scores)
            sch_boys = [to_decimal(s['overall_percentage']) for s in sch_students if s['gender'] == 'male']
            sch_girls = [to_decimal(s['overall_percentage']) for s in sch_students if s['gender'] == 'female']
            sch_b_avg = calculate_student_weighted_average(sch_boys)
            sch_g_avg = calculate_student_weighted_average(sch_girls)
            sch_gap = (sch_g_avg - sch_b_avg) if (sch_g_avg is not None and sch_b_avg is not None) else None
            sch_passed = sum(1 for s in sch_students if s['passed'] is True)
            sch_pass_rate = round(float(sch_passed / len(sch_students) * 100), 1) if sch_students else None

            sch_enrolled = len(set(
                en.student_id for en in Enrollment.objects.filter(school_class__school=sch).filter(
                    Q(end_date__isnull=True) | Q(end_date__gte=config.academic_year.start_date)
                )
            ))
            campus_performance.append({
                'campus_id': sch.id,
                'campus_name': sch.name,
                'average': round(float(sch_avg), 2) if sch_avg is not None else None,
                'boys_average': round(float(sch_b_avg), 2) if sch_b_avg is not None else None,
                'girls_average': round(float(sch_g_avg), 2) if sch_g_avg is not None else None,
                'gender_gap': round(float(sch_gap), 2) if sch_gap is not None else None,
                'pass_rate': sch_pass_rate,
                'eligible_count': len(sch_students),
                'enrolled_count': sch_enrolled,
                'pending_count': max(0, sch_enrolled - len(sch_students))
            })
        campus_performance.sort(key=lambda x: -(x['average'] or 0))

    return Response({
        'configuration': {
            'id': config.id,
            'name': config.name,
            'status': config.status,
            'version': config.version,
            'reporting_scale': str(config.reporting_scale),
            'passing_threshold': str(config.passing_threshold),
            'subject_weighting_mode': config.subject_weighting_mode,
            'school_id': config.school_id,
            'school_name': config.school.name,
            'academic_year_name': config.academic_year.name
        },
        'available_configurations': available_configs,
        'summary': {
            'headline_average': round(float(headline_avg), 2) if headline_avg is not None else None,
            'averaging_method': averaging_method,
            'student_weighted_average': round(float(student_weighted_avg), 2) if student_weighted_avg is not None else None,
            'class_weighted_average': round(float(class_weighted_avg), 2) if class_weighted_avg is not None else None,
            'branch_weighted_average': round(float(branch_weighted_avg), 2) if branch_weighted_avg is not None else None,
            'boys_average': round(float(boys_avg), 2) if boys_avg is not None else None,
            'girls_average': round(float(girls_avg), 2) if girls_avg is not None else None,
            'boys_student_weighted_average': round(float(boys_student_weighted_avg), 2) if boys_student_weighted_avg is not None else None,
            'girls_student_weighted_average': round(float(girls_student_weighted_avg), 2) if girls_student_weighted_avg is not None else None,
            'boys_class_weighted_average': round(float(boys_class_weighted_avg), 2) if boys_class_weighted_avg is not None else None,
            'girls_class_weighted_average': round(float(girls_class_weighted_avg), 2) if girls_class_weighted_avg is not None else None,
            'gender_gap': round(float(gender_gap), 2) if gender_gap is not None else None,
            'gender_gap_student_weighted': round(float(gender_gap_student_weighted), 2) if gender_gap_student_weighted is not None else None,
            'gender_gap_class_weighted': round(float(gender_gap_class_weighted), 2) if gender_gap_class_weighted is not None else None,
            'eligible_students_count': len(eligible_students),
            'eligible_boys_count': len(boys_eligible),
            'eligible_girls_count': len(girls_eligible),
            'pending_students_count': pending_count,
            'pass_rate': pass_rate,
            'passing_threshold': str(config.passing_threshold)
        },
        'campus_performance': campus_performance,
        'subject_performance': subject_performance,
        'class_performance': class_performance,
        'score_distribution': bins,
        'support_needed': support_needed
    })


# ------------------------------------------------------------------ Student Academic Transcript
@api_view(['GET'])
def engine_student_transcript(request):
    """Normalized multi-term examination transcript for an individual student."""
    user = request.user
    if not user.is_authenticated or not user.is_active:
        raise PermissionDenied('Active account required')

    student_id = request.query_params.get('student')
    config_id = request.query_params.get('configuration')
    if not student_id:
        raise ValidationError({'detail': 'student parameter is required.'})

    school_ids = resolve_campus(request)
    student = Student.objects.filter(pk=student_id, school_id__in=school_ids).select_related('school').first()
    if not student:
        raise NotFound('Student not found or outside authorized scope.')

    if user.role == 'student' and user.id != student.user_id:
        raise PermissionDenied('Access denied to other student transcripts.')
    if user.role == 'parent' and not student.parents.filter(id=user.id).exists():
        raise PermissionDenied('Access denied.')

    if config_id:
        config = ExamConfiguration.objects.filter(pk=config_id, school=student.school).first()
    else:
        config = ExamConfiguration.objects.filter(school=student.school, status='published').first()
        if not config:
            config = ExamConfiguration.objects.filter(school=student.school).first()

    if not config:
        raise NotFound('No examination configuration found for campus.')

    calc_student = CalculatedStudentResult.objects.filter(
        student=student,
        configuration=config
    ).select_related('school_class', 'highest_subject', 'lowest_subject').first()

    subject_results = CalculatedSubjectResult.objects.filter(
        student=student,
        configuration=config
    ).select_related('subject')

    subjects_data = []
    for sr in subject_results:
        final_pct = round(float(sr.final_percentage), config.rounding_precision) if sr.final_percentage is not None else None
        curr_pct = round(float(sr.current_percentage), config.rounding_precision) if sr.current_percentage is not None else None
        scaled = round(float(sr.scaled_marks), config.rounding_precision) if sr.scaled_marks is not None else None
        subjects_data.append({
            'subject_id': sr.subject_id,
            'subject_name': sr.subject.name,
            'subject_code': sr.subject.code,
            'completed': sr.completed,
            'final_percentage': final_pct,
            'scaled_marks': scaled,
            'current_percentage': curr_pct,
            'accumulated_contribution': round(float(sr.accumulated_contribution), config.rounding_precision),
            'assessed_weight': str(sr.assessed_weight),
            'term_results': sr.term_results
        })

    overall_pct = round(float(calc_student.overall_percentage), config.rounding_precision) if calc_student and calc_student.overall_percentage is not None else None
    current_overall_pct = round(float(calc_student.current_overall_percentage), config.rounding_precision) if calc_student and calc_student.current_overall_percentage is not None else None

    return Response({
        'student': {
            'id': student.id,
            'name': student.full_name,
            'admission_number': student.admission_number,
            'roll_number': getattr(student, 'roll_number', ''),
            'gender': student.gender,
            'school_name': student.school.name,
            'class_name': calc_student.school_class.name if calc_student else None
        },
        'configuration': {
            'id': config.id,
            'name': config.name,
            'reporting_scale': str(config.reporting_scale),
            'rounding_precision': config.rounding_precision,
            'passing_threshold': str(config.passing_threshold),
            'subject_weighting_mode': config.subject_weighting_mode,
            'version': config.version
        },
        'summary': {
            'completed': calc_student.completed if calc_student else False,
            'final_annual_percentage': overall_pct,
            'status': 'Completed' if (calc_student and calc_student.completed) else 'Pending',
            'current_performance_percentage': current_overall_pct,
            'passed': calc_student.passed if calc_student else None,
            'weighting_method_used': calc_student.weighting_method if calc_student else config.subject_weighting_mode,
            'highest_subject': calc_student.highest_subject.name if calc_student and calc_student.highest_subject else None,
            'lowest_subject': calc_student.lowest_subject.name if calc_student and calc_student.lowest_subject else None,
        },
        'subjects': subjects_data
    })
