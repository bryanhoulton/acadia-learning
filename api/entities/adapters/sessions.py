from entities.adapters import Adapter, Tool, format_duration, register_adapter
from entities.models import Session
from lms.accounts.models import UserProfile
from utils.timezone import format_datetime_for_llm


class ListSessionsTool(Tool):
    name = "list_sessions"
    description = """List sessions for a user profile or account with pagination and metadata.
    
    Returns session metadata (name, description, duration, dates, student profile).
    Use get_session_details to retrieve full transcript and timestamped summary.
    You can filter by user profile ID and control pagination with limit/offset.
    If no profile_id is provided, returns sessions from all profiles in the account.
    
    IMPORTANT: Each page refresh creates a new session. A single continuous work block may span
    multiple sessions if the student refreshes the page. Check multiple recent sessions to see
    the full context of a work session."""
    parameters = {
        "profile_id": {
            "type": ["string", "null"],
            "description": "Optional user profile ID to filter sessions. If not provided, returns sessions from all profiles in the account.",
        },
        "limit": {
            "type": "integer",
            "description": "Maximum number of sessions to return (default: 20, max: 100)",
        },
        "offset": {
            "type": "integer",
            "description": "Number of sessions to skip for pagination (default: 0)",
        },
    }

    def execute(self, runtime, parameters: dict):
        # Get the account from the entity
        account = runtime.entity.account
        if not account:
            return {"error": "No account associated with this entity"}

        # Set defaults and validate pagination parameters
        limit = parameters.get("limit", 20)
        offset = parameters.get("offset", 0)

        # Cap limit to max 100 to prevent excessive queries
        limit = min(int(limit), 100)
        limit = max(int(limit), 1)
        offset = max(int(offset), 0)

        # Start with sessions from all profiles in the account
        queryset = Session.objects.filter(profile__account=account).order_by("-created_at")

        # Filter by specific profile if provided
        profile_id = parameters.get("profile_id")
        if profile_id:
            # Verify the profile belongs to this account
            try:
                profile = UserProfile.objects.get(id=profile_id, account=account)
                queryset = queryset.filter(profile=profile)
            except UserProfile.DoesNotExist:
                return {"error": f"User profile {profile_id} not found in your account"}

        # Get total count before pagination
        total_count = queryset.count()

        # Apply pagination
        sessions = queryset[offset : offset + limit]

        # Build lightweight response with metadata only
        # Convert dates to entity timezone
        entity_timezone = runtime.entity.timezone or "UTC"
        serialized_sessions = [
            {
                "id": str(session.id),
                "room_name": session.room_name,
                "name": session.name,
                "description": session.description,
                "audio_duration_seconds": session.audio_duration_seconds,
                "session_started_at": format_datetime_for_llm(session.session_started_at, entity_timezone)
                if session.session_started_at
                else None,
                "session_ended_at": format_datetime_for_llm(session.session_ended_at, entity_timezone)
                if session.session_ended_at
                else None,
                "profile": str(session.profile.id) if session.profile else None,
                "profile_name": (session.profile.name or "Unnamed") if session.profile else None,
                "recording_url": session.recording_url,
                "created_at": format_datetime_for_llm(session.created_at, entity_timezone),
                "processed_at": format_datetime_for_llm(session.processed_at, entity_timezone)
                if session.processed_at
                else None,
                "processing_error": session.processing_error,
                "leveling_assessment": session.leveling_assessment,
            }
            for session in sessions
        ]

        return {
            "sessions": serialized_sessions,
            "pagination": {
                "limit": limit,
                "offset": offset,
                "total_count": total_count,
                "has_more": (offset + limit) < total_count,
            },
        }

    def format_result(self, result):
        if isinstance(result, dict):
            if "error" in result:
                return f"Error: {result['error']}"

            sessions = result.get("sessions", [])
            pagination = result.get("pagination", {})

            if not sessions:
                return "No sessions found."

            total = pagination.get("total_count", len(sessions))
            has_more = pagination.get("has_more", False)

            lines = [f"TUTORING SESSIONS ({len(sessions)} of {total})", "─" * 40]

            for session in sessions:
                session_id = session.get("id", "unknown")
                name = session.get("name") or "(unnamed session)"
                profile_name = session.get("profile_name") or "Unnamed"
                started = session.get("session_started_at", "")
                duration = session.get("audio_duration_seconds")
                description = session.get("description", "")

                lines.append(f"• {name}")
                lines.append(f"   session_id: {session_id}")
                lines.append(f"   Student: {profile_name}")
                if started:
                    lines.append(f"   Started: {started}")
                if duration:
                    lines.append(f"   Duration: {format_duration(duration)}")
                if description:
                    lines.append(f"   Summary: {description}")

                leveling_val = session.get("leveling_assessment")
                if leveling_val:
                    status = leveling_val.get("status", "unknown").replace("_", " ").title()
                    reasoning = leveling_val.get("reasoning", "")
                    if len(reasoning) > 100:
                        reasoning = reasoning[:97] + "..."
                    lines.append(f"   Leveling: {status} - {reasoning}")

                lines.append("")

            if has_more:
                lines.append(f"(Use offset={pagination.get('offset', 0) + pagination.get('limit', 20)} to see more)")

            return "\n".join(lines)

        return str(result)


class GetSessionDetailsTool(Tool):
    name = "get_session_details"
    description = "Get the full transcript and timestamped summary for a session. Use this only when you need detailed analysis of what happened in the session."
    parameters = {
        "session_id": {"type": "string", "description": "The ID of the session to retrieve"},
    }

    def execute(self, runtime, parameters: dict):
        account = runtime.entity.account
        if not account:
            return {"error": "No account associated with this entity"}

        try:
            session = Session.objects.get(id=parameters["session_id"], profile__account=account)
            return {
                "id": str(session.id),
                "name": session.name,
                "transcript": session.transcript,
                "timestamped_summary": session.timestamped_summary,
            }
        except Session.DoesNotExist:
            return {"error": f"Session {parameters['session_id']} not found in your account"}

    def format_result(self, result):
        if isinstance(result, dict):
            if "error" in result:
                return f"Error: {result['error']}"

            session_id = result.get("id", "unknown")
            name = result.get("name") or "(unnamed session)"
            transcript = result.get("transcript", "")
            summary = result.get("timestamped_summary", "")

            lines = [
                f"SESSION DETAILS: {name}",
                f"ID: {session_id}",
                "─" * 40,
            ]

            if summary:
                lines.append("\nTIMESTAMPED SUMMARY:")
                lines.append(summary)

            if transcript:
                lines.append("\nTRANSCRIPT:")
                lines.append(transcript)

            return "\n".join(lines)

        return str(result)


@register_adapter
class SessionsAdapter(Adapter):
    name = "sessions"
    description = """View tutoring sessions recorded for students in your account. List sessions returns metadata; use get_session_details for full transcripts.
    
    Note: Page refreshes create new sessions. A single work block may span multiple consecutive sessions,
    so review recent sessions together to get the full context."""
    tools = [ListSessionsTool(), GetSessionDetailsTool()]
