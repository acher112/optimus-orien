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
from core.services.exam_engine import (
    calculate_subject_result, calculate_student_average,
    calculate_group_average, calculate_gender_performance,
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
        qs = ExamConfiguration.objects.filter(school__in=schools_scope(user)).select_related('school', 'academic_year', 'school_class', 'subject')
        if request.query_params.get('school'):
            qs = qs.filter(school_id=request.query_params['school'])
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
    school_id = request.data.get('school') or getattr(user, 'school_id', None)
    if school_id:
        school = schools_scope(user).filter(pk=school_id).first()
    else:
        school = schools_scope(user).first()
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

    config = ExamConfiguration.objects.filter(pk=pk, school__in=schools_scope(user)).select_related(
        'school', 'academic_year', 'school_class', 'subject'
    ).first()
    if not config:
        raise NotFound('Examination configuration not found.')

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

    config = ExamConfiguration.objects.filter(pk=pk, school__in=schools_scope(user)).first()
    if not config:
        raise NotFound('Configuration not found.')

    components = list(config.components.all())
    if not components:
        raise ValidationError({'detail': 'Configuration must have at least one examination component.'})

    total_weight = sum(c.weight_percentage for c in components)
    if abs(total_weight - Decimal('100.00')) > EPSILON:
        raise ValidationError({
            'detail': f'Examination weights must total 100.00% to publish. Current total: {total_weight}%.'
        })

    for c in components:
        if c.default_max_marks <= Decimal('0.00'):
            raise ValidationError({'detail': f'Component {c.name} maximum marks must be positive.'})
        if c.weight_percentage < Decimal('0.00'):
            raise ValidationError({'detail': f'Component {c.name} weight must be non-negative.'})

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

    config = ExamConfiguration.objects.filter(pk=pk, school__in=schools_scope(user)).first()
    if not config:
        raise NotFound('Configuration not found.')

    summary = recalculate_configuration(config.id)
    return Response({'id': config.id, 'summary': summary})


# ------------------------------------------------------------------ Mark Entry Grid
@api_view(['GET', 'PUT'])
def engine_marks_grid(request, config_id):
    """Bulk mark entry grid across terms and subjects for a class."""
    user = request.user
    _require_staff(user)

    config = ExamConfiguration.objects.filter(pk=config_id, school__in=schools_scope(user)).select_related('school', 'academic_year').first()
    if not config:
        raise NotFound('Configuration not found.')

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

    schools = schools_scope(user)
    school_id = request.query_params.get('school')
    if school_id:
        schools = schools.filter(pk=school_id)

    config_id = request.query_params.get('configuration')
    if config_id:
        config = ExamConfiguration.objects.filter(pk=config_id, school__in=schools).first()
    else:
        config = ExamConfiguration.objects.filter(school__in=schools, status='published').first()
        if not config:
            config = ExamConfiguration.objects.filter(school__in=schools).first()

    # Available configs for filter dropdown
    available_configs = [{
        'id': c.id,
        'name': c.name,
        'school_name': c.school.name,
        'academic_year_name': c.academic_year.name,
        'status': c.status
    } for c in ExamConfiguration.objects.filter(school__in=schools)]

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
            'subject_performance': [],
            'class_performance': [],
            'score_distribution': [],
            'support_needed': []
        })

    # Fetch calculated student results for this configuration
    student_results_qs = CalculatedStudentResult.objects.filter(
        configuration=config
    ).select_related('student', 'school_class', 'highest_subject', 'lowest_subject')

    if request.query_params.get('class'):
        student_results_qs = student_results_qs.filter(school_class_id=request.query_params['class'])
    if request.query_params.get('section'):
        student_results_qs = student_results_qs.filter(school_class__section=request.query_params['section'])

    # Build student list
    student_records = []
    for r in student_results_qs:
        student_records.append({
            'student_id': r.student_id,
            'name': r.student.full_name,
            'gender': r.student.gender,
            'class_id': r.school_class_id,
            'class_name': r.school_class.name,
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

    # Gender filter (if user explicitly filters the analytics)
    requested_gender = request.query_params.get('gender')
    analysis_pool = eligible_students
    if requested_gender in ('male', 'female'):
        analysis_pool = [s for s in eligible_students if s['gender'] == requested_gender]

    # Calculate headline average
    averaging_method = request.query_params.get('averaging_method', 'student_weighted')

    headline_avg = None
    student_weighted_avg = None
    class_weighted_avg = None
    branch_weighted_avg = None

    if eligible_students:
        # Student-weighted average: sum(A_i) / N
        all_percentages = [to_decimal(s['overall_percentage']) for s in analysis_pool]
        student_weighted_avg = calculate_group_average(all_percentages)

        # Class-weighted average: average of each class's student-weighted average
        class_groups = {}
        for s in analysis_pool:
            class_groups.setdefault(s['class_id'], []).append(to_decimal(s['overall_percentage']))
        class_avgs = [calculate_group_average(scores) for scores in class_groups.values() if scores]
        class_avgs_valid = [ca for ca in class_avgs if ca is not None]
        class_weighted_avg = calculate_group_average(class_avgs_valid) if class_avgs_valid else None

        # Branch-weighted average: average of each branch's average
        branch_groups = {}
        for s in analysis_pool:
            branch_groups.setdefault(s['branch_id'], []).append(to_decimal(s['overall_percentage']))
        branch_avgs = [calculate_group_average(scores) for scores in branch_groups.values() if scores]
        branch_avgs_valid = [ba for ba in branch_avgs if ba is not None]
        branch_weighted_avg = calculate_group_average(branch_avgs_valid) if branch_avgs_valid else None

        if averaging_method == 'class_weighted' and class_weighted_avg is not None:
            headline_avg = class_weighted_avg
        elif averaging_method == 'branch_weighted' and branch_weighted_avg is not None:
            headline_avg = branch_weighted_avg
        else:
            averaging_method = 'student_weighted'
            headline_avg = student_weighted_avg

    # Gender performance breakdown
    boys_eligible = [to_decimal(s['overall_percentage']) for s in eligible_students if s['gender'] == 'male']
    girls_eligible = [to_decimal(s['overall_percentage']) for s in eligible_students if s['gender'] == 'female']

    boys_avg = calculate_group_average(boys_eligible)
    girls_avg = calculate_group_average(girls_eligible)

    gender_gap = None
    if girls_avg is not None and boys_avg is not None:
        gender_gap = girls_avg - boys_avg  # In percentage points: positive means girls higher

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

    # Subject performance table with boys and girls breakdown
    subject_results_qs = CalculatedSubjectResult.objects.filter(
        configuration=config
    ).select_related('subject', 'student')
    if request.query_params.get('class'):
        subject_results_qs = subject_results_qs.filter(school_class_id=request.query_params['class'])

    subj_groups = {}
    for sr in subject_results_qs:
        if sr.final_percentage is not None:
            s_id = sr.subject_id
            if s_id not in subj_groups:
                subj_groups[s_id] = {
                    'subject_name': sr.subject.name,
                    'subject_code': sr.subject.code,
                    'all': [],
                    'boys': [],
                    'girls': []
                }
            pct = to_decimal(sr.final_percentage)
            subj_groups[s_id]['all'].append(pct)
            if sr.student.gender == 'male':
                subj_groups[s_id]['boys'].append(pct)
            elif sr.student.gender == 'female':
                subj_groups[s_id]['girls'].append(pct)

    subject_performance = []
    for s_id, data in subj_groups.items():
        s_overall = calculate_group_average(data['all'])
        s_boys = calculate_group_average(data['boys'])
        s_girls = calculate_group_average(data['girls'])
        s_gap = (s_girls - s_boys) if (s_girls is not None and s_boys is not None) else None
        subject_performance.append({
            'subject_id': s_id,
            'subject_name': data['subject_name'],
            'subject_code': data['subject_code'],
            'overall_average': round(float(s_overall), 2) if s_overall is not None else None,
            'boys_average': round(float(s_boys), 2) if s_boys is not None else None,
            'girls_average': round(float(s_girls), 2) if s_girls is not None else None,
            'gender_gap': round(float(s_gap), 2) if s_gap is not None else None,
            'eligible_students': len(data['all']),
            'highest': round(float(max(data['all'])), 2) if data['all'] else None,
            'lowest': round(float(min(data['all'])), 2) if data['all'] else None,
        })
    subject_performance.sort(key=lambda x: -(x['overall_average'] or 0))

    # Class performance table
    class_groups = {}
    for s in student_records:
        cid = s['class_id']
        if cid not in class_groups:
            class_groups[cid] = {'name': s['class_name'], 'scores': [], 'boys': [], 'girls': [], 'pending': 0}
        if s['overall_percentage'] is not None:
            pct = to_decimal(s['overall_percentage'])
            class_groups[cid]['scores'].append(pct)
            if s['gender'] == 'male':
                class_groups[cid]['boys'].append(pct)
            elif s['gender'] == 'female':
                class_groups[cid]['girls'].append(pct)
        else:
            class_groups[cid]['pending'] += 1

    class_performance = []
    for cid, c_data in class_groups.items():
        c_overall = calculate_group_average(c_data['scores'])
        c_boys = calculate_group_average(c_data['boys'])
        c_girls = calculate_group_average(c_data['girls'])
        c_gap = (c_girls - c_boys) if (c_girls is not None and c_boys is not None) else None
        class_performance.append({
            'class_id': cid,
            'class_name': c_data['name'],
            'average': round(float(c_overall), 2) if c_overall is not None else None,
            'boys_average': round(float(c_boys), 2) if c_boys is not None else None,
            'girls_average': round(float(c_girls), 2) if c_girls is not None else None,
            'gender_gap': round(float(c_gap), 2) if c_gap is not None else None,
            'eligible_count': len(c_data['scores']),
            'pending_count': c_data['pending']
        })
    class_performance.sort(key=lambda x: -(x['average'] or 0))

    # Academic support needed list
    support_needed = [
        {
            'student_id': s['student_id'],
            'name': s['name'],
            'gender': s['gender'],
            'class_name': s['class_name'],
            'overall_percentage': round(float(s['overall_percentage']), 2) if s['overall_percentage'] is not None else None,
            'lowest_subject': s['lowest_subject']
        }
        for s in eligible_students
        if s['passed'] is False
    ]

    return Response({
        'configuration': {
            'id': config.id,
            'name': config.name,
            'status': config.status,
            'version': config.version,
            'reporting_scale': str(config.reporting_scale),
            'passing_threshold': str(config.passing_threshold),
            'subject_weighting_mode': config.subject_weighting_mode
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
            'gender_gap': round(float(gender_gap), 2) if gender_gap is not None else None,
            'eligible_students_count': len(eligible_students),
            'eligible_boys_count': len(boys_eligible),
            'eligible_girls_count': len(girls_eligible),
            'pending_students_count': pending_count,
            'pass_rate': pass_rate,
            'passing_threshold': str(config.passing_threshold)
        },
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

    student = Student.objects.filter(pk=student_id).select_related('school').first()
    if not student:
        raise NotFound('Student not found.')

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
