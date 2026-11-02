"""Parent Portal and Parent Management REST API views.

Enforces Golden Rule:
- Staff (Principal, Admin): Scoped strictly by campus/organisation. Teachers and students are blocked.
- Parents: Scoped strictly to their own verified active children. Unlinked IDs return 404.
"""
import csv
from django.http import HttpResponse
from django.utils import timezone
from django.db.models import Q
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied, NotFound, ValidationError

from core.models import (
    User, School, Student, GuardianProfile, GuardianRelationship,
    ParentNotificationPreference, ParentRiskAlert, ParentCallbackRequest,
    Notification, AuditEvent
)
from core.services.access import schools_scope
from core.services.parent_registration import (
    check_duplicate_guardian, register_parent_wizard, reveal_guardian_identity,
    link_additional_child, revoke_guardian_relationship, suspend_guardian,
    reactivate_guardian, reset_guardian_password
)
from core.services.parent_portal import (
    get_parent_children_summary, get_child_overview, get_child_results,
    get_child_attendance, get_child_risk_and_support, acknowledge_risk_alert,
    get_child_teachers, create_callback_request, get_child_homework,
    get_child_fees, generate_child_report_card, verify_child_access
)
from core.services.audit import record_event


def _require_staff_admin_or_principal(user: User):
    """Ensures request user is an authorised administrator or principal."""
    if not user.is_authenticated:
        raise PermissionDenied("Authentication required.")
    if user.is_superuser or user.role in ('organisation_admin', 'school_admin', 'principal'):
        return
    raise PermissionDenied("Only school principals and administrators can manage parent accounts.")


def _get_guardian_for_staff(user: User, guardian_id: int) -> GuardianProfile:
    """Retrieves GuardianProfile ensuring campus scope for principals."""
    _require_staff_admin_or_principal(user)
    try:
        guardian = GuardianProfile.objects.select_related('user', 'organisation').get(id=guardian_id)
    except GuardianProfile.DoesNotExist:
        raise NotFound("Parent profile not found.")

    if user.is_superuser or user.role == 'organisation_admin':
        if not user.is_superuser and guardian.organisation_id != user.organisation_id:
            raise NotFound("Parent profile not found.")
        return guardian

    # Principal / Campus Admin: Must have at least one child in own campus
    has_campus_child = GuardianRelationship.objects.filter(
        guardian=guardian,
        student__school_id=user.school_id
    ).exists()

    if not has_campus_child:
        raise NotFound("Parent profile not found.")

    return guardian


# ---------------------------------------------------------------------------
# Staff / Principal: Parent Management Endpoints
# ---------------------------------------------------------------------------

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def parent_check_duplicate(request):
    """Step 2 of Wizard: Checks if parent already exists by identity number, mobile, or email."""
    _require_staff_admin_or_principal(request.user)
    data = request.data
    identity_number = data.get('identity_number', '')
    identity_type = data.get('identity_type', 'cnic')
    mobile = data.get('mobile', '')
    email = data.get('email', '')

    result = check_duplicate_guardian(
        organisation=request.user.organisation,
        identity_number=identity_number,
        identity_type=identity_type,
        mobile=mobile,
        email=email
    )
    return Response(result)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def parent_register(request):
    """Completes the Add Parent wizard atomically."""
    _require_staff_admin_or_principal(request.user)
    result = register_parent_wizard(
        actor=request.user,
        data=request.data
    )
    return Response(result, status=status.HTTP_201_CREATED)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def parent_list(request):
    """Lists parent profiles scoped to the current user."""
    _require_staff_admin_or_principal(request.user)
    user = request.user

    qs = GuardianProfile.objects.select_related('user').prefetch_related('relationships__student__school', 'relationships__student__enrollments__school_class')

    if not user.is_superuser:
        if user.role == 'organisation_admin':
            qs = qs.filter(organisation=user.organisation)
            campus_id = request.query_params.get('campus_id')
            if campus_id:
                qs = qs.filter(relationships__student__school_id=campus_id).distinct()
        elif user.role in ('principal', 'school_admin'):
            qs = qs.filter(relationships__student__school_id=user.school_id).distinct()

    # Search filter
    search = request.query_params.get('search', '').strip()
    if search:
        qs = qs.filter(
            Q(first_name__icontains=search) |
            Q(last_name__icontains=search) |
            Q(email__icontains=search) |
            Q(mobile__icontains=search) |
            Q(relationships__student__first_name__icontains=search) |
            Q(relationships__student__last_name__icontains=search)
        ).distinct()

    # Status filter
    status_filter = request.query_params.get('status')
    if status_filter == 'active':
        qs = qs.filter(is_active=True)
    elif status_filter == 'suspended':
        qs = qs.filter(is_active=False)

    parents_data = []
    for g in qs.order_by('-created_at')[:100]:
        # Scoped children count
        if user.role in ('principal', 'school_admin') and not user.is_superuser:
            rels = [r for r in g.relationships.all() if r.student.school_id == user.school_id]
        else:
            rels = list(g.relationships.all())

        children_display = []
        for r in rels:
            st = r.student
            enr = st.enrollments.filter(end_date__isnull=True).select_related('school_class').first()
            cls_name = enr.school_class.name if enr and enr.school_class else 'Unassigned'
            children_display.append({
                'id': st.id,
                'name': st.full_name,
                'class': cls_name,
                'relationship': r.relationship,
                'status': r.status,
            })

        parents_data.append({
            'id': g.id,
            'name': g.full_name,
            'email': g.email,
            'mobile': g.mobile,
            'identity_type': g.identity_type,
            'identity_masked': g.masked_identity,
            'is_active': g.is_active,
            'username': g.user.username if g.user else None,
            'children': children_display,
            'created_at': g.created_at.isoformat(),
        })

    return Response(parents_data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def parent_detail(request, pk: int):
    """Detailed view of a single guardian profile with children relationships."""
    guardian = _get_guardian_for_staff(request.user, pk)

    user = request.user
    rels_qs = guardian.relationships.select_related('student', 'student__school')
    if user.role in ('principal', 'school_admin') and not user.is_superuser:
        rels_qs = rels_qs.filter(student__school_id=user.school_id)

    children_data = []
    for r in rels_qs:
        st = r.student
        enr = st.enrollments.filter(end_date__isnull=True).select_related('school_class').first()
        children_data.append({
            'relationship_id': r.id,
            'student_id': st.id,
            'student_name': st.full_name,
            'admission_number': st.admission_number,
            'campus_name': st.school.name if st.school else '',
            'class_name': enr.school_class.name if enr and enr.school_class else 'Unassigned',
            'relationship': r.relationship,
            'is_primary': r.is_primary,
            'status': r.status,
            'can_view_academics': r.can_view_academics,
            'can_view_attendance': r.can_view_attendance,
            'can_view_homework': r.can_view_homework,
            'can_view_fees': r.can_view_fees,
            'receive_notifications': r.receive_notifications,
            'start_date': r.start_date.isoformat() if r.start_date else None,
            'verified_at': r.verified_at.isoformat() if r.verified_at else None,
        })

    return Response({
        'id': guardian.id,
        'first_name': guardian.first_name,
        'last_name': guardian.last_name,
        'email': guardian.email,
        'mobile': guardian.mobile,
        'alternate_phone': guardian.alternate_phone,
        'address': guardian.address,
        'occupation': guardian.occupation,
        'preferred_language': guardian.preferred_language,
        'identity_type': guardian.identity_type,
        'identity_masked': guardian.masked_identity,
        'is_active': guardian.is_active,
        'username': guardian.user.username if guardian.user else None,
        'children': children_data,
        'created_at': guardian.created_at.isoformat(),
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def parent_reveal_identity(request, pk: int):
    """Reveals the full decrypted CNIC/ID for authorised staff, audited."""
    guardian = _get_guardian_for_staff(request.user, pk)
    full_id = reveal_guardian_identity(actor=request.user, guardian=guardian)
    return Response({
        'id': guardian.id,
        'identity_type': guardian.identity_type,
        'identity_number': full_id,
        'revealed_at': timezone.now().isoformat(),
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def parent_link_child(request, pk: int):
    """Links an additional child to an existing guardian."""
    guardian = _get_guardian_for_staff(request.user, pk)
    data = request.data
    student_id = data.get('student_id')
    relationship_type = data.get('relationship', 'guardian')
    is_primary = data.get('is_primary', False)
    permissions = data.get('permissions')
    notes = data.get('notes', '')

    if not student_id:
        raise ValidationError({'student_id': 'Student ID is required.'})

    rel = link_additional_child(
        actor=request.user,
        guardian=guardian,
        student_id=int(student_id),
        relationship_type=relationship_type,
        is_primary=bool(is_primary),
        permissions=permissions,
        notes=notes
    )

    return Response({
        'relationship_id': rel.id,
        'student_id': rel.student_id,
        'relationship': rel.relationship,
        'status': rel.status,
        'message': f"Linked {rel.student.full_name} successfully."
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def parent_revoke_relationship(request, pk: int, rel_id: int):
    """Revokes access for a specific child relationship without deleting history."""
    guardian = _get_guardian_for_staff(request.user, pk)
    reason = request.data.get('reason', 'Administrative decision')
    rel = revoke_guardian_relationship(
        actor=request.user,
        guardian=guardian,
        relationship_id=rel_id,
        reason=reason
    )
    return Response({
        'relationship_id': rel.get('relationship_id') if isinstance(rel, dict) else rel.id,
        'status': rel.get('status') if isinstance(rel, dict) else rel.status,
        'end_date': rel.get('end_date') if isinstance(rel, dict) else (rel.end_date.isoformat() if rel.end_date else None),
        'message': 'Relationship access revoked.'
    })


@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
def parent_update_relationship(request, pk: int, rel_id: int):
    """Updates permissions or status on a guardian relationship."""
    guardian = _get_guardian_for_staff(request.user, pk)
    try:
        rel = GuardianRelationship.objects.get(id=rel_id, guardian=guardian)
    except GuardianRelationship.DoesNotExist:
        raise NotFound("Relationship not found.")

    data = request.data
    fields_to_update = []

    for perm in ['can_view_academics', 'can_view_attendance', 'can_view_homework', 'can_view_fees', 'receive_notifications', 'is_primary']:
        if perm in data:
            setattr(rel, perm, bool(data[perm]))
            fields_to_update.append(perm)

    if 'relationship' in data:
        rel.relationship = data['relationship']
        fields_to_update.append('relationship')

    if fields_to_update:
        rel.save(update_fields=fields_to_update)
        record_event(
            actor=request.user,
            action='update_guardian_relationship',
            obj=rel,
            changed_fields=fields_to_update,
            before=None,
            after={f: getattr(rel, f) for f in fields_to_update}
        )

    return Response({'relationship_id': rel.id, 'status': 'updated'})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def parent_suspend(request, pk: int):
    """Suspends or reactivates a guardian profile."""
    guardian = _get_guardian_for_staff(request.user, pk)
    action = request.data.get('action', 'suspend')
    reason = request.data.get('reason', '')

    if action == 'reactivate':
        g = reactivate_guardian(actor=request.user, guardian=guardian)
        return Response({'status': 'active', 'message': 'Guardian account reactivated.'})
    else:
        g = suspend_guardian(actor=request.user, guardian=guardian, reason=reason)
        return Response({'status': 'suspended', 'message': 'Guardian account suspended.'})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def parent_reset_password(request, pk: int):
    """Issues a new temporary password or sends invite."""
    guardian = _get_guardian_for_staff(request.user, pk)
    result = reset_guardian_password(actor=request.user, guardian=guardian)
    return Response(result)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def parent_export(request):
    """Exports parent directory as CSV with audit log."""
    _require_staff_admin_or_principal(request.user)
    user = request.user

    qs = GuardianProfile.objects.select_related('user').prefetch_related('relationships__student__school')
    if not user.is_superuser:
        if user.role == 'organisation_admin':
            qs = qs.filter(organisation=user.organisation)
        elif user.role in ('principal', 'school_admin'):
            qs = qs.filter(relationships__student__school_id=user.school_id).distinct()

    response = HttpResponse(content_type='text/csv')
    response['Content-Disposition'] = 'attachment; filename="parents_directory.csv"'

    writer = csv.writer(response)
    writer.writerow(['Guardian ID', 'Full Name', 'Email', 'Mobile', 'ID (Masked)', 'Status', 'Linked Children', 'Created At'])

    for g in qs.order_by('-created_at'):
        children_names = ", ".join([r.student.full_name for r in g.relationships.all()])
        writer.writerow([
            g.id,
            g.full_name,
            g.email,
            g.mobile,
            g.masked_identity,
            'Active' if g.is_active else 'Suspended',
            children_names,
            g.created_at.strftime('%Y-%m-%d')
        ])

    record_event(
        actor=user,
        action='export_parents_directory',
        obj=user.organisation if user.organisation else user,
        changed_fields=['export'],
        before=None,
        after={'exported_count': qs.count()}
    )
    return response


# ---------------------------------------------------------------------------
# Parent Portal Self-Service Endpoints (role == 'parent')
# ---------------------------------------------------------------------------

def _require_parent(user: User):
    """Ensures request user is authenticated with parent role."""
    if not user.is_authenticated:
        raise PermissionDenied("Authentication required.")
    if user.role != 'parent' and not user.is_superuser:
        raise PermissionDenied("Parent portal is reserved for registered parents and guardians.")


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def parent_home(request):
    """Family Home: Summary cards for all linked children, sorted needs_attention first."""
    _require_parent(request.user)
    children = get_parent_children_summary(request.user)
    return Response({
        'children': children,
        'total_children': len(children),
        'server_date': timezone.localdate().isoformat()
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def parent_child_overview(request, student_id: int):
    """Tab A: Overview."""
    _require_parent(request.user)
    data = get_child_overview(request.user, student_id)
    return Response(data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def parent_child_results(request, student_id: int):
    """Tab B: Results & Progress (AQI Engine Level 5)."""
    _require_parent(request.user)
    year_id = request.query_params.get('academic_year_id')
    year_id_int = int(year_id) if year_id and year_id.isdigit() else None
    data = get_child_results(request.user, student_id, academic_year_id=year_id_int)
    return Response(data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def parent_child_attendance(request, student_id: int):
    """Tab C: Attendance."""
    _require_parent(request.user)
    data = get_child_attendance(request.user, student_id)
    return Response(data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def parent_child_risk_and_support(request, student_id: int):
    """Tab D: Risk & Support."""
    _require_parent(request.user)
    data = get_child_risk_and_support(request.user, student_id)
    return Response(data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def parent_acknowledge_alert(request, alert_id: int):
    """Parent acknowledges an active risk alert."""
    _require_parent(request.user)
    result = acknowledge_risk_alert(request.user, alert_id)
    return Response(result)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def parent_child_teachers(request, student_id: int):
    """Tab E: Teachers."""
    _require_parent(request.user)
    data = get_child_teachers(request.user, student_id)
    return Response(data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def parent_create_callback(request, student_id: int):
    """Submits a call-back request to a teacher."""
    _require_parent(request.user)
    data = request.data
    teacher_id = data.get('teacher_id')
    topic = data.get('topic', 'general')
    preferred_time = data.get('preferred_time', 'morning')
    message = data.get('message', '')

    if not teacher_id:
        raise ValidationError({'teacher_id': 'Teacher selection is required.'})
    if not message.strip():
        raise ValidationError({'message': 'Please provide a brief description of the topic.'})

    result = create_callback_request(
        user=request.user,
        student_id=student_id,
        teacher_id=int(teacher_id),
        topic=topic,
        preferred_time=preferred_time,
        message=message
    )
    return Response(result, status=status.HTTP_201_CREATED)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def parent_child_homework(request, student_id: int):
    """Tab F: Homework."""
    _require_parent(request.user)
    data = get_child_homework(request.user, student_id)
    return Response(data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def parent_child_fees(request, student_id: int):
    """Tab G: Fees."""
    _require_parent(request.user)
    data = get_child_fees(request.user, student_id)
    return Response(data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def parent_child_report_card(request, student_id: int):
    """Printable Progress Summary / Report Card."""
    _require_parent(request.user)
    data = generate_child_report_card(request.user, student_id)
    return Response(data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def parent_notifications_list(request):
    """List notifications for parent."""
    _require_parent(request.user)
    notifications = Notification.objects.filter(user=request.user).order_by('-created_at')[:50]
    data = [{
        'id': n.id,
        'title': n.title,
        'body': n.body,
        'read': n.read,
        'created_at': n.created_at.isoformat()
    } for n in notifications]
    return Response(data)


@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
def parent_notification_mark_read(request, pk: int):
    """Marks a notification as read."""
    _require_parent(request.user)
    try:
        n = Notification.objects.get(id=pk, user=request.user)
    except Notification.DoesNotExist:
        raise NotFound("Notification not found.")
    n.read = True
    n.save(update_fields=['read'])
    return Response({'id': n.id, 'read': True})


@api_view(['GET', 'PATCH'])
@permission_classes([IsAuthenticated])
def parent_notification_preferences(request):
    """Gets or updates parent notification preferences."""
    _require_parent(request.user)
    profile = getattr(request.user, 'guardian_profile', None)
    if not profile:
        return Response({
            'email_alerts': True,
            'sms_alerts': True,
            'attendance_alerts': True,
            'academic_alerts': True,
            'announcements': True,
            'weekly_digest': True
        })

    pref, _ = ParentNotificationPreference.objects.get_or_create(guardian=profile)

    if request.method == 'PATCH':
        data = request.data
        fields = ['email_alerts', 'sms_alerts', 'attendance_alerts', 'academic_alerts', 'announcements', 'weekly_digest']
        updated = []
        for f in fields:
            if f in data:
                setattr(pref, f, bool(data[f]))
                updated.append(f)
        if updated:
            pref.save(update_fields=updated)

    return Response({
        'email_alerts': pref.email_alerts,
        'sms_alerts': pref.sms_alerts,
        'attendance_alerts': pref.attendance_alerts,
        'academic_alerts': pref.academic_alerts,
        'announcements': pref.announcements,
        'weekly_digest': pref.weekly_digest
    })
