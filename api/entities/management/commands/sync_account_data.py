"""
Management command to sync account data from production to local database.

Usage:
    python manage.py sync_account_data --prod-db-url=$PROD_DATABASE_URL +12025550110 +12025550111 +12025550112
"""

import os
from urllib.parse import urlparse

import psycopg2
from django.contrib.auth.models import User
from django.core.management.base import BaseCommand
from django.db import transaction

from entities.models import (
    Annotation,
    DailySummary,
    Document,
    Entity,
    FiveMinuteSummary,
    HourlySummary,
    Message,
    MonthlySummary,
    Session,
    WeeklySummary,
)
from lms.accounts.models import Account, UserProfile
from lms.calendars.models import Goal
from sms.models import SMSMessage


class Command(BaseCommand):
    help = "Sync account data from production to local database"

    def add_arguments(self, parser):
        parser.add_argument(
            "phone_numbers",
            nargs="+",
            type=str,
            help="Phone numbers to sync (e.g., +12025550110)",
        )
        parser.add_argument(
            "--prod-db-url",
            type=str,
            help="Production database URL (postgres://...)",
            default=os.environ.get("PROD_DATABASE_URL"),
        )
        parser.add_argument(
            "--include-sms",
            action="store_true",
            help="Include SMS messages (can be large)",
        )

    def handle(self, *args, **options):
        phone_numbers = options["phone_numbers"]
        prod_db_url = options["prod_db_url"]
        include_sms = options["include_sms"]

        if not prod_db_url:
            self.stdout.write(self.style.ERROR("Please provide --prod-db-url or set PROD_DATABASE_URL"))
            return

        parsed = urlparse(prod_db_url)
        self.stdout.write(f"Connecting to production DB: {parsed.hostname}...")

        try:
            conn = psycopg2.connect(prod_db_url)
            conn.autocommit = True
            cursor = conn.cursor()

            # Disable statement timeout for this sync
            from django.db import connection

            with connection.cursor() as local_cursor:
                local_cursor.execute("SET statement_timeout = 0")

            for phone in phone_numbers:
                self.stdout.write(f"\n{'=' * 60}")
                self.stdout.write(f"Syncing: {phone}")
                self.stdout.write(f"{'=' * 60}")

                self._sync_account(cursor, phone, include_sms)

            cursor.close()
            conn.close()

        except Exception as e:
            self.stdout.write(self.style.ERROR(f"Error: {e}"))
            raise e

        self.stdout.write(self.style.SUCCESS("\nSync complete!"))

    def _sync_account(self, cursor, phone: str, include_sms: bool):
        """Sync a single account from production to local."""

        # 1. Get account from production
        cursor.execute(
            """
            SELECT id, account_phone, timezone, is_active, is_admin, is_locked, tutor_name,
                   registration_source, referral_code, stripe_customer_id,
                   revenuecat_subscription_status, revenuecat_product_id, revenuecat_entitlement,
                   revenuecat_app_user_id, subscription_expires_at, created_at, updated_at,
                   signup_metadata, user_id, zip_code, attribution, referred_by_id
            FROM lms_accounts_account
            WHERE account_phone = %s
        """,
            (phone,),
        )
        account_row = cursor.fetchone()

        if not account_row:
            # Try finding by profile phone
            cursor.execute(
                """
                SELECT a.id, a.account_phone, a.timezone, a.is_active, a.is_admin, a.is_locked, a.tutor_name,
                       a.registration_source, a.referral_code, a.stripe_customer_id,
                       a.revenuecat_subscription_status, a.revenuecat_product_id, a.revenuecat_entitlement,
                       a.revenuecat_app_user_id, a.subscription_expires_at, a.created_at, a.updated_at,
                       a.signup_metadata, a.user_id, a.zip_code, a.attribution, a.referred_by_id
                FROM lms_accounts_account a
                JOIN lms_accounts_userprofile p ON p.account_id = a.id
                WHERE p.phone = %s
            """,
                (phone,),
            )
            account_row = cursor.fetchone()

        if not account_row:
            self.stdout.write(self.style.WARNING(f"No account found for {phone}"))
            return

        account_cols = [
            "id",
            "account_phone",
            "timezone",
            "is_active",
            "is_admin",
            "is_locked",
            "tutor_name",
            "registration_source",
            "referral_code",
            "stripe_customer_id",
            "revenuecat_subscription_status",
            "revenuecat_product_id",
            "revenuecat_entitlement",
            "revenuecat_app_user_id",
            "subscription_expires_at",
            "created_at",
            "updated_at",
            "signup_metadata",
            "user_id",
            "zip_code",
            "attribution",
            "referred_by_id",
        ]
        acc_data = dict(zip(account_cols, account_row))
        account_id = acc_data["id"]
        prod_user_id = acc_data["user_id"]

        self.stdout.write(f"Found account: {account_id}")

        # 2. Get user from production
        cursor.execute(
            """
            SELECT id, username, password, email, first_name, last_name, is_active, is_staff, is_superuser, date_joined
            FROM auth_user
            WHERE id = %s
        """,
            (prod_user_id,),
        )
        user_row = cursor.fetchone()
        user_cols = [
            "id",
            "username",
            "password",
            "email",
            "first_name",
            "last_name",
            "is_active",
            "is_staff",
            "is_superuser",
            "date_joined",
        ]
        user_data = dict(zip(user_cols, user_row)) if user_row else None

        with transaction.atomic():
            # 3. Create/update user
            if user_data:
                user, created = User.objects.update_or_create(
                    username=user_data["username"],
                    defaults={
                        "email": user_data["email"] or "",
                        "first_name": user_data["first_name"] or "",
                        "last_name": user_data["last_name"] or "",
                        "is_active": user_data["is_active"],
                        "is_staff": user_data["is_staff"],
                        "is_superuser": user_data["is_superuser"],
                        "password": user_data["password"],
                    },
                )
                self.stdout.write(f"  {'Created' if created else 'Updated'} user: {user.username}")
            else:
                # Create a placeholder user
                user, created = User.objects.get_or_create(
                    username=str(account_id),
                    defaults={"is_active": True},
                )
                self.stdout.write("  Created placeholder user for account")

            # 4. Create/update account
            account, created = Account.objects.update_or_create(
                id=account_id,
                defaults={
                    "user": user,
                    "account_phone": acc_data["account_phone"],
                    "timezone": acc_data["timezone"],
                    "is_active": acc_data["is_active"],
                    "is_admin": acc_data["is_admin"],
                    "is_locked": acc_data["is_locked"],
                    "tutor_name": acc_data["tutor_name"],
                    "registration_source": acc_data["registration_source"] or "web",
                    "referral_code": acc_data["referral_code"],
                    "stripe_customer_id": acc_data["stripe_customer_id"],
                    "revenuecat_subscription_status": acc_data["revenuecat_subscription_status"],
                    "revenuecat_product_id": acc_data["revenuecat_product_id"],
                    "revenuecat_entitlement": acc_data["revenuecat_entitlement"],
                    "revenuecat_app_user_id": acc_data["revenuecat_app_user_id"],
                    "subscription_expires_at": acc_data["subscription_expires_at"],
                    "signup_metadata": acc_data["signup_metadata"],
                    "zip_code": acc_data["zip_code"],
                    "attribution": acc_data["attribution"],
                },
            )
            self.stdout.write(f"  {'Created' if created else 'Updated'} account: {account.account_phone}")

            # 5. Sync profiles
            cursor.execute(
                """
                SELECT id, name, profile_type, email, phone, metadata, voice_id, classroom_canvas_blocks, created_at, updated_at, last_sms_read_time
                FROM lms_accounts_userprofile
                WHERE account_id = %s
            """,
                (account_id,),
            )
            profiles = [dict(zip([d[0] for d in cursor.description], row)) for row in cursor.fetchall()]

            for p_data in profiles:
                profile, created = UserProfile.objects.update_or_create(
                    id=p_data["id"],
                    defaults={
                        "account": account,
                        "name": p_data["name"],
                        "profile_type": p_data["profile_type"],
                        "email": p_data["email"],
                        "phone": p_data["phone"],
                        "metadata": p_data["metadata"] or "",
                        "voice_id": p_data["voice_id"],
                        "classroom_canvas_blocks": p_data["classroom_canvas_blocks"] or [],
                        "last_sms_read_time": p_data["last_sms_read_time"],
                    },
                )
                self.stdout.write(
                    f"    {'Created' if created else 'Updated'} profile: {p_data['name']} ({p_data['profile_type']})"
                )

            # 6. Sync entity
            cursor.execute(
                """
                SELECT id, name, description, model, reasoning_effort, timezone, adapters, max_messages,
                       sleep_until, time_offset, status, run_started_at, last_email_read_time, api_key, created_at, updated_at
                FROM entities_entity
                WHERE account_id = %s
            """,
                (account_id,),
            )
            entity_row = cursor.fetchone()

            if entity_row:
                ent_data = dict(zip([d[0] for d in cursor.description], entity_row))
                entity, created = Entity.objects.update_or_create(
                    id=ent_data["id"],
                    defaults={
                        "account": account,
                        "name": ent_data["name"],
                        "description": ent_data["description"],
                        "model": ent_data["model"],
                        "reasoning_effort": ent_data["reasoning_effort"],
                        "timezone": ent_data["timezone"],
                        "adapters": ent_data["adapters"],
                        "max_messages": ent_data["max_messages"],
                        "sleep_until": ent_data["sleep_until"],
                        "time_offset": ent_data["time_offset"],
                        "status": ent_data["status"],
                        "run_started_at": ent_data["run_started_at"],
                        "last_email_read_time": ent_data["last_email_read_time"],
                        "api_key": ent_data["api_key"],
                    },
                )
                self.stdout.write(
                    f"  {'Created' if created else 'Updated'} entity: {ent_data['name']} (ID: {ent_data['id']})"
                )

                # 7. Sync messages
                cursor.execute(
                    "SELECT id, message_data, timestamp, created_at FROM entities_message WHERE entity_id = %s",
                    (ent_data["id"],),
                )
                messages = [dict(zip([d[0] for d in cursor.description], row)) for row in cursor.fetchall()]
                for m in messages:
                    Message.objects.update_or_create(
                        id=m["id"],
                        defaults={
                            "entity": entity,
                            "message_data": m["message_data"],
                            "timestamp": m["timestamp"],
                        },
                    )
                self.stdout.write(f"    Synced {len(messages)} messages")

                # 8. Sync documents
                cursor.execute(
                    "SELECT id, title, content, created_at, updated_at FROM entities_document WHERE entity_id = %s",
                    (ent_data["id"],),
                )
                docs = [dict(zip([d[0] for d in cursor.description], row)) for row in cursor.fetchall()]
                for d in docs:
                    Document.objects.update_or_create(
                        id=d["id"],
                        defaults={
                            "entity": entity,
                            "title": d["title"],
                            "content": d["content"],
                        },
                    )
                self.stdout.write(f"    Synced {len(docs)} documents")

                # 9. Sync summaries
                summary_configs = [
                    (
                        "entities_fiveminutesummary",
                        FiveMinuteSummary,
                        ["date", "hour", "minute", "summary", "message_count"],
                    ),
                    ("entities_hourlysummary", HourlySummary, ["date", "hour", "summary", "message_count"]),
                    ("entities_dailysummary", DailySummary, ["date", "summary", "message_count"]),
                    ("entities_weeklysummary", WeeklySummary, ["week_start_date", "summary", "message_count"]),
                    ("entities_monthlysummary", MonthlySummary, ["year", "month", "summary", "message_count"]),
                ]

                for table, ModelClass, fields in summary_configs:
                    field_select = ", ".join(["id"] + fields)
                    cursor.execute(f"SELECT {field_select} FROM {table} WHERE entity_id = %s", (ent_data["id"],))
                    rows = [dict(zip([d[0] for d in cursor.description], row)) for row in cursor.fetchall()]
                    for r in rows:
                        defaults = {f: r[f] for f in fields}
                        defaults["entity"] = entity
                        ModelClass.objects.update_or_create(id=r["id"], defaults=defaults)
                    if rows:
                        self.stdout.write(f"    Synced {len(rows)} {ModelClass.__name__} records")

            # 10. Sync goals
            for p_data in profiles:
                cursor.execute(
                    """
                    SELECT id, title, objective, start_date, end_date, created_at
                    FROM lms_calendars_goal
                    WHERE user_profile_id = %s
                """,
                    (p_data["id"],),
                )
                goals = [dict(zip([d[0] for d in cursor.description], row)) for row in cursor.fetchall()]
                profile = UserProfile.objects.get(id=p_data["id"])
                for g in goals:
                    Goal.objects.update_or_create(
                        id=g["id"],
                        defaults={
                            "user_profile": profile,
                            "title": g["title"],
                            "objective": g["objective"],
                            "start_date": g["start_date"],
                            "end_date": g["end_date"],
                        },
                    )
                if goals:
                    self.stdout.write(f"    Synced {len(goals)} goals for {p_data['name']}")

            # 11. Sync sessions and annotations
            for p_data in profiles:
                cursor.execute(
                    """
                    SELECT id, room_name, recording_url, name, description, transcript, timestamped_summary,
                           audio_duration_seconds, session_started_at, session_ended_at, created_at, processed_at,
                           processing_error, leveling_assessment
                    FROM entities_session
                    WHERE profile_id = %s
                """,
                    (p_data["id"],),
                )
                sessions = [dict(zip([d[0] for d in cursor.description], row)) for row in cursor.fetchall()]
                profile = UserProfile.objects.get(id=p_data["id"])

                for s in sessions:
                    session, _ = Session.objects.update_or_create(
                        id=s["id"],
                        defaults={
                            "profile": profile,
                            "room_name": s["room_name"],
                            "recording_url": s["recording_url"],
                            "name": s["name"],
                            "description": s["description"],
                            "transcript": s["transcript"],
                            "timestamped_summary": s["timestamped_summary"],
                            "audio_duration_seconds": s["audio_duration_seconds"],
                            "session_started_at": s["session_started_at"],
                            "session_ended_at": s["session_ended_at"],
                            "processed_at": s["processed_at"],
                            "processing_error": s["processing_error"],
                            "leveling_assessment": s["leveling_assessment"],
                        },
                    )

                    # Sync annotations for this session
                    cursor.execute(
                        """
                        SELECT id, start_time, end_time, sentiment, category, severity, notes, created_by_id, created_at
                        FROM entities_annotation
                        WHERE session_id = %s
                    """,
                        (s["id"],),
                    )
                    annotations = [dict(zip([d[0] for d in cursor.description], row)) for row in cursor.fetchall()]
                    for a in annotations:
                        Annotation.objects.update_or_create(
                            id=a["id"],
                            defaults={
                                "session": session,
                                "start_time": a["start_time"],
                                "end_time": a["end_time"],
                                "sentiment": a["sentiment"],
                                "category": a["category"],
                                "severity": a["severity"],
                                "notes": a["notes"],
                            },
                        )

                if sessions:
                    self.stdout.write(f"    Synced {len(sessions)} sessions for {p_data['name']}")

            # 12. Sync SMS messages
            if include_sms:
                cursor.execute(
                    """
                    SELECT id, direction, from_number, to_number, body, created_at, twilio_sid,
                           price, price_unit, linq_message_id, linq_conversation_id
                    FROM sms_smsmessage
                    WHERE from_number = %s OR to_number = %s
                """,
                    (acc_data["account_phone"], acc_data["account_phone"]),
                )
                sms_messages = [dict(zip([d[0] for d in cursor.description], row)) for row in cursor.fetchall()]
                for sms in sms_messages:
                    SMSMessage.objects.update_or_create(
                        id=sms["id"],
                        defaults={
                            "direction": sms["direction"],
                            "from_number": sms["from_number"],
                            "to_number": sms["to_number"],
                            "body": sms["body"],
                            "twilio_sid": sms["twilio_sid"],
                            "price": sms["price"],
                            "price_unit": sms["price_unit"],
                            "linq_message_id": sms["linq_message_id"],
                            "linq_conversation_id": sms["linq_conversation_id"],
                        },
                    )
                self.stdout.write(f"    Synced {len(sms_messages)} SMS messages")

        self.stdout.write(self.style.SUCCESS(f"  Completed sync for {phone}"))
