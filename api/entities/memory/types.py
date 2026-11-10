from enum import Enum
from textwrap import dedent

from pydantic import BaseModel


class PeriodType(Enum):
    FIVE_MINUTE = "five_minute"
    HOURLY = "hourly"
    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"


# Resolution levels for filtering - higher number = coarser granularity
RESOLUTION_LEVELS: dict[PeriodType, int] = {
    PeriodType.FIVE_MINUTE: 0,
    PeriodType.HOURLY: 1,
    PeriodType.DAILY: 2,
    PeriodType.WEEKLY: 3,
    PeriodType.MONTHLY: 4,
}


class PeriodMeta(BaseModel):
    max_length: str
    focus: str
    time_period: str
    example: str


PERIOD_META: dict[PeriodType, PeriodMeta] = {
    PeriodType.FIVE_MINUTE: PeriodMeta(
        max_length="2 sentences",
        focus=dedent(
            """
            What happened in these five minutes? Key things to preserve:
            - Student info if mentioned (grade, course)
            - SPECIFIC content level/difficulty (e.g., "factoring quadratics with leading coefficient 1", "3-digit by 2-digit multiplication", "basic substitution vs. complex systems")
            - HOW the student performed on that specific content: precise mastery levels (mastered/proficient/needs-prompting/struggling)
            - Concrete errors (the actual mistake, not just "struggled")
            - Behavioral observations (self-corrects, engagement patterns, preferences)
            - Environmental context (joined/left call, changed activity)
            """
        ),
        time_period="these five minutes",
        example="Illustrative example omitted.",
    ),
    PeriodType.HOURLY: PeriodMeta(
        max_length="2-4 sentences",
        focus=dedent(
            """
            What happened this hour? Preserve these details:
            - Student metadata (grade, courses, session times)
            - SPECIFIC content level for each topic (e.g., "2-step equations with fractions", "systems with substitution method vs. elimination", "polynomial division with remainders")
            - HOW the student performed on each specific content level: precise skill mastery (mastered/proficient/needs-prompting/struggling)
            - Concrete error examples (the actual mistakes, not just "struggled")
            - Behavioral patterns (how they learn, self-correct, engage)
            - Track progression: if skill improved during the hour, note the change from beginning to end
            """
        ),
        time_period="this hour",
        example="Illustrative example omitted.",
    ),
    PeriodType.DAILY: PeriodMeta(
        max_length="4-6 sentences",
        focus=dedent(
            """
            What happened today? Essential information to preserve:
            - Student profile (grade, courses enrolled)
            - SPECIFIC content levels practiced (e.g., "factoring a=1 quadratics", "word problems requiring 2-step equations", "basic vs. complex fraction operations")
            - HOW the student performed on each content level: precise mastery (mastered/proficient/needs-prompting/struggling)
            - Concrete errors and how resolved (include the actual mistake and level of support needed)
            - Behavioral patterns and learning style observations
            - Session logistics (length, times, who communicated)
            - Changes from before: if student improved on something they previously struggled with, highlight the progression with specific content level
            """
        ),
        time_period="today",
        example="Illustrative example omitted.",
    ),
    PeriodType.WEEKLY: PeriodMeta(
        max_length="6-8 sentences",
        focus=dedent(
            """
            Summarize the week. Include student profile and track progression:
            - Student context (grade, courses, schedule)
            - SPECIFIC content levels worked on (e.g., "a=1 quadratic factoring vs. a≠1", "basic 1-step equations vs. multi-step with distribution")
            - Skill progression on each content level: what changed this week? (before→now transitions with specific mastery levels)
            - HOW the student performed on different content levels: distinguish between mastered, proficient, needs-prompting, struggling
            - Concrete error patterns: specific mistakes on specific content, whether improving/resolved/persisting
            - Behavioral patterns across sessions
            - Notable events or changes
            
            Be specific about progression—if student improved, say what they used to do vs what they do now on which specific content.
            If a previous pattern changed, acknowledge the old pattern and state the new reality with content detail.
            """
        ),
        time_period="this week",
        example="Illustrative example omitted.",
    ),
    PeriodType.MONTHLY: PeriodMeta(
        max_length="8-10 sentences",
        focus=dedent(
            """
            Comprehensive monthly summary. Essential information:
            - Complete student profile: grade, courses, recurring schedule (times & subjects)
            - SPECIFIC content levels worked on throughout the month (e.g., "a=1 quadratics", "multi-step equations with fractions", "word problems with linear systems")
            - Skill inventory for each content level: current mastery status (mastered/proficient/needs-prompting/struggling) with progression (before→now)
            - HOW the student performed on different content levels: distinguish clearly between what they've mastered vs. still developing
            - Error patterns on specific content: concrete mistakes made, which resolved vs which persist, with examples at the content level
            - Behavioral evolution: how student's learning patterns, preferences, habits have changed
            - Significant milestones: breakthroughs on specific content, regressions, pattern shifts
            - Schedule/logistics: session times, any changes to frequency or format
            
            Focus on CHANGE with content specificity: if something was true before but isn't now, make that clear with the specific content level.
            Be willing to update past assessments—if student mastered something they struggled with, celebrate that progression with detail about what content they can now handle.
            """
        ),
        time_period="this month",
        example="Illustrative example omitted.",
    ),
}
