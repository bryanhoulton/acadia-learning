from datetime import timedelta
from typing import TYPE_CHECKING, Any

from django.utils import timezone

from utils.slack import SlackChannel, send_slack_message
from utils.timezone import parse_datetime_from_llm

from ..adapters import Adapter, Tool, register_adapter

if TYPE_CHECKING:
    pass


class GetVerificationCodesTool(Tool):
    """Tool for looking up recent verification codes for the account."""

    name = "get_verification_codes"
    description = """Look up recent verification codes for this account. Use this when the user is having 
    trouble receiving their verification code (SMS or email) - you can look up the code and share it with them directly.
    This is useful when SMS or email delivery is delayed or failing.
    
    The code you find can be entered by the user in the normal verification code input after they enter their phone number.
    Just share the VALID code with them and they can use it to sign in."""

    parameters = {}

    def execute(self, entity, parameters: dict[str, Any]) -> str:
        from lms.accounts.models import EmailVerificationCode

        account = entity.entity.account

        # Get verification codes from the last hour
        one_hour_ago = timezone.now() - timedelta(hours=1)
        codes = EmailVerificationCode.objects.filter(
            account=account,
            created_at__gte=one_hour_ago,
        ).order_by("-created_at")[:5]  # Limit to 5 most recent

        if not codes:
            return "No verification codes found for this account in the last hour. You can create one using the create_verification_code tool."

        # Format the results
        results = []
        for code in codes:
            status_parts = []
            if code.used_at:
                status_parts.append("USED")
            if code.is_expired():
                status_parts.append("EXPIRED")
            if code.is_valid():
                status_parts.append("VALID")

            status = ", ".join(status_parts) if status_parts else "UNKNOWN"
            created_str = code.created_at.strftime("%I:%M %p")
            results.append(f"- Code: {code.code} | Created: {created_str} | Status: {status}")

        return "Recent verification codes for this account:\n" + "\n".join(results)


class CreateVerificationCodeTool(Tool):
    """Tool for creating a new verification code for the account."""

    name = "create_verification_code"
    description = """Create a new verification code for this account. Use this when the user needs a fresh 
    verification code - for example, if all existing codes are expired or used, or if they never received one.
    
    This creates the code directly without sending SMS or email, so you can share it with the user immediately.
    The code can be entered in the normal verification code input after they enter their phone number."""

    parameters = {}

    def execute(self, entity, parameters: dict[str, Any]) -> str:
        import random

        from lms.accounts.models import EmailVerificationCode

        account = entity.entity.account

        # Generate a 6-digit code
        code = str(random.randint(100000, 999999))

        # Create the verification code record
        EmailVerificationCode.objects.create(account=account, code=code)

        return f"Created new verification code: {code}\n\nThis code is valid for 10 minutes. Share it with the user so they can enter it on the login screen after entering their phone number."


class SleepTool(Tool):
    name = "sleep"
    description = """Sleep until the specified time (in your timezone). Use this tool when you are finished doing
    what you need to or if you are repeating yourself."""
    parameters = {
        "until": {
            "type": "string",
            "description": "ISO format datetime string in your timezone, specifying when to wake up.",
        }
    }

    def execute(self, entity, parameters: dict[str, Any]) -> str:
        try:
            until_str: str | None = parameters.get("until")
            entity_timezone = entity.entity.timezone
            if not until_str:
                return "No sleep time provided"

            if entity.entity.has_unread_sms():
                return "You have unread SMS messages. Please read them before sleeping."

            # Convert from entity timezone to UTC for storage
            until_date = parse_datetime_from_llm(until_str, entity_timezone)
            entity.entity.sleep(until_date)

            return f"You will sleep until {until_str} ({entity_timezone})"
        except ValueError as e:
            # Sleep for 10 minutes
            entity.entity.sleep(timezone.now() + timedelta(minutes=10))
            send_slack_message(
                SlackChannel.ENTITY_ISSUES,
                f"[Entity {entity.entity.id}] Error setting sleep time: {str(e)}",
            )
            return f"Error setting sleep time: {str(e)}"


class ChangeTimezoneTool(Tool):
    name = "change_timezone"
    description = """Change your timezone setting to ensure accurate time handling. You should change
    your timezone to match the user's timezone."""

    parameters = {
        "timezone": {
            "type": "string",
            "description": "IANA timezone string (e.g., 'America/New_York', 'Europe/London', 'Asia/Tokyo')",
        }
    }

    def execute(self, entity, parameters: dict[str, Any]) -> str:
        try:
            timezone_str: str | None = parameters.get("timezone")
            if not timezone_str:
                return "No timezone provided"

            # Update the entity's timezone
            previous_timezone = entity.entity.timezone
            entity.entity.timezone = timezone_str
            entity.entity.save(update_fields=["timezone", "updated_at"])

            # Update the account's timezone
            entity.entity.account.timezone = timezone_str
            entity.entity.account.save(update_fields=["timezone", "updated_at"])

            return f"Timezone successfully changed from {previous_timezone} to {timezone_str}."
        except Exception as e:
            return f"Error changing timezone: {str(e)}"


class AskForHelpTool(Tool):
    """Tool for reporting issues to the support team."""

    name = "ask_for_help"
    description = "Ask for help from the support team, or report a bug."

    parameters = {
        "help": {
            "type": "string",
            "description": "The issue to report.",
        }
    }

    def execute(self, entity, parameters: dict[str, Any]) -> str:
        help = parameters.get("help")
        try:
            send_slack_message(
                SlackChannel.ENTITY_ISSUES,
                f"[Entity {entity.entity.id}] Asked for help: {help}",
            )
            return f"Message sent to support team: {help}"
        except Exception as e:
            return f"Failed to ask for help: {str(e)}"


@register_adapter
class SystemAdapter(Adapter):
    """Built-in system adapter."""

    name = "system"
    description = "System operations (sleep/wake scheduling, timezone management, etc)"
    tools = [
        SleepTool(),
        ChangeTimezoneTool(),
        AskForHelpTool(),
        GetVerificationCodesTool(),
        CreateVerificationCodeTool(),
    ]
