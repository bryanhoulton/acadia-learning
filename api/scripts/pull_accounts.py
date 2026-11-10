#!/usr/bin/env python
"""
Pull account data from production and save to JSON file.

Usage:
    python scripts/pull_accounts.py +12025550110 +12025550111 +12025550112
"""

import json
import os
import sys
from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

import psycopg2
from psycopg2.extras import RealDictCursor

PROD_DB_URL = os.environ["PROD_DATABASE_URL"]
OUTPUT_FILE = "scripts/account_data.json"


def json_serializer(obj):
    """Custom JSON serializer for objects not serializable by default."""
    if isinstance(obj, (datetime, date)):
        return obj.isoformat()
    if isinstance(obj, UUID):
        return str(obj)
    if isinstance(obj, Decimal):
        return float(obj)
    if isinstance(obj, bytes):
        return obj.decode("utf-8", errors="replace")
    raise TypeError(f"Object of type {type(obj)} is not JSON serializable")


def pull_account(cursor, phone: str) -> dict | None:
    print(f"\n{'=' * 60}")
    print(f"Pulling: {phone}")
    print(f"{'=' * 60}")

    # 1. Get account
    cursor.execute("SELECT * FROM lms_accounts_account WHERE account_phone = %s", (phone,))
    account = cursor.fetchone()

    if not account:
        print(f"  No account found for {phone}")
        return None

    account_id = account["id"]
    user_id = account["user_id"]
    print(f"  Found account: {account_id}")

    # 2. Get user
    cursor.execute("SELECT * FROM auth_user WHERE id = %s", (user_id,))
    user = cursor.fetchone()
    print(f"  Found user: {user['username'] if user else 'None'}")

    # 3. Get profiles
    cursor.execute("SELECT * FROM lms_accounts_userprofile WHERE account_id = %s", (account_id,))
    profiles = cursor.fetchall()
    print(f"  Found {len(profiles)} profiles")

    # 4. Get entity
    cursor.execute("SELECT * FROM entities_entity WHERE account_id = %s", (account_id,))
    entity = cursor.fetchone()
    entity_id = entity["id"] if entity else None
    print(f"  Found entity: {entity_id}")

    # 5. Get messages
    messages = []
    if entity_id:
        cursor.execute("SELECT * FROM entities_message WHERE entity_id = %s", (entity_id,))
        messages = cursor.fetchall()
        print(f"  Found {len(messages)} messages")

    # 6. Get documents
    documents = []
    if entity_id:
        cursor.execute("SELECT * FROM entities_document WHERE entity_id = %s", (entity_id,))
        documents = cursor.fetchall()
        print(f"  Found {len(documents)} documents")

    # 7. Get summaries
    summaries = {}
    if entity_id:
        for table in [
            "entities_fiveminutesummary",
            "entities_hourlysummary",
            "entities_dailysummary",
            "entities_weeklysummary",
            "entities_monthlysummary",
        ]:
            cursor.execute(f"SELECT * FROM {table} WHERE entity_id = %s", (entity_id,))
            summaries[table] = cursor.fetchall()
            if summaries[table]:
                print(f"  Found {len(summaries[table])} {table.replace('entities_', '')} records")

    # 8. Get goals
    goals = []
    for profile in profiles:
        cursor.execute("SELECT * FROM lms_calendars_goal WHERE user_profile_id = %s", (profile["id"],))
        profile_goals = cursor.fetchall()
        goals.extend(profile_goals)
    if goals:
        print(f"  Found {len(goals)} goals")

    # 9. Get sessions and annotations
    sessions = []
    annotations = []
    for profile in profiles:
        cursor.execute("SELECT * FROM entities_session WHERE profile_id = %s", (profile["id"],))
        profile_sessions = cursor.fetchall()
        sessions.extend(profile_sessions)

        for session in profile_sessions:
            cursor.execute("SELECT * FROM entities_annotation WHERE session_id = %s", (session["id"],))
            session_annotations = cursor.fetchall()
            annotations.extend(session_annotations)

    if sessions:
        print(f"  Found {len(sessions)} sessions")
    if annotations:
        print(f"  Found {len(annotations)} annotations")

    # 10. Get SMS messages
    cursor.execute(
        "SELECT * FROM sms_smsmessage WHERE from_number = %s OR to_number = %s",
        (account["account_phone"], account["account_phone"]),
    )
    sms_messages = cursor.fetchall()
    print(f"  Found {len(sms_messages)} SMS messages")

    return {
        "phone": phone,
        "user": dict(user) if user else None,
        "account": dict(account),
        "profiles": [dict(p) for p in profiles],
        "entity": dict(entity) if entity else None,
        "messages": [dict(m) for m in messages],
        "documents": [dict(d) for d in documents],
        "summaries": {k: [dict(s) for s in v] for k, v in summaries.items()},
        "goals": [dict(g) for g in goals],
        "sessions": [dict(s) for s in sessions],
        "annotations": [dict(a) for a in annotations],
        "sms_messages": [dict(s) for s in sms_messages],
    }


def main():
    phones = sys.argv[1:]
    if not phones:
        raise SystemExit("Supply one or more account phone numbers.")

    print("Connecting to production database...")
    conn = psycopg2.connect(PROD_DB_URL, cursor_factory=RealDictCursor)
    cursor = conn.cursor()

    all_data = []
    for phone in phones:
        data = pull_account(cursor, phone)
        if data:
            all_data.append(data)

    cursor.close()
    conn.close()

    # Save to file
    print(f"\nSaving to {OUTPUT_FILE}...")
    with open(OUTPUT_FILE, "w") as f:
        json.dump(all_data, f, default=json_serializer, indent=2)

    print(f"✓ Saved {len(all_data)} accounts to {OUTPUT_FILE}")

    # Print summary
    total_messages = sum(len(d["messages"]) for d in all_data)
    total_docs = sum(len(d["documents"]) for d in all_data)
    total_sms = sum(len(d["sms_messages"]) for d in all_data)
    print("\nSummary:")
    print(f"  - {len(all_data)} accounts")
    print(f"  - {total_messages} messages")
    print(f"  - {total_docs} documents")
    print(f"  - {total_sms} SMS messages")


if __name__ == "__main__":
    main()
