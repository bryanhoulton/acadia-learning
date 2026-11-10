"""
Treatment registry for PostHog experiments.

Each experiment has a flag_key that matches a PostHog feature flag.
Variants map to treatment configurations that can replace the default goals for a stage.
"""

from dataclasses import dataclass
from textwrap import dedent
from typing import Optional


@dataclass
class Treatment:
    """
    A treatment configuration for an experiment variant.
    Treatments influence agent behavior through Goals and Tasks only.

    - goals=None means "use default goals for this stage" (control behavior)
    - goals=[...] means "use these goals instead of defaults for this stage"
    """

    goals: Optional[list[dict]] = None  # None = use defaults, [...] = use these instead
    tasks: Optional[list[dict]] = None  # None = use defaults, [...] = use these instead


@dataclass
class FunnelStageExperiment:
    """
    One experiment per funnel stage.
    Each stage has ONE PostHog flag with multiple variants.
    PostHog assigns users to exactly one variant per stage.
    """

    flag_key: str  # PostHog feature flag name
    name: str
    description: str
    primary_metric: str  # PostHog event to measure
    variants: dict[str, Treatment]  # variant_name -> Treatment config


# =============================================================================
# DEFAULT GOALS BY FUNNEL STAGE
# Each stage has default goals that are used when the control variant is active.
# Experiments can replace these with treatment-specific goals.
# =============================================================================

DEFAULT_GOALS_BY_STAGE: dict[str, list[dict]] = {
    "signup_to_reply": [
        {
            "title": "Get them to engage",
            "objective": dedent("""
                Your first priority is getting them to reply and start a conversation.

                Be warm and welcoming. Ask an easy question they can answer.
                Don't overwhelm them with info - just get them talking by asking them a question.
            """).strip(),
            "start_day": 0,
            "duration_days": 2,
        },
    ],
    "reply_to_student": [
        {
            "title": "Get student info",
            "objective": dedent("""
                Now that they're engaged, get the student's info so we can set them up.

                You need:
                1. Student's name
                2. Grade level
                3. Subject they need help with

                Be friendly and make it easy. Once you have this, we can book a session.
            """).strip(),
            "start_day": 0,
            "duration_days": 3,
        },
    ],
    "student_to_session": [
        {
            "title": "Book and complete first session",
            "objective": dedent("""
                Now that you have the student info, help them schedule their first session.

                Be helpful and accommodating - find a time that works for their schedule.
                Mention that it's free, happens in an online classroom, and can be anytime.
                Don't pressure them - let them come to the decision naturally.
            """).strip(),
            "start_day": 0,
            "duration_days": 7,
        },
    ],
    "session_to_paid": [
        {
            "title": "Convert to paying customer",
            "objective": dedent("""
                After the first session, while the experience is fresh:
                - Follow up to get feedback ("How did it go? What did [student] think?")
                - Reinforce the value they just experienced
                - Make it easy to commit to regular sessions

                You may do up to 3 sessions without payment, but ask for them to commit
                after they've had a positive experience.
            """).strip(),
            "start_day": 0,
            "duration_days": 7,
        },
    ],
    "paid_to_thriving": [
        {
            "title": "Build a thriving customer",
            "objective": dedent("""
                A thriving customer is:
                - On a recurring schedule (weekly or bi-weekly sessions)
                - Seeing real results - the student is improving
                - Engaged and responsive - they reply, they show up, they're invested

                Your job is to build this rhythm. Check in on progress. Celebrate wins.
                Make sure they're getting consistent value from every session.
            """).strip(),
            "start_day": 7,
            "duration_days": 23,
        },
    ],
    "thriving_to_referral": [
        {
            "title": "Generate a referral",
            "objective": dedent("""
                Every satisfied family should lead to at least one more family.

                Only pursue this once they're genuinely happy and seeing results. Then:
                - Find natural moments to make sharing easy
                - Never be pushy - if it feels like a sales pitch, you've gone too far
            """).strip(),
            "start_day": 14,
            "duration_days": 46,
        },
    ],
}


def get_default_goals_for_stage(stage: str) -> list[dict]:
    """Get the default goal(s) for a funnel stage."""
    return DEFAULT_GOALS_BY_STAGE.get(stage, [])


# =============================================================================
# FUNNEL STAGE EXPERIMENTS
# Each experiment can replace the default goals for its stage.
# Control variant = use default goals (goals=None)
# Treatment variant = use custom goals instead (goals=[...])
# =============================================================================

FUNNEL_EXPERIMENTS: dict[str, FunnelStageExperiment] = {
    "signup_to_reply": FunnelStageExperiment(
        flag_key="signup-to-reply-exp",
        name="Signup to Reply",
        description="Get more signups to reply to the first message",
        primary_metric="first_sms_reply",
        variants={
            "control": Treatment(goals=None),  # Use DEFAULT_GOALS_BY_STAGE["signup_to_reply"]
            "value-first": Treatment(
                goals=[
                    {
                        "title": "Lead with value proposition",
                        "objective": dedent("""
                            In your FIRST message, lead with the cost and value:
                            - Mention $40/month explicitly
                            - Compare to traditional tutoring ($50-100/hour)
                            - Make it clear this is an incredible deal for unlimited 1-on-1 tutoring

                            Get them excited about the value and get them to reply by asking a question.
                        """).strip(),
                        "start_day": 0,
                        "duration_days": 2,
                    }
                ],
            ),
        },
    ),
    "reply_to_student": FunnelStageExperiment(
        flag_key="reply-to-student-exp",
        name="Reply to Student Profile",
        description="Get more people who replied to add a student profile",
        primary_metric="student_profile_created",
        variants={
            "control": Treatment(goals=None),  # Use DEFAULT_GOALS_BY_STAGE["reply_to_student"]
            "trust-building": Treatment(
                goals=[
                    {
                        "title": "Build trust before asking for student info",
                        "objective": dedent("""
                            Before asking for student details:
                            - Offer to share a testimonial from a real parent
                            - Acknowledge that trying something new is a leap of faith
                            - Reduce their perceived risk

                            Only after building some trust, ask for student name, grade, and subject.
                        """).strip(),
                        "start_day": 0,
                        "duration_days": 3,
                    }
                ],
            ),
            "human-option": Treatment(
                goals=[
                    {
                        "title": "Offer human contact option",
                        "objective": dedent("""
                            Early in the conversation, proactively offer:
                            "Would you like to talk to a real person? I can have someone call you."

                            If they say yes, let them know someone will reach out.
                            If they say no, proceed with getting student info.
                        """).strip(),
                        "start_day": 0,
                        "duration_days": 2,
                    }
                ],
            ),
        },
    ),
    "student_to_session": FunnelStageExperiment(
        flag_key="student-to-session-exp",
        name="Student to Session",
        description="Get more students to complete their first session",
        primary_metric="session_completed",
        variants={
            "control": Treatment(goals=None),  # Use DEFAULT_GOALS_BY_STAGE["student_to_session"]
            "48-hour-push": Treatment(
                goals=[
                    {
                        "title": "Book session within 48 hours - BE URGENT",
                        "objective": dedent("""
                            Push to book a session within 48 hours. Create urgency.

                            - "Let's get [student] started this week!"
                            - If they hesitate, address objections but keep pushing
                            - Get a specific day and time commitment
                            - Follow up aggressively if they don't confirm

                            Really emphasize how important it is to get started quickly and build
                            momentum. Learning gaps compound - the sooner they start, the less
                            behind they'll be.

                            The goal is a COMPLETED session within 48 hours, not just a booking.

                            Even if they schedule for later, see if they can do earlier.
                        """).strip(),
                        "start_day": 0,
                        "duration_days": 2,
                    }
                ],
            ),
            "close-and-followup": Treatment(
                goals=[
                    {
                        "title": "Book a specific time, send instructions, and follow up until session happens",
                        "objective": dedent("""
                            Most parents sign up when their kid is NOT there. Your job is to
                            bridge the gap between "parent is interested right now" and "kid
                            sits down at the computer later."

                            STEP 1 — GET A SPECIFIC TIME (not "next week", not "sometime"):
                            Ask: "What time does [student] usually get home from school?"
                            Then propose a specific session: "Let's do [day] at [time]."
                            Get them to confirm. If they say "next week" or are vague, pin it
                            down: "How about Monday at 5pm?"

                            STEP 2 — SEND CLEAR INSTRUCTIONS:
                            Once they commit to a time, immediately send:
                            "Have [student] go to app.acadialearning.org on [device - computer
                            is best]. They log in with this phone number and click Join Classroom.
                            I'll be there waiting!"
                            The parent needs to know EXACTLY what to tell their kid to do.

                            STEP 3 — SEND A REMINDER:
                            On the day of the committed session, text them 30-60 minutes before:
                            "Hey! [Student]'s session is today at [time]. Have them log in at
                            app.acadialearning.org when they're ready — I'll be there!"

                            STEP 4 — FOLLOW UP ON NO-SHOWS:
                            If they don't show up, text that evening:
                            "[Student] didn't make it today — no worries! Want to try
                            tomorrow at [same time]?"
                            If they go silent after ANY message, follow up once within 24 hours.

                            KEY RULES:
                            - Never accept vague timing. Always get a specific day + time.
                            - Always send the link (app.acadialearning.org) with instructions.
                            - Always send a reminder on the day of the session.
                            - Be warm and helpful, not pushy. You're helping them follow through
                              on something they already want to do.
                            - Most sessions happen 4-8pm on weekdays. Suggest times in that window.
                        """).strip(),
                        "start_day": 0,
                        "duration_days": 7,
                    }
                ],
            ),
        },
    ),
    "session_to_paid": FunnelStageExperiment(
        flag_key="session-to-paid-exp",
        name="Session to Paid",
        description="Convert users who had sessions into paying customers",
        primary_metric="subscription_created",
        variants={
            "control": Treatment(goals=None),  # Use DEFAULT_GOALS_BY_STAGE["session_to_paid"]
            "ask-after-first": Treatment(
                goals=[
                    {
                        "title": "Convert immediately after first session",
                        "objective": dedent("""
                            After the FIRST SUCCESSFUL session, ask directly if they want to continue.
                            Don't wait for multiple sessions. The first session is your chance.

                            - Follow up within hours, not days
                            - Make subscribing easy - send the link
                            - Emphasize the value they just experienced and how it can continue
                            - Sell the future and the plan you've made and all the progress you have set up for their student

                            The first session experience is fresh - strike while the iron is hot. You must not do more sessions
                            until they pay unless the session was clearly not successful.
                        """).strip(),
                        "start_day": 0,
                        "duration_days": 3,
                    }
                ],
            ),
        },
    ),
    # Note: paid_to_thriving and thriving_to_referral stages have goals but no experiments.
    # They always use DEFAULT_GOALS_BY_STAGE directly.
}


def get_all_experiments() -> dict[str, FunnelStageExperiment]:
    """Get all funnel stage experiments."""
    return FUNNEL_EXPERIMENTS


def get_treatment(funnel_stage: str, variant: str) -> Treatment:
    """Get treatment config for a funnel stage variant."""
    experiment = FUNNEL_EXPERIMENTS.get(funnel_stage)
    if not experiment:
        return Treatment()
    return experiment.variants.get(variant, Treatment())
