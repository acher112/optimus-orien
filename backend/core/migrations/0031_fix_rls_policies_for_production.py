# Generated migration to update RLS policies for multi-cloud PostgreSQL compatibility (Neon/Render/local)

from django.db import migrations


def update_rls_policies(apps, schema_editor):
    if schema_editor.connection.vendor != 'postgresql':
        return
    with schema_editor.connection.cursor() as cursor:
        tables = [
            'core_schoolsubscription',
            'core_subscriptionorder',
            'core_schoolfeatureoverride',
            'core_subscriptionevent',
        ]
        for tbl in tables:
            cursor.execute(f"ALTER TABLE {tbl} ENABLE ROW LEVEL SECURITY;")
            cursor.execute(f"ALTER TABLE {tbl} FORCE ROW LEVEL SECURITY;")
            policy_name = f"{tbl}_isolation_policy"
            cursor.execute(f"DROP POLICY IF EXISTS {policy_name} ON {tbl};")
            cursor.execute(f"""
                CREATE POLICY {policy_name} ON {tbl}
                USING (
                    NULLIF(current_setting('app.current_school_id', true), '') IS NULL
                    OR school_id = NULLIF(current_setting('app.current_school_id', true), '')::integer
                    OR current_setting('app.is_platform_admin', true) = 'true'
                    OR current_user = 'postgres'
                )
                WITH CHECK (
                    NULLIF(current_setting('app.current_school_id', true), '') IS NULL
                    OR school_id = NULLIF(current_setting('app.current_school_id', true), '')::integer
                    OR current_setting('app.is_platform_admin', true) = 'true'
                    OR current_user = 'postgres'
                );
            """)
            cursor.execute(f"GRANT SELECT, INSERT, UPDATE, DELETE ON {tbl} TO PUBLIC;")


def revert_rls_policies(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0030_subscriptionorder_checkout_url_and_more'),
    ]

    operations = [
        migrations.RunPython(update_rls_policies, revert_rls_policies),
    ]
