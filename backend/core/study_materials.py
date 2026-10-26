"""Study Materials service: private repository, file signature validation,
teacher/admin uploads, student/parent scoped downloads, version replacement,
and automated student notifications upon publishing.
"""
import os
import uuid
from datetime import datetime
from pathlib import Path

from django.conf import settings
from django.db import transaction
from django.db.models import F, Q
from django.http import FileResponse, Http404
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, parser_classes
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.response import Response

from core.models import (
    School, SchoolClass, Subject, User, Student, Enrollment,
    ClassSubjectTeacher, ClassTimetable, Notification, StudyMaterial
)
from core.services.access import schools_scope
from core.services.audit import record_event
from core.services.exports import handle_export

# 20 MB max file size
MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024

ALLOWED_EXTENSIONS = {
    'pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx',
    'txt', 'csv', 'png', 'jpg', 'jpeg', 'mp4'
}

MIME_TYPE_MAP = {
    'pdf': 'application/pdf',
    'doc': 'application/msword',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'ppt': 'application/vnd.ms-powerpoint',
    'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'xls': 'application/vnd.ms-excel',
    'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'txt': 'text/plain',
    'csv': 'text/csv',
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'mp4': 'video/mp4',
}


def _validate_file_signature(uploaded_file, ext):
    """Validate content signature (magic bytes) to prevent extension spoofing and executable uploads."""
    pos = uploaded_file.tell()
    header = uploaded_file.read(512)
    uploaded_file.seek(pos)

    if not header:
        raise ValidationError({'file': 'Empty file cannot be uploaded.'})

    # Reject Windows/DOS executables (MZ)
    if header.startswith(b'MZ'):
        raise ValidationError({'file': 'Executable binaries are strictly prohibited.'})

    # Reject ELF executables
    if header.startswith(b'\x7fELF'):
        raise ValidationError({'file': 'Executable binaries are strictly prohibited.'})

    # Reject script/html content
    lower_h = header.lower()
    if b'<script' in lower_h or b'<html' in lower_h or b'<!doctype' in lower_h or b'<?php' in lower_h or b'<svg' in lower_h:
        raise ValidationError({'file': 'HTML, scripts, SVG, or PHP code cannot be uploaded as study materials.'})

    if ext == 'pdf':
        if not header.startswith(b'%PDF-'):
            raise ValidationError({'file': 'Invalid PDF file signature.'})
    elif ext == 'png':
        if not header.startswith(b'\x89PNG\r\n\x1a\n'):
            raise ValidationError({'file': 'Invalid PNG image file signature.'})
    elif ext in ('jpg', 'jpeg'):
        if not header.startswith(b'\xff\xd8\xff'):
            raise ValidationError({'file': 'Invalid JPEG image file signature.'})
    elif ext in ('docx', 'pptx', 'xlsx'):
        # Office OpenXML files are ZIP archives starting with PK\x03\x04
        if not header.startswith(b'PK\x03\x04'):
            raise ValidationError({'file': f'Invalid Office {ext.upper()} document signature.'})
    elif ext in ('doc', 'ppt', 'xls'):
        # OLE Compound Document Header
        if not header.startswith(b'\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1'):
            raise ValidationError({'file': f'Invalid legacy Office {ext.upper()} document signature.'})
    elif ext == 'mp4':
        # MP4 files contain 'ftyp' within first 16 bytes
        if b'ftyp' not in header[:16]:
            raise ValidationError({'file': 'Invalid MP4 video file signature.'})
    elif ext in ('txt', 'csv'):
        # Ensure plain text without binary null bytes
        if b'\x00' in header:
            raise ValidationError({'file': 'Invalid text/CSV file: binary data detected.'})


def _is_teacher_assigned_to_class(user, school_class, subject=None):
    """Check whether a teacher is assigned to teach this class (and optionally subject)."""
    if school_class.teacher_id == user.id:
        return True

    qs = ClassSubjectTeacher.objects.filter(teacher=user, school_class=school_class)
    if subject:
        qs = qs.filter(subject=subject)
    if qs.exists():
        return True

    t_qs = ClassTimetable.objects.filter(teacher=user, school_class=school_class)
    if subject:
        t_qs = t_qs.filter(subject=subject)
    return t_qs.exists()


def _save_private_file(uploaded_file, school_id, ext):
    """Store file under a random UUID in private storage directory."""
    root = getattr(settings, 'PRIVATE_STORAGE_ROOT', Path(settings.BASE_DIR) / 'private_storage')
    school_dir = root / 'materials' / str(school_id)
    school_dir.mkdir(parents=True, exist_ok=True)

    file_uuid = uuid.uuid4().hex
    stored_name = f"{file_uuid}.{ext}"
    full_path = school_dir / stored_name

    with open(full_path, 'wb+') as destination:
        for chunk in uploaded_file.chunks():
            destination.write(chunk)

    rel_path = f"materials/{school_id}/{stored_name}"
    return rel_path


def _notify_students_of_material(material, actor):
    """Broadcast notification to enrolled students and linked parents upon publication."""
    enrollments = Enrollment.objects.filter(
        school_class=material.school_class,
        end_date__isnull=True
    ).select_related('student__user').prefetch_related('student__guardians')

    uploader_name = actor.get_full_name() or actor.username
    subject_label = f"[{material.subject.name}] " if material.subject else ""
    title = f"New Study Material: {subject_label}{material.title}"
    body = f"A new study material '{material.title}' has been uploaded for {material.school_class.name}."

    notifications = []
    notified_users = set()

    for en in enrollments:
        st = en.student
        if st.user and st.user_id not in notified_users:
            notifications.append(Notification(user=st.user, title=title, body=body))
            notified_users.add(st.user_id)
        for g in st.guardians.all():
            if g.id not in notified_users:
                p_body = f"New study material for {st.full_name}: '{material.title}' ({material.school_class.name})."
                notifications.append(Notification(user=g, title=title, body=p_body))
                notified_users.add(g.id)

    if notifications:
        Notification.objects.bulk_create(notifications)


# ------------------------------------------------------------------ Endpoints
@api_view(['GET', 'POST'])
@parser_classes([MultiPartParser, FormParser])
def materials_list(request):
    user = request.user
    if not user.is_authenticated or not user.is_active:
        raise PermissionDenied('Active account required.')

    now = timezone.now()

    # GET - List study materials
    if request.method == 'GET':
        qs = StudyMaterial.objects.select_related('school', 'school_class', 'subject', 'uploaded_by')

        if user.role == 'student':
            enrolled_classes = Enrollment.objects.filter(student__user=user, end_date__isnull=True).values_list('school_class_id', flat=True)
            qs = qs.filter(
                school_class_id__in=enrolled_classes,
                status='published'
            ).filter(Q(visible_from__isnull=True) | Q(visible_from__lte=now))
        elif user.role == 'parent':
            enrolled_classes = Enrollment.objects.filter(student__guardians=user, end_date__isnull=True).values_list('school_class_id', flat=True)
            qs = qs.filter(
                school_class_id__in=enrolled_classes,
                status='published'
            ).filter(Q(visible_from__isnull=True) | Q(visible_from__lte=now))
        elif user.role == 'teacher':
            # Teachers see materials in their campus, excluding deleted/irrelevant
            qs = qs.filter(school__in=schools_scope(user)).exclude(status='archived')
            # If specific class is passed or all assigned
            if request.query_params.get('my_classes') == '1':
                taught_classes = SchoolClass.objects.filter(
                    Q(teacher=user) |
                    Q(subject_teachers__teacher=user) |
                    Q(timetable_entries__teacher=user)
                ).values_list('id', flat=True)
                qs = qs.filter(school_class_id__in=taught_classes)
        else:
            # Leadership roles
            qs = qs.filter(school__in=schools_scope(user))

        # Query filters
        if request.query_params.get('school'):
            qs = qs.filter(school_id=request.query_params['school'])
        if request.query_params.get('class'):
            qs = qs.filter(school_class_id=request.query_params['class'])
        if request.query_params.get('subject'):
            qs = qs.filter(subject_id=request.query_params['subject'])
        if request.query_params.get('status') and user.role not in ('student', 'parent'):
            qs = qs.filter(status=request.query_params['status'])
        if request.query_params.get('q'):
            q = request.query_params['q'].strip()
            qs = qs.filter(Q(title__icontains=q) | Q(description__icontains=q) | Q(original_filename__icontains=q))

        # Handle Universal Export (?format=csv|xlsx|pdf)
        export_cols = [
            {'key': 'title', 'label': 'Title'},
            {'key': 'school_class_name', 'label': 'Class'},
            {'key': 'subject_name', 'label': 'Subject'},
            {'key': 'original_filename', 'label': 'File Name'},
            {'key': 'size_formatted', 'label': 'File Size'},
            {'key': 'status', 'label': 'Status'},
            {'key': 'download_count', 'label': 'Downloads'},
            {'key': 'uploader_name', 'label': 'Uploaded By'},
            {'key': 'created_at_date', 'label': 'Date Uploaded'},
        ]
        export_rows = [{
            'title': m.title,
            'school_class_name': m.school_class.name,
            'subject_name': m.subject.name if m.subject else 'General / All Subjects',
            'original_filename': m.original_filename,
            'size_formatted': f"{m.size_bytes / (1024 * 1024):.2f} MB" if m.size_bytes >= 1024 * 1024 else f"{m.size_bytes / 1024:.1f} KB",
            'status': m.get_status_display(),
            'download_count': m.download_count,
            'uploader_name': (m.uploaded_by.get_full_name() or m.uploaded_by.username) if m.uploaded_by else 'System',
            'created_at_date': m.created_at.strftime('%Y-%m-%d'),
        } for m in qs[:2000]]

        export_res = handle_export(request, export_rows, filename='study-materials', title='Study Materials Directory', columns=export_cols)
        if export_res:
            return export_res

        results = [{
            'id': m.id,
            'school_id': m.school_id,
            'school_name': m.school.name,
            'school_class_id': m.school_class_id,
            'school_class_name': m.school_class.name,
            'subject_id': m.subject_id,
            'subject_name': m.subject.name if m.subject else None,
            'subject_code': m.subject.code if m.subject else None,
            'title': m.title,
            'description': m.description,
            'original_filename': m.original_filename,
            'content_type': m.content_type,
            'size_bytes': m.size_bytes,
            'size_formatted': f"{m.size_bytes / (1024 * 1024):.2f} MB" if m.size_bytes >= 1024 * 1024 else f"{m.size_bytes / 1024:.1f} KB",
            'uploaded_by_id': m.uploaded_by_id,
            'uploaded_by_name': (m.uploaded_by.get_full_name() or m.uploaded_by.username) if m.uploaded_by else None,
            'visible_from': m.visible_from.isoformat() if m.visible_from else None,
            'status': m.status,
            'download_count': m.download_count,
            'version': m.version,
            'created_at': m.created_at.isoformat(),
            'updated_at': m.updated_at.isoformat(),
        } for m in qs[:150]]

        return Response({'results': results})

    # POST - Upload new study material
    if user.role in ('student', 'parent'):
        raise PermissionDenied('Students and parents cannot upload study materials.')

    data = request.data
    class_id = data.get('school_class')
    school_class = SchoolClass.objects.filter(pk=class_id, school__in=schools_scope(user)).select_related('school').first()
    if not school_class:
        raise ValidationError({'school_class': 'Valid school class required within your campus scope.'})

    subj_id = data.get('subject')
    subject = None
    if subj_id:
        subject = Subject.objects.filter(pk=subj_id, school=school_class.school).first()
        if not subject:
            raise ValidationError({'subject': 'Subject must belong to the same campus as the class.'})

    # Validate teacher permission
    if user.role == 'teacher':
        if not _is_teacher_assigned_to_class(user, school_class, subject):
            raise PermissionDenied('You can only upload materials for classes and subjects assigned to you.')

    title = (data.get('title') or '').strip()[:200]
    if not title:
        raise ValidationError({'title': 'Material title is required.'})

    description = (data.get('description') or '').strip()
    status_val = (data.get('status') or 'published').lower()
    if status_val not in ('draft', 'published', 'archived'):
        status_val = 'published'

    visible_from = None
    if data.get('visible_from'):
        try:
            visible_from = datetime.fromisoformat(data['visible_from'])
        except Exception:
            pass

    # File extraction & validation
    uploaded_file = request.FILES.get('file')
    if not uploaded_file:
        raise ValidationError({'file': 'Please select a file to upload.'})

    if uploaded_file.size > MAX_FILE_SIZE_BYTES:
        raise ValidationError({'file': f'File exceeds maximum size limit of {MAX_FILE_SIZE_BYTES // (1024 * 1024)} MB.'})

    orig_name = uploaded_file.name
    ext = orig_name.split('.')[-1].lower() if '.' in orig_name else ''
    if ext not in ALLOWED_EXTENSIONS:
        raise ValidationError({'file': f'File type .{ext} is not allowed. Allowed types: {", ".join(sorted(ALLOWED_EXTENSIONS))}'})

    _validate_file_signature(uploaded_file, ext)

    # Save to private storage
    rel_path = _save_private_file(uploaded_file, school_class.school_id, ext)
    content_type = MIME_TYPE_MAP.get(ext, uploaded_file.content_type or 'application/octet-stream')

    with transaction.atomic():
        material = StudyMaterial.objects.create(
            school=school_class.school,
            school_class=school_class,
            subject=subject,
            title=title,
            description=description,
            file_path=rel_path,
            original_filename=orig_name[:255],
            content_type=content_type,
            size_bytes=uploaded_file.size,
            uploaded_by=user,
            visible_from=visible_from,
            status=status_val,
            version=1
        )
        record_event(actor=user, action='upload_material', obj=material)

        if material.status == 'published' and (not visible_from or visible_from <= timezone.now()):
            _notify_students_of_material(material, user)

    return Response({
        'id': material.id,
        'title': material.title,
        'school_class': material.school_class_id,
        'subject': material.subject_id,
        'original_filename': material.original_filename,
        'size_bytes': material.size_bytes,
        'status': material.status,
        'version': material.version
    }, status=201)


@api_view(['GET', 'PATCH'])
def material_detail(request, pk):
    user = request.user
    if not user.is_authenticated or not user.is_active:
        raise PermissionDenied('Active account required.')

    now = timezone.now()
    material = StudyMaterial.objects.filter(pk=pk).select_related('school', 'school_class', 'subject', 'uploaded_by').first()
    if not material:
        raise NotFound('Study material not found.')

    # Scope verification
    if user.role == 'student':
        if material.status != 'published' or (material.visible_from and material.visible_from > now):
            raise NotFound('Study material not available.')
        is_enrolled = Enrollment.objects.filter(student__user=user, school_class=material.school_class, end_date__isnull=True).exists()
        if not is_enrolled:
            raise NotFound('Study material not found.')
    elif user.role == 'parent':
        if material.status != 'published' or (material.visible_from and material.visible_from > now):
            raise NotFound('Study material not available.')
        is_enrolled = Enrollment.objects.filter(student__guardians=user, school_class=material.school_class, end_date__isnull=True).exists()
        if not is_enrolled:
            raise NotFound('Study material not found.')
    else:
        if material.school_id not in schools_scope(user).values_list('id', flat=True):
            raise NotFound('Study material outside campus scope.')

    if request.method == 'GET':
        return Response({
            'id': material.id,
            'school_id': material.school_id,
            'school_name': material.school.name,
            'school_class_id': material.school_class_id,
            'school_class_name': material.school_class.name,
            'subject_id': material.subject_id,
            'subject_name': material.subject.name if material.subject else None,
            'title': material.title,
            'description': material.description,
            'original_filename': material.original_filename,
            'content_type': material.content_type,
            'size_bytes': material.size_bytes,
            'uploaded_by_name': (material.uploaded_by.get_full_name() or material.uploaded_by.username) if material.uploaded_by else None,
            'visible_from': material.visible_from.isoformat() if material.visible_from else None,
            'status': material.status,
            'download_count': material.download_count,
            'version': material.version,
            'created_at': material.created_at.isoformat(),
        })

    # PATCH - Update metadata
    if user.role in ('student', 'parent'):
        raise PermissionDenied('Students and parents cannot edit study materials.')

    if user.role == 'teacher' and not _is_teacher_assigned_to_class(user, material.school_class, material.subject):
        raise PermissionDenied('You can only edit study materials for assigned classes.')

    data = request.data
    changed_fields = []
    old_status = material.status

    if 'title' in data:
        t = (data['title'] or '').strip()[:200]
        if t:
            material.title = t
            changed_fields.append('title')
    if 'description' in data:
        material.description = str(data['description']).strip()
        changed_fields.append('description')
    if 'status' in data:
        s = str(data['status']).lower()
        if s in ('draft', 'published', 'archived'):
            material.status = s
            changed_fields.append('status')
    if 'visible_from' in data:
        if data['visible_from']:
            try:
                material.visible_from = datetime.fromisoformat(data['visible_from'])
                changed_fields.append('visible_from')
            except Exception:
                pass
        else:
            material.visible_from = None
            changed_fields.append('visible_from')

    if changed_fields:
        material.save(update_fields=changed_fields + ['updated_at'])
        record_event(actor=user, action='update_material', obj=material, changed_fields=changed_fields)

        if old_status != 'published' and material.status == 'published':
            _notify_students_of_material(material, user)

    return Response({'id': material.id, 'title': material.title, 'status': material.status})


@api_view(['POST'])
def material_archive(request, pk):
    """Safely archive a study material without hard-deleting the file or database row."""
    user = request.user
    if not user.is_authenticated or not user.is_active:
        raise PermissionDenied('Active account required.')

    if user.role in ('student', 'parent'):
        raise PermissionDenied('Permission denied.')

    material = StudyMaterial.objects.filter(pk=pk, school__in=schools_scope(user)).first()
    if not material:
        raise NotFound('Study material not found.')

    if user.role == 'teacher' and not _is_teacher_assigned_to_class(user, material.school_class, material.subject):
        raise PermissionDenied('You can only archive materials for assigned classes.')

    material.status = 'archived'
    material.save(update_fields=['status', 'updated_at'])
    record_event(actor=user, action='archive_material', obj=material)

    return Response({'success': True, 'id': material.id, 'status': 'archived'})


@api_view(['GET'])
def material_download(request, pk):
    """Scoped authenticated download of a study material from private storage."""
    user = request.user
    if not user.is_authenticated or not user.is_active:
        raise PermissionDenied('Active account required.')

    now = timezone.now()
    material = StudyMaterial.objects.filter(pk=pk).select_related('school', 'school_class').first()
    if not material:
        raise NotFound('Study material not found.')

    if user.role == 'student':
        if material.status != 'published' or (material.visible_from and material.visible_from > now):
            raise NotFound('Study material not available.')
        is_enrolled = Enrollment.objects.filter(student__user=user, school_class=material.school_class, end_date__isnull=True).exists()
        if not is_enrolled:
            raise NotFound('Study material not found.')
    elif user.role == 'parent':
        if material.status != 'published' or (material.visible_from and material.visible_from > now):
            raise NotFound('Study material not available.')
        is_enrolled = Enrollment.objects.filter(student__guardians=user, school_class=material.school_class, end_date__isnull=True).exists()
        if not is_enrolled:
            raise NotFound('Study material not found.')
    else:
        if material.school_id not in schools_scope(user).values_list('id', flat=True):
            raise NotFound('Study material outside campus scope.')

    root = getattr(settings, 'PRIVATE_STORAGE_ROOT', Path(settings.BASE_DIR) / 'private_storage')
    full_path = root / material.file_path
    if not os.path.exists(full_path):
        raise NotFound('File not found in storage archive.')

    # Increment download counter atomically
    StudyMaterial.objects.filter(pk=material.pk).update(download_count=F('download_count') + 1)

    response = FileResponse(open(full_path, 'rb'), content_type=material.content_type)
    # Sanitize download display filename
    clean_display_name = material.original_filename.replace('"', '').replace("'", "").strip() or f"material-{material.id}"
    response['Content-Disposition'] = f'attachment; filename="{clean_display_name}"'
    response['X-Content-Type-Options'] = 'nosniff'
    response['Cache-Control'] = 'no-store, no-cache, must-revalidate'
    return response


@api_view(['POST'])
@parser_classes([MultiPartParser, FormParser])
def material_replace(request, pk):
    """Replace an existing study material with a new file, incrementing version and preserving history."""
    user = request.user
    if not user.is_authenticated or not user.is_active:
        raise PermissionDenied('Active account required.')

    if user.role in ('student', 'parent'):
        raise PermissionDenied('Permission denied.')

    old_material = StudyMaterial.objects.filter(pk=pk, school__in=schools_scope(user)).first()
    if not old_material:
        raise NotFound('Study material not found.')

    if user.role == 'teacher' and not _is_teacher_assigned_to_class(user, old_material.school_class, old_material.subject):
        raise PermissionDenied('You can only replace materials for assigned classes.')

    uploaded_file = request.FILES.get('file')
    if not uploaded_file:
        raise ValidationError({'file': 'Replacement file is required.'})

    if uploaded_file.size > MAX_FILE_SIZE_BYTES:
        raise ValidationError({'file': f'File exceeds maximum size limit of {MAX_FILE_SIZE_BYTES // (1024 * 1024)} MB.'})

    orig_name = uploaded_file.name
    ext = orig_name.split('.')[-1].lower() if '.' in orig_name else ''
    if ext not in ALLOWED_EXTENSIONS:
        raise ValidationError({'file': f'File type .{ext} is not allowed.'})

    _validate_file_signature(uploaded_file, ext)

    rel_path = _save_private_file(uploaded_file, old_material.school_id, ext)
    content_type = MIME_TYPE_MAP.get(ext, uploaded_file.content_type or 'application/octet-stream')

    with transaction.atomic():
        # Archive old material
        old_material.status = 'archived'
        old_material.save(update_fields=['status', 'updated_at'])

        # Create new version
        new_material = StudyMaterial.objects.create(
            school=old_material.school,
            school_class=old_material.school_class,
            subject=old_material.subject,
            title=request.data.get('title') or old_material.title,
            description=request.data.get('description') or old_material.description,
            file_path=rel_path,
            original_filename=orig_name[:255],
            content_type=content_type,
            size_bytes=uploaded_file.size,
            uploaded_by=user,
            visible_from=old_material.visible_from,
            status='published',
            version=old_material.version + 1,
            previous_version=old_material
        )
        record_event(actor=user, action='replace_material', obj=new_material)

    return Response({
        'id': new_material.id,
        'title': new_material.title,
        'version': new_material.version,
        'previous_id': old_material.id,
        'original_filename': new_material.original_filename
    }, status=201)
