#!/usr/bin/env python
"""
Direct SQL script to sync account data from production to local database.
Bypasses Django ORM to avoid transaction/locking issues.

Usage:
    python scripts/sync_accounts.py +12025550110 +12025550111 +12025550112
"""

import os
import sys

import psycopg2
from psycopg2.extras import RealDictCursor

# Production database
PROD_DB_URL = os.environ["PROD_DATABASE_URL"]

# Local database
LOCAL_DB = {
    "host": os.environ.get("DB_HOST", "localhost"),
    "port": os.environ.get("DB_PORT", "5432"),
    "dbname": os.environ.get("DB_NAME", "postgres"),
    "user": os.environ.get("DB_USER", "postgres"),
    "password": os.environ.get("DB_PASSWORD", "postgres"),
}


def get_prod_conn():
    return psycopg2.connect(PROD_DB_URL, cursor_factory=RealDictCursor)


def get_local_conn():
    return psycopg2.connect(**LOCAL_DB)


def sync_account(phone: str):
    print(f"\n{'=' * 60}")
    print(f"Syncing: {phone}")
    print(f"{'=' * 60}")

    prod = get_prod_conn()
    local = get_local_conn()
    local.autocommit = False

    try:
        prod_cur = prod.cursor()
        local_cur = local.cursor()

        # 1. Get account from production
        prod_cur.execute(
            """
            SELECT * FROM lms_accounts_account WHERE account_phone = %s
        """,
            (phone,),
        )
        account = prod_cur.fetchone()

        if not account:
            print(f"  No account found for {phone}")
            return

        account_id = account["id"]
        user_id = account["user_id"]
        print(f"  Found account: {account_id}")

        # 2. Get user from production
        prod_cur.execute("SELECT * FROM auth_user WHERE id = %s", (user_id,))
        user = prod_cur.fetchone()

        if user:
            # Upsert user into local - use username as conflict target since it's unique
            local_cur.execute(
                """
                INSERT INTO auth_user (id, username, password, email, first_name, last_name, is_active, is_staff, is_superuser, date_joined, last_login)
                VALUES (%(id)s, %(username)s, %(password)s, %(email)s, %(first_name)s, %(last_name)s, %(is_active)s, %(is_staff)s, %(is_superuser)s, %(date_joined)s, %(last_login)s)
                ON CONFLICT (username) DO UPDATE SET
                    password = EXCLUDED.password,
                    email = EXCLUDED.email,
                    first_name = EXCLUDED.first_name,
                    last_name = EXCLUDED.last_name,
                    is_active = EXCLUDED.is_active,
                    is_staff = EXCLUDED.is_staff,
                    is_superuser = EXCLUDED.is_superuser
            """,
                dict(user),
            )
            print(f"  Synced user: {user['username']}")

        # 3. Upsert account into local - use account_phone as conflict target
        local_cur.execute(
            """
            INSERT INTO lms_accounts_account (id, user_id, account_phone, timezone, is_active, is_admin, is_locked, 
                tutor_name, registration_source, referral_code, stripe_customer_id, revenuecat_subscription_status,
                revenuecat_product_id, revenuecat_entitlement, revenuecat_app_user_id, subscription_expires_at,
                created_at, updated_at, signup_metadata, zip_code, attribution, referred_by_id)
            VALUES (%(id)s, %(user_id)s, %(account_phone)s, %(timezone)s, %(is_active)s, %(is_admin)s, %(is_locked)s,
                %(tutor_name)s, %(registration_source)s, %(referral_code)s, %(stripe_customer_id)s, %(revenuecat_subscription_status)s,
                %(revenuecat_product_id)s, %(revenuecat_entitlement)s, %(revenuecat_app_user_id)s, %(subscription_expires_at)s,
                %(created_at)s, %(updated_at)s, %(signup_metadata)s, %(zip_code)s, %(attribution)s, %(referred_by_id)s)
            ON CONFLICT (account_phone) DO UPDATE SET
                timezone = EXCLUDED.timezone,
                is_active = EXCLUDED.is_active,
                is_admin = EXCLUDED.is_admin,
                tutor_name = EXCLUDED.tutor_name,
                stripe_customer_id = EXCLUDED.stripe_customer_id,
                revenuecat_subscription_status = EXCLUDED.revenuecat_subscription_status,
                signup_metadata = EXCLUDED.signup_metadata
        """,
            dict(account),
        )
        print(f"  Synced account: {account['account_phone']}")

        # 4. Sync profiles
        prod_cur.execute("SELECT * FROM lms_accounts_userprofile WHERE account_id = %s", (account_id,))
        profiles = prod_cur.fetchall()

        for profile in profiles:
            local_cur.execute(
                """
                INSERT INTO lms_accounts_userprofile (id, name, profile_type, email, phone, account_id, created_at, 
                    metadata, updated_at, voice_id, classroom_canvas_blocks, last_sms_read_time)
                VALUES (%(id)s, %(name)s, %(profile_type)s, %(email)s, %(phone)s, %(account_id)s, %(created_at)s,
                    %(metadata)s, %(updated_at)s, %(voice_id)s, %(classroom_canvas_blocks)s, %(last_sms_read_time)s)
                ON CONFLICT (id) DO UPDATE SET
                    name = EXCLUDED.name,
                    profile_type = EXCLUDED.profile_type,
                    email = EXCLUDED.email,
                    phone = EXCLUDED.phone,
                    metadata = EXCLUDED.metadata,
                    voice_id = EXCLUDED.voice_id,
                    classroom_canvas_blocks = EXCLUDED.classroom_canvas_blocks
            """,
                dict(profile),
            )
        print(f"  Synced {len(profiles)} profiles")

        # 5. Sync entity
        prod_cur.execute("SELECT * FROM entities_entity WHERE account_id = %s", (account_id,))
        entity = prod_cur.fetchone()

        if entity:
            entity_id = entity["id"]
            local_cur.execute(
                """
                INSERT INTO entities_entity (id, name, description, model, reasoning_effort, created_at, updated_at,
                    adapters, sleep_until, time_offset, timezone, max_messages, status, run_started_at, 
                    last_email_read_time, account_id, api_key)
                VALUES (%(id)s, %(name)s, %(description)s, %(model)s, %(reasoning_effort)s, %(created_at)s, %(updated_at)s,
                    %(adapters)s, %(sleep_until)s, %(time_offset)s, %(timezone)s, %(max_messages)s, %(status)s, 
                    %(run_started_at)s, %(last_email_read_time)s, %(account_id)s, %(api_key)s)
                ON CONFLICT (id) DO UPDATE SET
                    name = EXCLUDED.name,
                    description = EXCLUDED.description,
                    model = EXCLUDED.model,
                    status = EXCLUDED.status,
                    timezone = EXCLUDED.timezone,
                    adapters = EXCLUDED.adapters
            """,
                dict(entity),
            )
            print(f"  Synced entity: {entity['name']} (ID: {entity_id})")

            # 6. Sync messages
            prod_cur.execute("SELECT * FROM entities_message WHERE entity_id = %s", (entity_id,))
            messages = prod_cur.fetchall()

            for msg in messages:
                local_cur.execute(
                    """
                    INSERT INTO entities_message (id, entity_id, message_data, timestamp, created_at)
                    VALUES (%(id)s, %(entity_id)s, %(message_data)s, %(timestamp)s, %(created_at)s)
                    ON CONFLICT (id) DO UPDATE SET message_data = EXCLUDED.message_data
                """,
                    dict(msg),
                )
            print(f"  Synced {len(messages)} messages")

            # 7. Sync documents
            prod_cur.execute("SELECT * FROM entities_document WHERE entity_id = %s", (entity_id,))
            documents = prod_cur.fetchall()

            for doc in documents:
                local_cur.execute(
                    """
                    INSERT INTO entities_document (id, entity_id, title, content, created_at, updated_at)
                    VALUES (%(id)s, %(entity_id)s, %(title)s, %(content)s, %(created_at)s, %(updated_at)s)
                    ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, content = EXCLUDED.content
                """,
                    dict(doc),
                )
            print(f"  Synced {len(documents)} documents")

            # 8. Sync summaries
            for table in [
                "entities_fiveminutesummary",
                "entities_hourlysummary",
                "entities_dailysummary",
                "entities_weeklysummary",
                "entities_monthlysummary",
            ]:
                prod_cur.execute(f"SELECT * FROM {table} WHERE entity_id = %s", (entity_id,))
                summaries = prod_cur.fetchall()

                for s in summaries:
                    cols = list(s.keys())
                    placeholders = ", ".join([f"%({c})s" for c in cols])
                    col_names = ", ".join(cols)
                    local_cur.execute(
                        f"""
                        INSERT INTO {table} ({col_names})
                        VALUES ({placeholders})
                        ON CONFLICT (id) DO UPDATE SET summary = EXCLUDED.summary, message_count = EXCLUDED.message_count
                    """,
                        dict(s),
                    )
                if summaries:
                    print(f"  Synced {len(summaries)} {table.replace('entities_', '')} records")

        # 9. Sync goals
        for profile in profiles:
            prod_cur.execute("SELECT * FROM lms_calendars_goal WHERE user_profile_id = %s", (profile["id"],))
            goals = prod_cur.fetchall()

            for goal in goals:
                local_cur.execute(
                    """
                    INSERT INTO lms_calendars_goal (id, title, objective, user_profile_id, start_date, end_date, 
                        created_at, updated_at, status, parent_goal_id)
                    VALUES (%(id)s, %(title)s, %(objective)s, %(user_profile_id)s, %(start_date)s, %(end_date)s,
                        %(created_at)s, %(updated_at)s, %(status)s, %(parent_goal_id)s)
                    ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, objective = EXCLUDED.objective
                """,
                    dict(goal),
                )
            if goals:
                print(f"  Synced {len(goals)} goals for {profile['name']}")

        # 10. Sync sessions
        for profile in profiles:
            prod_cur.execute("SELECT * FROM entities_session WHERE profile_id = %s", (profile["id"],))
            sessions = prod_cur.fetchall()

            for session in sessions:
                local_cur.execute(
                    """
                    INSERT INTO entities_session (id, room_name, profile_id, recording_url, name, description, 
                        transcript, timestamped_summary, audio_duration_seconds, session_started_at, session_ended_at,
                        created_at, processed_at, processing_error, leveling_assessment)
                    VALUES (%(id)s, %(room_name)s, %(profile_id)s, %(recording_url)s, %(name)s, %(description)s,
                        %(transcript)s, %(timestamped_summary)s, %(audio_duration_seconds)s, %(session_started_at)s, 
                        %(session_ended_at)s, %(created_at)s, %(processed_at)s, %(processing_error)s, %(leveling_assessment)s)
                    ON CONFLICT (id) DO UPDATE SET 
                        name = EXCLUDED.name, 
                        description = EXCLUDED.description,
                        transcript = EXCLUDED.transcript
                """,
                    dict(session),
                )

                # Sync annotations
                prod_cur.execute("SELECT * FROM entities_annotation WHERE session_id = %s", (session["id"],))
                annotations = prod_cur.fetchall()
                for ann in annotations:
                    local_cur.execute(
                        """
                        INSERT INTO entities_annotation (id, session_id, start_time, end_time, sentiment, category, 
                            severity, notes, created_by_id, created_at)
                        VALUES (%(id)s, %(session_id)s, %(start_time)s, %(end_time)s, %(sentiment)s, %(category)s,
                            %(severity)s, %(notes)s, %(created_by_id)s, %(created_at)s)
                        ON CONFLICT (id) DO UPDATE SET notes = EXCLUDED.notes
                    """,
                        dict(ann),
                    )

            if sessions:
                print(f"  Synced {len(sessions)} sessions for {profile['name']}")

        # 11. Sync SMS messages
        prod_cur.execute(
            "SELECT * FROM sms_smsmessage WHERE from_number = %s OR to_number = %s",
            (account["account_phone"], account["account_phone"]),
        )
        sms_messages = prod_cur.fetchall()

        for sms in sms_messages:
            local_cur.execute(
                """
                INSERT INTO sms_smsmessage (id, direction, from_number, to_number, body, created_at, twilio_sid,
                    price, price_unit, linq_message_id, linq_conversation_id)
                VALUES (%(id)s, %(direction)s, %(from_number)s, %(to_number)s, %(body)s, %(created_at)s, %(twilio_sid)s,
                    %(price)s, %(price_unit)s, %(linq_message_id)s, %(linq_conversation_id)s)
                ON CONFLICT (id) DO UPDATE SET body = EXCLUDED.body
            """,
                dict(sms),
            )
        print(f"  Synced {len(sms_messages)} SMS messages")

        local.commit()
        print(f"  ✓ Completed sync for {phone}")

    except Exception as e:
        local.rollback()
        print(f"  ✗ Error syncing {phone}: {e}")
        raise
    finally:
        prod.close()
        local.close()


if __name__ == "__main__":
    phones = sys.argv[1:]
    if not phones:
        raise SystemExit("Supply one or more account phone numbers.")

    print("Starting sync...")
    for phone in phones:
        sync_account(phone)

    print("\n" + "=" * 60)
    print("Sync complete!")
