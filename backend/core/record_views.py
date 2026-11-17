"""Record Module API Views (Spec Part A).

Provides filterable, audit-backed operational history across:
- Overview (KPI cards, monthly/yearly summaries, YoY growth)
- Staff Lifecycle History
- Student Academic Lifecycle History
- Fees & Defaulters Roll
- Income & Expense Ledger
- Salaries Register (with Principal salary line masking)
- Multi-sheet Streaming Excel Export (.xlsx)
"""
from rest_framework.decorators import api_view
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response

from core.models import StaffLifecycleEvent, StudentLifecycleEvent
from core.services.record_permissions import (
    resolve_record_school, check_record_capability, can_view_salary_lines
)
from core.services.record_service import (
    get_record_overview, get_staff_records, get_student_records,
    get_fees_records, get_finance_records, get_salary_records,
    create_manual_lifecycle_event, void_lifecycle_event
)
from core.services.record_exports import generate_record_excel_response


@api_view(['GET'])
def records_overview_view(request):
    """GET /api/v1/records/overview/"""
    school = resolve_record_school(request.user, request.query_params.get('campus') or request.query_params.get('school'))
    if not (check_record_capability(request.user, school, 'records.view_staff') or
            check_record_capability(request.user, school, 'records.view_students')):
        raise PermissionDenied('Access to Record Overview requires leadership authorization.')

    data = get_record_overview(school, request.query_params, request.user)
    return Response(data)


@api_view(['GET'])
def records_staff_view(request):
    """GET /api/v1/records/staff/"""
    school = resolve_record_school(request.user, request.query_params.get('campus') or request.query_params.get('school'))
    if not check_record_capability(request.user, school, 'records.view_staff'):
        raise PermissionDenied('Staff records access not permitted.')

    rows = get_staff_records(school, request.query_params, request.user)
    return Response({'rows': rows, 'total_count': len(rows)})


@api_view(['GET'])
def records_students_view(request):
    """GET /api/v1/records/students/"""
    school = resolve_record_school(request.user, request.query_params.get('campus') or request.query_params.get('school'))
    if not check_record_capability(request.user, school, 'records.view_students'):
        raise PermissionDenied('Student records access not permitted.')

    rows = get_student_records(school, request.query_params)
    return Response({'rows': rows, 'total_count': len(rows)})


@api_view(['GET'])
def records_fees_view(request):
    """GET /api/v1/records/fees/"""
    school = resolve_record_school(request.user, request.query_params.get('campus') or request.query_params.get('school'))
    if not check_record_capability(request.user, school, 'records.view_fees'):
        raise PermissionDenied('Fee records access not permitted.')

    rows = get_fees_records(school, request.query_params)
    return Response({'rows': rows, 'total_count': len(rows)})


@api_view(['GET'])
def records_finance_view(request):
    """GET /api/v1/records/finance/"""
    school = resolve_record_school(request.user, request.query_params.get('campus') or request.query_params.get('school'))
    if not check_record_capability(request.user, school, 'records.view_finance'):
        raise PermissionDenied('Finance records access not permitted.')

    rows = get_finance_records(school, request.query_params)
    return Response({'rows': rows, 'total_count': len(rows)})


@api_view(['GET'])
def records_salaries_view(request):
    """GET /api/v1/records/salaries/"""
    school = resolve_record_school(request.user, request.query_params.get('campus') or request.query_params.get('school'))
    if not check_record_capability(request.user, school, 'records.view_salaries'):
        raise PermissionDenied('Salary records access not permitted.')

    rows = get_salary_records(school, request.query_params, request.user)
    show_lines = can_view_salary_lines(request.user, school)
    return Response({
        'rows': rows,
        'total_count': len(rows),
        'salary_lines_unlocked': show_lines,
    })


@api_view(['POST'])
def records_create_event_view(request, target_type):
    """POST /api/v1/records/events/<target_type>/"""
    school = resolve_record_school(request.user, request.data.get('campus') or request.data.get('school_id'))
    if not check_record_capability(request.user, school, 'records.manage'):
        raise PermissionDenied('Management of lifecycle records is not permitted.')

    ev = create_manual_lifecycle_event(school, target_type, request.data, request.user)
    return Response({
        'status': 'created',
        'event_id': ev.id,
        'event_type': ev.event_type,
        'effective_date': str(ev.effective_date),
    }, status=201)


@api_view(['POST'])
def records_void_event_view(request, target_type, event_id):
    """POST /api/v1/records/events/<target_type>/<id>/void/"""
    school = resolve_record_school(request.user, request.data.get('campus') or request.data.get('school_id'))
    if not check_record_capability(request.user, school, 'records.manage'):
        raise PermissionDenied('Management of lifecycle records is not permitted.')

    model_class = StaffLifecycleEvent if target_type == 'staff' else StudentLifecycleEvent
    reason = request.data.get('void_reason', '')
    ev = void_lifecycle_event(model_class, event_id, school, reason, request.user)
    return Response({
        'status': 'voided',
        'event_id': ev.id,
        'void_reason': ev.void_reason,
    })


@api_view(['GET'])
def records_export_view(request):
    """GET /api/v1/records/export/

    Streaming dual-sheet Excel (.xlsx) export using identical filter parameters as screens.
    """
    school = resolve_record_school(request.user, request.query_params.get('campus') or request.query_params.get('school'))
    if not check_record_capability(request.user, school, 'records.export'):
        raise PermissionDenied('Export permission required.')

    page_type = request.query_params.get('page_type', 'overview').lower()

    if page_type == 'staff':
        if not check_record_capability(request.user, school, 'records.view_staff'):
            raise PermissionDenied('Staff view capability required for staff export.')
        rows = get_staff_records(school, request.query_params, request.user)
        cols = [
            {'key': 'staff_name', 'label': 'Staff Member', 'type': 'text'},
            {'key': 'position', 'label': 'Position / Title', 'type': 'text'},
            {'key': 'role', 'label': 'Assigned Role', 'type': 'text'},
            {'key': 'event_type_display', 'label': 'Event Type', 'type': 'text'},
            {'key': 'effective_date', 'label': 'Effective Date', 'type': 'date'},
            {'key': 'reason_category', 'label': 'Reason Category', 'type': 'text'},
            {'key': 'from_campus', 'label': 'From Campus', 'type': 'text'},
            {'key': 'to_campus', 'label': 'To Campus', 'type': 'text'},
            {'key': 'notes', 'label': 'Notes / Remarks', 'type': 'text'},
            {'key': 'recorded_by', 'label': 'Recorded By', 'type': 'text'},
        ]
        return generate_record_excel_response(
            request, school, 'staff', 'Staff Lifecycle', request.query_params.dict(), cols, rows
        )

    elif page_type == 'students':
        if not check_record_capability(request.user, school, 'records.view_students'):
            raise PermissionDenied('Student view capability required for student export.')
        rows = get_student_records(school, request.query_params)
        cols = [
            {'key': 'admission_number', 'label': 'Admission #', 'type': 'text'},
            {'key': 'student_name', 'label': 'Student Name', 'type': 'text'},
            {'key': 'class_name', 'label': 'Class', 'type': 'text'},
            {'key': 'section_name', 'label': 'Section', 'type': 'text'},
            {'key': 'session_name', 'label': 'Academic Year', 'type': 'text'},
            {'key': 'event_type_display', 'label': 'Event Status', 'type': 'text'},
            {'key': 'leave_subtype', 'label': 'Departure Type', 'type': 'text'},
            {'key': 'effective_date', 'label': 'Effective Date', 'type': 'date'},
            {'key': 'reason', 'label': 'Reason / Justification', 'type': 'text'},
            {'key': 'notes', 'label': 'Notes', 'type': 'text'},
            {'key': 'recorded_by', 'label': 'Recorded By', 'type': 'text'},
        ]
        return generate_record_excel_response(
            request, school, 'students', 'Student Lifecycle', request.query_params.dict(), cols, rows
        )

    elif page_type == 'fees':
        if not check_record_capability(request.user, school, 'records.view_fees'):
            raise PermissionDenied('Fee view capability required for fee export.')
        rows = get_fees_records(school, request.query_params)
        cols = [
            {'key': 'receipt_number', 'label': 'Receipt #', 'type': 'text'},
            {'key': 'admission_number', 'label': 'Admission #', 'type': 'text'},
            {'key': 'student_name', 'label': 'Student Name', 'type': 'text'},
            {'key': 'amount', 'label': 'Amount Paid (PKR)', 'type': 'currency'},
            {'key': 'method', 'label': 'Payment Mode', 'type': 'text'},
            {'key': 'paid_on', 'label': 'Date Collected', 'type': 'date'},
            {'key': 'reference', 'label': 'Reference / Cheque #', 'type': 'text'},
            {'key': 'received_by', 'label': 'Received By', 'type': 'text'},
        ]
        return generate_record_excel_response(
            request, school, 'fees', 'Fee Collection Roll', request.query_params.dict(), cols, rows
        )

    elif page_type == 'finance':
        if not check_record_capability(request.user, school, 'records.view_finance'):
            raise PermissionDenied('Finance view capability required for finance export.')
        rows = get_finance_records(school, request.query_params)
        cols = [
            {'key': 'kind', 'label': 'Kind (Income / Expense)', 'type': 'text'},
            {'key': 'category_name', 'label': 'Accounting Category', 'type': 'text'},
            {'key': 'amount', 'label': 'Amount (PKR)', 'type': 'currency'},
            {'key': 'date', 'label': 'Transaction Date', 'type': 'date'},
            {'key': 'description', 'label': 'Description / Notes', 'type': 'text'},
            {'key': 'created_by', 'label': 'Recorded By', 'type': 'text'},
        ]
        return generate_record_excel_response(
            request, school, 'finance', 'Income & Expenses', request.query_params.dict(), cols, rows
        )

    elif page_type == 'salaries':
        if not check_record_capability(request.user, school, 'records.view_salaries'):
            raise PermissionDenied('Salary view capability required for salary export.')
        rows = get_salary_records(school, request.query_params, request.user)
        show_lines = can_view_salary_lines(request.user, school)
        cols = [
            {'key': 'staff_name', 'label': 'Staff Member', 'type': 'text'},
            {'key': 'position', 'label': 'Position', 'type': 'text'},
            {'key': 'month', 'label': 'Disbursement Month', 'type': 'text'},
            {'key': 'gross', 'label': 'Gross Salary (PKR)' if show_lines else 'Gross (Masked)', 'type': 'currency' if show_lines else 'text'},
            {'key': 'net', 'label': 'Net Disbursed (PKR)' if show_lines else 'Net (Masked)', 'type': 'currency' if show_lines else 'text'},
            {'key': 'paid_on', 'label': 'Payment Date', 'type': 'date'},
            {'key': 'method', 'label': 'Disbursement Mode', 'type': 'text'},
        ]
        return generate_record_excel_response(
            request, school, 'salaries', 'Staff Salaries', request.query_params.dict(), cols, rows
        )

    # Default to Overview table export
    overview = get_record_overview(school, request.query_params, request.user)
    rows = overview.get('monthly_summary', [])
    cols = [
        {'key': 'month', 'label': 'Billing Month', 'type': 'text'},
        {'key': 'admitted', 'label': 'Admissions', 'type': 'number'},
        {'key': 'left', 'label': 'Departures', 'type': 'number'},
        {'key': 'collected', 'label': 'Fees Collected', 'type': 'currency'},
        {'key': 'income', 'label': 'Total Income', 'type': 'currency'},
        {'key': 'expense', 'label': 'Total Expense', 'type': 'currency'},
        {'key': 'net', 'label': 'Net Balance', 'type': 'currency'},
        {'key': 'salaries', 'label': 'Salaries Disbursed', 'type': 'currency'},
    ]
    return generate_record_excel_response(
        request, school, 'overview', 'Record Executive Overview', request.query_params.dict(), cols, rows
    )
