from entities.adapters import Tool
from lms.accounts.models import ReportCard, UserProfile
from lms.accounts.serializers import AccountSerializer, ReportCardSerializer, UserProfileSerializer


class ShowAccountTool(Tool):
    name = "show_account"
    description = """Show the account in LMS. Includes timezone information, user profiles, etc.
    If stripe_customer_id is not set, the account is not a paid account."""
    parameters = {}

    def execute(self, runtime, parameters: dict):
        account = runtime.entity.account
        if not account:
            return "No LMS account is attached to you."
        return AccountSerializer(account).data

    def format_result(self, result):
        if isinstance(result, str):
            return result

        if isinstance(result, dict):
            lines = ["ACCOUNT DETAILS", "─" * 40]

            # Basic info
            if result.get("id"):
                lines.append(f"ID: {result['id']}")
            if result.get("timezone"):
                lines.append(f"Timezone: {result['timezone']}")
            # Account status from Stripe/RevenueCat
            account_status = result.get("account_status", "free")
            stripe_status = result.get("stripe_subscription_status")
            if account_status == "paid":
                status_line = "Status: Paid account"
                if stripe_status:
                    status_line += f" (Stripe: {stripe_status})"
                lines.append(status_line)
            elif account_status == "delinquent":
                status_line = "Status: Delinquent account"
                if stripe_status:
                    status_line += f" (Stripe: {stripe_status})"
                lines.append(status_line)
            else:
                lines.append("Status: Free account")

            # Referral link (exclude the code itself)
            if result.get("referral_link"):
                lines.append(f"Referral Link: {result['referral_link']}")

            # User profiles
            profiles = result.get("profiles", [])
            if profiles:
                lines.append(f"\nUSER PROFILES ({len(profiles)}):")
                for profile in profiles:
                    # Indent the profile output for nested display
                    formatted = _format_profile(profile)
                    # Add extra indent for nested display under account
                    indented = "\n".join("  " + line for line in formatted.split("\n"))
                    lines.append(indented)

            return "\n".join(lines)

        return str(result)


def _format_profile(profile: dict) -> str:
    """Format a single user profile for display."""
    profile_id = str(profile.get("id", "unknown"))
    name = profile.get("name") or "Unnamed"
    profile_type = profile.get("profile_type", "unknown")
    phone = profile.get("phone", "")
    email = profile.get("email", "")
    metadata = profile.get("metadata", "")

    lines = [f"• {name} ({profile_type})"]
    lines.append(f"   user_profile_id: {profile_id}")
    if phone:
        lines.append(f"   Phone: {phone}")
    if email:
        lines.append(f"   Email: {email}")
    if metadata:
        lines.append(f"   Notes: {metadata}")
    return "\n".join(lines)


class CreateUserProfileTool(Tool):
    name = "create_user_profile"
    description = "Create a new user profile for the account."
    parameters = {
        "profile_type": {"type": "string", "description": "The type of the profile (parent or student)"},
        "name": {"type": "string", "description": "The name of the profile"},
    }

    def execute(self, runtime, parameters: dict):
        user_profile = UserProfile.objects.create(
            profile_type=parameters["profile_type"],
            name=parameters["name"],
            account=runtime.entity.account,
        )
        return UserProfileSerializer(user_profile).data

    def format_result(self, result):
        if isinstance(result, dict):
            return f"Profile created:\n{_format_profile(result)}"
        return str(result)


class UpdateProfileTool(Tool):
    name = "update_profile"
    description = """Update the profile of the account.
    
    METADATA INSTRUCTIONS:
    Use the metadata field to store important information about the student that should be remembered
    for future sessions, particularly their recurring schedule.
    
    For student profiles, you should:
    1. Ask the student about their recurring availability/schedule (e.g., "What days/times work best for you?")
    2. If a clear pattern emerges from multiple sessions, store it in metadata
    3. Format recurring schedules clearly, e.g.: "Available: Mon/Wed/Fri 4-5pm EST, Sat 10am-12pm EST"
    4. Include any other relevant notes like timezone, preferred session duration, learning preferences
    
    Example metadata for a student:
    "Available: Tue/Thu 3-4pm PST, Sat 10-11am PST | Prefers 30-45min sessions | Timezone: PST"
    
    This allows future sessions to quickly understand the student's availability without asking again."""
    parameters = {
        "profile_id": {"type": "string", "description": "The ID of the profile to update"},
        "metadata": {
            "type": ["string", "null"],
            "description": "The metadata of the profile. For students, include recurring schedule/availability and other session preferences. Pass null to leave unchanged.",
        },
        "phone_number": {
            "type": ["string", "null"],
            "description": "The phone number of the profile. Should be in E.164 format (+1234567890). Pass null to leave unchanged.",
        },
        "email": {"type": ["string", "null"], "description": "The email of the profile. Pass null to leave unchanged."},
    }

    def execute(self, runtime, parameters: dict):
        profile = UserProfile.objects.get(id=parameters["profile_id"], account=runtime.entity.account)
        # Only update fields that have non-None values (null means "no change")
        if parameters.get("metadata") is not None:
            profile.metadata = parameters["metadata"]
        if parameters.get("phone_number") is not None:
            profile.phone = parameters["phone_number"]
        if parameters.get("email") is not None:
            profile.email = parameters["email"]
        profile.save()
        return UserProfileSerializer(profile).data

    def format_result(self, result):
        if isinstance(result, dict):
            return f"Profile updated:\n{_format_profile(result)}"
        return str(result)


class DeleteUserProfileTool(Tool):
    name = "delete_user_profile"
    description = "Delete a user profile for the account."
    parameters = {
        "profile_id": {"type": "string", "description": "The ID of the profile to delete"},
    }

    def execute(self, runtime, parameters: dict):
        profile = UserProfile.objects.get(id=parameters["profile_id"], account=runtime.entity.account)
        profile.delete()
        return "User profile deleted successfully"


class CreateReportCardTool(Tool):
    name = "create_report_card"
    description = "Create a report card for the account."
    pydantic = ReportCard.Pydantic.model_json_schema()

    def execute(self, runtime, parameters: dict):
        report_card = ReportCard.from_pydantic(
            ReportCard.Pydantic(
                user_profile_id=parameters["user_profile_id"],
                session_date=parameters["session_date"],
                session_duration_minutes=parameters["session_duration_minutes"],
                immediate_action_items=parameters["immediate_action_items"],
                skill_assessments=parameters["skill_assessments"],
                recommended_course_name=parameters["recommended_course_name"],
                recommended_course_description=parameters["recommended_course_description"],
                recommended_course_duration_weeks=parameters["recommended_course_duration_weeks"],
                recommended_course_objectives=parameters["recommended_course_objectives"],
                tutor_notes=parameters["tutor_notes"],
            )
        )
        report_card.user_profile = UserProfile.objects.get(id=parameters["user_profile_id"])
        report_card.save()
        return ReportCardSerializer(report_card).data

    def format_result(self, result):
        if isinstance(result, dict):
            return f"Report card created for session on {result.get('session_date', 'unknown date')}."
        return str(result)


def _format_report_card(card: dict) -> str:
    """Format a single report card for display."""
    lines = []
    card_id = str(card.get("id", "unknown"))
    session_date = card.get("session_date", "unknown")
    duration = card.get("session_duration_minutes", 0)

    lines.append(f"• Session: {session_date} ({duration} min)")
    lines.append(f"   report_card_id: {card_id}")

    # Skill assessments
    skills = card.get("skill_assessments", [])
    if skills:
        lines.append("   Skills:")
        for skill in skills:
            name = skill.get("skill_name", "unknown")
            level = skill.get("proficiency_level", "unknown")
            lines.append(f"      - {name}: {level}")

    # Action items
    actions = card.get("immediate_action_items", [])
    if actions:
        lines.append("   Action Items:")
        for action in actions:
            lines.append(f"      - {action}")

    # Tutor notes
    notes = card.get("tutor_notes", "")
    if notes:
        lines.append(f"   Notes: {notes}")

    return "\n".join(lines)


class ListReportCardsTool(Tool):
    name = "list_report_cards"
    description = "List all report cards for the account."
    parameters = {
        "user_profile_id": {"type": "string", "description": "The ID of the user profile to list the report cards for"},
    }

    def execute(self, runtime, parameters: dict):
        report_cards = ReportCard.objects.filter(user_profile__account=runtime.entity.account)
        if parameters["user_profile_id"]:
            report_cards = report_cards.filter(user_profile__id=parameters["user_profile_id"])
        return ReportCardSerializer(report_cards, many=True).data

    def format_result(self, result):
        if isinstance(result, list):
            if not result:
                return "No report cards found."

            lines = [f"REPORT CARDS ({len(result)} found)", "─" * 40]
            for card in result:
                lines.append(_format_report_card(card))
                lines.append("")
            return "\n".join(lines)

        return str(result)


class DeleteReportCardTool(Tool):
    name = "delete_report_card"
    description = "Delete a report card for the account."
    parameters = {
        "report_card_id": {"type": "string", "description": "The ID of the report card to delete"},
    }

    def execute(self, runtime, parameters: dict):
        report_card = ReportCard.objects.get(id=parameters["report_card_id"])
        report_card.delete()
