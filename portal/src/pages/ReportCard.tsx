import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

import { useValues } from "kea";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  Calendar,
  CheckCircle2,
  Clock,
  FileText,
  Star,
  Target,
} from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { Badge, Button } from "slate-ui";
import { toast } from "sonner";

import LoadingState from "../components/LoadingState";
import { authLogic } from "../logic/authLogic";
import type { ReportCard as ReportCardType } from "../types";
import { components } from "../types/api";
import client from "../utils/api";

type PriorityLevel = components["schemas"]["PriorityEnum"];
type SkillLevel = components["schemas"]["SkillLevelEnum"];

const priorityTokens: Record<PriorityLevel, { label: string; tone: string }> = {
  high: {
    label: "High Priority",
    tone: "bg-rose-100 text-rose-700 border-rose-200",
  },
  medium: {
    label: "Medium Priority",
    tone: "bg-amber-100 text-amber-700 border-amber-200",
  },
  low: {
    label: "Low Priority",
    tone: "bg-sky-100 text-sky-700 border-sky-200",
  },
};

const masteryTokens: Record<SkillLevel, { label: string; tone: string }> = {
  automatic: {
    label: "Automatic",
    tone: "bg-emerald-100 text-emerald-700 border-emerald-200",
  },
  mastered: {
    label: "Mastered",
    tone: "bg-emerald-100 text-emerald-700 border-emerald-200",
  },
  reinforcing: {
    label: "Reinforcing",
    tone: "bg-amber-100 text-amber-700 border-amber-200",
  },
  learning: {
    label: "Learning",
    tone: "bg-sky-100 text-sky-700 border-sky-200",
  },
  untouched: {
    label: "Not Started",
    tone: "bg-slate-100 text-slate-700 border-slate-200",
  },
};

const emptyStateCopy = {
  title: "Report Not Found",
  description:
    "The report card you were sent may have expired or is no longer available.",
};

interface MetricCardProps {
  icon: LucideIcon;
  label: string;
  value: string;
}

function MetricCard({ icon: Icon, label, value }: MetricCardProps) {
  return (
    <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-100/40 px-4 py-3">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
          {label}
        </dt>
        <dd className="truncate text-base font-semibold text-slate-900">
          {value}
        </dd>
      </div>
    </div>
  );
}

interface SectionCardProps {
  id: string;
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  description?: string;
  iconToneClass: string;
  children: ReactNode;
}

function SectionCard({
  id,
  icon: Icon,
  eyebrow,
  title,
  description,
  iconToneClass,
  children,
}: SectionCardProps) {
  return (
    <section
      aria-labelledby={id}
      className="rounded-3xl md:border border-slate-200 md:bg-white md:shadow-sm"
    >
      <header className="md:border-b border-slate-200 px-5 py-4">
        <div className="flex items-center gap-3">
          <span
            className={`flex h-10 w-10 items-center justify-center rounded-xl ${iconToneClass}`}
          >
            <Icon className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              {eyebrow}
            </p>
            <p id={id} className="text-lg font-semibold text-slate-900">
              {title}
            </p>
          </div>
        </div>
        {description ? (
          <p className="mt-3 text-sm leading-6 text-slate-600">{description}</p>
        ) : null}
      </header>
      <div className="px-5 py-5 pt-0 md:pt-5">{children}</div>
    </section>
  );
}

function TonePill({ tone, children }: { tone: string; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-2 w-fit rounded-full border px-2.5 py-1 text-xs font-semibold ${tone}`}
    >
      <span
        className="h-2 w-2 rounded-full bg-current opacity-60"
        aria-hidden="true"
      />
      {children}
    </span>
  );
}

export function ReportCard() {
  const { id } = useParams<{ id: string }>();
  const [reportCard, setReportCard] = useState<ReportCardType | null>(null);
  const [loading, setLoading] = useState(true);
  const { account } = useValues(authLogic);
  const navigate = useNavigate();

  useEffect(() => {
    async function fetchReportCard() {
      if (!id) return;

      setLoading(true);
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const { data, error } = await client.GET(
        "/api/lms/accounts/report-cards/{uuid}/",
        {
          params: { path: { uuid: id } },
        }
      );

      if (error) {
        toast.error("Failed to load report card");
        console.error(error);
        setLoading(false);
        return;
      }

      setReportCard(data);
      setLoading(false);
    }

    fetchReportCard();
  }, [id]);

  const sessionDate = useMemo(() => {
    if (!reportCard) return "";
    // Append T00:00:00 to parse as local time, not UTC
    return new Date(`${reportCard.session_date}T00:00:00`).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }, [reportCard]);

  const metrics = useMemo(
    () =>
      reportCard
        ? [
            {
              id: "session-date",
              label: "Session Date",
              value: sessionDate,
              icon: Calendar,
            },
            {
              id: "session-length",
              label: "Session Length",
              value: `${reportCard.session_duration_minutes} minutes`,
              icon: Clock,
            },
          ]
        : [],
    [reportCard, sessionDate]
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto flex h-dvh max-w-md items-center justify-center px-6">
          <LoadingState message="Loading report card..." className="w-full" />
        </div>
      </div>
    );
  }

  if (!reportCard) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto flex h-dvh max-w-sm items-center justify-center px-6">
          <div className="w-full rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-500">
              <FileText className="h-7 w-7" aria-hidden="true" />
            </div>
            <h2 className="text-lg font-semibold text-slate-900">
              {emptyStateCopy.title}
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              {emptyStateCopy.description}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const hasActionItems = Boolean(reportCard.immediate_action_items?.length);
  const hasSkillAssessments = Boolean(reportCard.skill_assessments?.length);
  const hasCourseObjectives = Boolean(
    reportCard.recommended_course_objectives?.length
  );

  return (
    <main className="min-h-dvh bg-slate-50 pb-12">
      <header className="bg-white shadow-sm">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-9">
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <FileText className="h-6 w-6" aria-hidden="true" />
              </span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Session Summary
                </p>
                <h1 className="text-2xl font-semibold text-slate-900 sm:text-3xl">
                  Report Card
                </h1>
              </div>
            </div>
            <p className="text-sm leading-6 text-slate-600">
              Here’s a quick snapshot of what we worked on, what’s next, and how
              you can help keep the momentum going between sessions.
            </p>
          </div>

          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {metrics.map(({ id, label, value, icon }) => (
              <MetricCard key={id} icon={icon} label={label} value={value} />
            ))}
          </dl>
        </div>
      </header>

      <div className="mx-auto mt-6 flex w-full max-w-3xl flex-col gap-6 px-2 md:px-5">
        {hasActionItems ? (
          <SectionCard
            id="immediate-actions-heading"
            icon={Target}
            eyebrow="Next Priority"
            title="Immediate Action Items"
            description="Work through these items over the next one to two weeks to reinforce this session."
            iconToneClass="bg-rose-100 text-rose-600"
          >
            <ol className="space-y-3">
              {reportCard.immediate_action_items.map((item, index) => {
                const priority = item.priority as PriorityLevel;
                const { label, tone } = priorityTokens[priority];

                return (
                  <li
                    key={`${item.title}-${index}`}
                    className="flex flex-col gap-2 rounded-2xl bg-white border border-slate-200 md:bg-slate-50 p-4"
                  >
                    <header className="flex flex-col md:flex-row-reverse flex-wrap md:items-center justify-between gap-2">
                      <TonePill tone={tone}>{label}</TonePill>
                      <p className="text-base font-semibold text-slate-900">
                        {item.title}
                      </p>
                    </header>
                    <p className="text-sm leading-6 text-slate-700">
                      {item.description}
                    </p>
                  </li>
                );
              })}
            </ol>
          </SectionCard>
        ) : null}

        {hasSkillAssessments ? (
          <SectionCard
            id="skill-assessments-heading"
            icon={Star}
            eyebrow="Mastery Snapshot"
            title="Skill Assessments"
            description="A quick look at how the student performed in each focus area this week."
            iconToneClass="bg-sky-100 text-sky-600"
          >
            <ul className="space-y-3">
              {reportCard.skill_assessments.map((skill, index) => {
                const level = skill.skill_level as SkillLevel;
                const { label, tone } = masteryTokens[level];

                return (
                  <li
                    key={`${skill.skill_name}-${index}`}
                    className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white md:bg-slate-50 p-4"
                  >
                    <header className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-base font-semibold text-slate-900">
                          {skill.skill_name}
                        </p>
                        <p className="mt-1 text-sm leading-6 text-slate-700">
                          {skill.skill_description}
                        </p>
                      </div>
                      <TonePill tone={tone}>{label}</TonePill>
                    </header>
                  </li>
                );
              })}
            </ul>
          </SectionCard>
        ) : null}

        <SectionCard
          id="recommendations-heading"
          icon={CheckCircle2}
          eyebrow="Forward Plan"
          title="Recommended Course"
          description="A tailored path to build on today's work and keep progress steady."
          iconToneClass="bg-emerald-100 text-emerald-600"
        >
          <article className="rounded-2xl border border-slate-200 bg-white md:bg-slate-50 p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-base font-semibold text-slate-900">
                  {reportCard.recommended_course_name}
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-700">
                  {reportCard.recommended_course_description}
                </p>
              </div>
              <Badge variant="primary" size="md" className="self-start">
                {reportCard.recommended_course_duration_weeks} week plan
              </Badge>
            </div>
          </article>

          {hasCourseObjectives ? (
            <div className="mt-5 space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">
                Weekly Objectives
              </h3>
              <ol className="space-y-3">
                {reportCard.recommended_course_objectives.map(
                  (objective, index) => (
                    <li
                      key={`${objective.title}-${index}`}
                      className="flex flex-col md:flex-row gap-1 md:gap-4 rounded-2xl border border-slate-200 bg-white/70 p-3"
                    >
                      <span className="hidden md:flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl bg-primary text-xs font-semibold text-white">
                        Wk {objective.week_number}
                      </span>
                      <small className="md:hidden self-start uppercase text-slate-500">
                        Week {objective.week_number}
                      </small>
                      <div className="space-y-1">
                        <p className="text-lg font-semibold text-slate-900">
                          {objective.title}
                        </p>
                        <p className="text-sm leading-6 text-slate-700">
                          {objective.description}
                        </p>
                      </div>
                    </li>
                  )
                )}
              </ol>
            </div>
          ) : null}
        </SectionCard>

        {reportCard.tutor_notes ? (
          <SectionCard
            id="tutor-notes-heading"
            icon={FileText}
            eyebrow="Tutor Reflection"
            title="Notes & Observations"
            iconToneClass="bg-violet-100 text-violet-600"
          >
            <p className="text-sm leading-7 pt-2 text-slate-700 whitespace-pre-wrap">
              {reportCard.tutor_notes.replace(/\\n/g, '\n')}
            </p>
          </SectionCard>
        ) : null}

        {account && !account.stripe_customer_id && (
          <SectionCard
            id="upgrade-plan-heading"
            icon={Target}
            eyebrow="Unlock More Support"
            title="Upgrade Your Plan"
            description="Level up your student’s learning with extended sessions, progress tracking, and on-demand tutor feedback."
            iconToneClass="bg-primary/10 text-primary"
          >
            <div className="rounded-2xl border border-slate-200 bg-white md:bg-slate-50 p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:justify-between">
                <div className="space-y-2">
                  <p className="text-base font-semibold text-slate-900">
                    Acadia Premium
                  </p>
                  <ul className="text-sm leading-6 text-slate-700 space-y-1">
                    <li>✓ Weekly progress consultations</li>
                    <li>✓ Personalized learning roadmaps</li>
                    <li>✓ Priority scheduling and support</li>
                  </ul>
                </div>
                <Button
                  iconRight={ArrowRight}
                  className="self-start sm:self-end"
                  variant="primary"
                  onClick={() => navigate("/settings")}
                >
                  Upgrade Account
                </Button>
              </div>
            </div>
          </SectionCard>
        )}
      </div>
    </main>
  );
}
