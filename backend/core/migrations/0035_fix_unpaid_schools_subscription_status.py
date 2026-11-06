from django.db import migrations

def reset_unpaid_subscriptions(apps, schema_editor):
    SchoolSubscription = apps.get_model('core', 'SchoolSubscription')
    SubscriptionOrder = apps.get_model('core', 'SubscriptionOrder')
    School = apps.get_model('core', 'School')

    # Demo schools to preserve (e.g. ALPHA-DEMO or seeded demos)
    demo_schools = set(School.objects.filter(code__icontains='DEMO').values_list('id', flat=True))

    for sub in SchoolSubscription.objects.all():
        if sub.school_id in demo_schools:
            continue
        # Check if there are any approved orders for this school
        has_approved_order = SubscriptionOrder.objects.filter(school=sub.school, status='approved').exists()
        if not has_approved_order:
            sub.status = 'no_plan'
            sub.plan = None
            sub.paid_until = None
            sub.current_period_start = None
            sub.grace_until = None
            sub.pending_downgrade_to_plan = None
            sub.save(update_fields=['status', 'plan', 'paid_until', 'current_period_start', 'grace_until', 'pending_downgrade_to_plan'])

def noop(apps, schema_editor):
    pass

class Migration(migrations.Migration):
    dependencies = [
        ('core', '0034_subscriptionorder_metadata'),
    ]

    operations = [
        migrations.RunPython(reset_unpaid_subscriptions, noop),
    ]
