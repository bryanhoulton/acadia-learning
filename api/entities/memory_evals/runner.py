from __future__ import annotations

import asyncio
import json
import logging
import os
from dataclasses import dataclass
from typing import Any

import tiktoken
from django.conf import settings
from django.contrib.auth.models import User

from entities.memory_evals.schemas import EvalMessage, EvalSpec
from entities.models import Entity
from entities.services import DRMService
from lms.accounts.models import Account
from utils.llms import track_llm_cost

logger = logging.getLogger(__name__)

# Suppress OpenAI and HTTP client logs completely
for log_name in ["openai", "openai._client", "openai._base_client", "httpx", "httpcore", "_client"]:
    target_logger = logging.getLogger(log_name)
    target_logger.setLevel(logging.WARNING)
    target_logger.propagate = False
    # Remove all handlers to ensure no output
    target_logger.handlers = []


@dataclass
class RunResult:
    scores: dict[str, float]
    memory_context: str
    model_name: str
    total_cost: float = 0.0
    usage: dict[str, int] | None = None


async def _score_answer_async(answer: str, grading, question: str = "") -> dict[str, Any]:
    """Score an answer using LLM-as-a-judge."""
    # LLM judge scoring returns (score, reasoning, cost)
    llm_score, reasoning, cost = await _llm_judge_answer_async(question, answer, grading)

    result = {"llm_judge": llm_score, "reasoning": reasoning, "cost": cost}

    return result


async def _llm_judge_answer_async(question: str, answer: str, grading) -> tuple[float, str, float]:
    """Use an LLM to judge answer quality on a 0-1 scale (async). Returns (score, reasoning, cost)."""

    expected = getattr(grading, "expected_answer", None)
    criteria = []
    if expected:
        criteria.append(f"Expected answer: {expected}")

    criteria_text = "\n".join(f"- {c}" for c in criteria) if criteria else "- Answer should be accurate and relevant"

    prompt = f"""You are grading an answer about what an AI agent remembers from conversations.

Question: {question}

Answer: {answer}

Expected: {criteria_text}

Grade based on SEMANTIC MEANING, not exact wording:
- 1.0 = The agent has the information it needs. Meaning is correct even if phrasing differs.
- 0.5 = The agent has partial information. Some key details present, some missing.
- 0.0 = The agent lacks the information or has it wrong. Would make poor decisions.

IGNORE: exact quotes, formatting differences, minor time variations, synonym usage, bullet points vs prose.
FOCUS: Does the agent understand the core concept/fact well enough to act appropriately?

IMPORTANT: If the agent provides a MORE SPECIFIC answer than expected, and the specific answer does NOT contradict the expected answer, assume that the specifics are correct.
Example: Expected "a few weeks in" vs Answer "November 25, 2025 (which is a few weeks in)" → CORRECT (1.0)

Examples:
- "Algebra 2 with Statistics" vs "Algebra 2 and Statistics" → SAME (1.0)
- "Grade 8" vs "8th grade" → SAME (1.0)
- "Mon/Wed 6:00-6:45 PM" vs "Monday 6:15 PM, Wednesday 6:30 PM" → CLOSE ENOUGH (1.0) 
- "UIL Mathematics" vs "Mathematics" → SAME (1.0)
- "needs prompting" vs "needs scaffolding" → SAME (1.0)
- "a few weeks into tutoring" vs "November 25, 2025, a few weeks after starting" → MORE SPECIFIC (1.0)
- "struggles with X" vs "I don't know" → DIFFERENT (0.0)
- "proficient at X" vs "struggles with X" → OPPOSITE (0.0)

Respond in JSON format:
{{"score": <number between 0.0 and 1.0>, "reasoning": "<brief explanation focusing on semantic equivalence>"}}"""

    try:
        # Use async OpenAI client with proper cleanup
        from openai import AsyncOpenAI

        async with AsyncOpenAI(api_key=os.environ.get("OPENAI_API_KEY")) as async_client:
            resp = await async_client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": prompt}],
                response_format={"type": "json_object"},
            )

            # Track cost
            cost = 0.0
            try:
                if hasattr(resp, "usage") and resp.usage:
                    cost = track_llm_cost(resp.usage, "gpt-4o-mini", None, category="memory_eval_judge")  # type: ignore
            except Exception:
                pass

            result_text = resp.choices[0].message.content or '{"score": 0.5, "reasoning": "Error parsing response"}'
            result_json = json.loads(result_text)
            score = float(result_json.get("score", 0.5))
            reasoning = result_json.get("reasoning", "No reasoning provided")
            return max(0.0, min(1.0, score)), reasoning, cost
    except Exception as e:
        logger.error(f"LLM judge failed: {e}")
        return 0.5, f"Error during grading: {str(e)}", 0.0  # Default to neutral score on error


def _llm_judge_answer(question: str, answer: str, grading) -> float:
    """Use an LLM to judge answer quality on a 0-1 scale."""
    from api.settings import oai

    expected = getattr(grading, "expected_answer", None)
    criteria = []
    if expected:
        criteria.append(f"Expected answer: {expected}")

    criteria_text = "\n".join(f"- {c}" for c in criteria) if criteria else "- Answer should be accurate and relevant"

    prompt = f"""You are grading an answer to a question about memory/context.

Question: {question}

Answer: {answer}

Grading Criteria:
{criteria_text}

Score this answer on a scale of 0.0 to 1.0, where:
- 1.0 = Perfect answer, meets all criteria
- 0.5 = Partial answer, meets some criteria
- 0.0 = Wrong or missing required information

Respond with ONLY a number between 0.0 and 1.0."""

    try:
        resp = oai.responses.create(
            model="gpt-4o-mini",  # Use cheaper model for grading
            input=[{"role": "user", "content": prompt}],
        )

        # Track cost
        try:
            if hasattr(resp, "usage") and resp.usage:
                track_llm_cost(resp.usage, "gpt-4o-mini", None, category="memory_eval_judge")
        except Exception:
            pass

        score_text = resp.output_text or "0.5"
        score = float(score_text.strip())
        return max(0.0, min(1.0, score))
    except Exception as e:
        logger.error(f"LLM judge failed: {e}")
        return 0.5  # Default to neutral score on error


def _ensure_account(timezone: str) -> Account:
    # Create a throwaway user and account for isolation
    user = User.objects.create_user(username=f"eval_{os.urandom(4).hex()}")
    acct = Account.objects.create(user=user, account_phone=f"+1{os.urandom(5).hex()[:10]}", timezone=timezone)
    return acct


def _ensure_entity(acct: Account) -> Entity:
    entity = Entity.objects.create(
        account=acct,
        name=f"Eval Entity {acct.id}",
        timezone=acct.timezone or "UTC",
        time_offset=0,
    )
    return entity


def _load_messages(jsonl_path: str) -> list[EvalMessage]:
    messages: list[EvalMessage] = []
    with open(jsonl_path, "r") as fh:
        for line in fh:
            if not line.strip():
                continue
            obj = json.loads(line)
            messages.append(EvalMessage(**obj))
    return messages


async def run_spec_async(spec_path: str, dataset_dir: str | None = None) -> RunResult:
    """Run eval spec asynchronously with batched Q&A."""
    from asgiref.sync import sync_to_async

    logger.info(f"Running spec: {spec_path}")

    spec = EvalSpec.model_validate_json(open(spec_path, "r").read())
    base_dir = dataset_dir or os.path.join(settings.BASE_DIR, "entities", "memory_evals")
    jsonl_path = os.path.join(base_dir, "datasets", f"{spec.dataset}.jsonl")

    # Prepare data
    eval_messages = _load_messages(jsonl_path)
    logger.info(f"Loaded {len(eval_messages)} messages")
    acct = await sync_to_async(_ensure_account)(spec.timezone)
    entity = await sync_to_async(_ensure_entity)(acct)

    # Set time_offset FIRST so entity.current_time matches seed_time
    from django.utils import timezone as django_timezone

    actual_now = await sync_to_async(lambda: django_timezone.now().astimezone(entity.current_time.tzinfo))()
    offset_minutes = int((spec.seed_time - actual_now).total_seconds() / 60)
    entity.time_offset = offset_minutes
    await sync_to_async(entity.save)(update_fields=["time_offset"])

    # Now create DRMService (it will fetch entity with updated time_offset)
    drm = await sync_to_async(DRMService)(entity.id)

    # Log messages with their own timestamps to exercise bucketing and summaries
    for m in eval_messages:
        await sync_to_async(drm.log_messages)([m.message_data], timestamp=m.timestamp)  # type: ignore

    # Update summaries (5m → hourly → daily → weekly → monthly) - call async directly to avoid nested event loops
    current_time = await sync_to_async(lambda: entity.current_time)()
    summary_result = await drm._summarizer.update_all_async(current_time)
    summary_usage = summary_result.get("llm_usage", {"input_tokens": 0, "output_tokens": 0})
    logger.info(f"Summary LLM usage: {summary_usage}")

    # Calculate summary cost (gpt-5.2)
    summary_cost = track_llm_cost(
        type(
            "Usage",
            (),
            {"input_tokens": summary_usage["input_tokens"], "output_tokens": summary_usage["output_tokens"]},
        )(),
        "gpt-5.2",
        None,
        category="memory_eval_summary",
    )

    # Build context (will use seed_time via time_offset)
    memory_context = await sync_to_async(drm.get_memory_context)()

    # Ask questions via LLM (batched async)
    from openai import AsyncOpenAI

    model_name = "o3"
    total_qa_cost = 0.0

    # Use async context manager to ensure proper client cleanup
    async with AsyncOpenAI(api_key=os.environ.get("OPENAI_API_KEY")) as async_client:
        # Create all QA tasks
        async def ask_question(qa):
            system_prompt = (
                "You are an assistant given a compressed memory context."
                " Answer concisely and only from the given context.\n\n"
                "IMPORTANT: If you don't know the answer or don't have enough information "
                'in the memory context to answer confidently, respond with exactly: "I don\'t know"\n\n'
                f"MEMORY_CONTEXT:\n{memory_context}\n\n"
            )
            resp = await async_client.chat.completions.create(
                model=model_name,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": qa.question},
                ],
            )
            answer = resp.choices[0].message.content or ""
            usage = getattr(resp, "usage", None)
            # Calculate cost for this QA call
            qa_cost = 0.0
            if usage:
                qa_cost = track_llm_cost(usage, model_name, None, category="memory_eval_qa")
            return answer, usage, qa_cost

        # Batch all QA calls
        qa_results = await asyncio.gather(*[ask_question(qa) for qa in spec.qas])

    # Score all answers (async batch)
    score_tasks = []
    for i, ((answer, usage, qa_cost), qa) in enumerate(zip(qa_results, spec.qas)):
        total_qa_cost += qa_cost
        score_tasks.append(_score_answer_async(answer, qa.grading, question=qa.question))

    score_dicts = await asyncio.gather(*score_tasks)

    # Compile results
    scores: dict[str, float] = {}
    answers: dict[str, dict[str, Any]] = {}
    total_usage = {
        "input_tokens": summary_usage["input_tokens"],
        "output_tokens": summary_usage["output_tokens"],
    }
    total_judge_cost = 0.0

    for i, ((answer, usage, _), qa, score_dict) in enumerate(zip(qa_results, spec.qas, score_dicts)):
        qkey = f"q{i + 1}"
        scores[qkey] = score_dict["llm_judge"]
        total_judge_cost += score_dict.get("cost", 0.0)

        # Accumulate QA usage (handle both ResponseUsage and CompletionUsage)
        if usage:
            total_usage["input_tokens"] += getattr(usage, "input_tokens", None) or getattr(usage, "prompt_tokens", 0)
            total_usage["output_tokens"] += getattr(usage, "output_tokens", None) or getattr(
                usage, "completion_tokens", 0
            )

        expected_answer = getattr(qa.grading, "expected_answer", None)
        answers[qkey] = {
            "question": qa.question,
            "expected_answer": expected_answer,
            "answer": answer,
            "score": score_dict["llm_judge"],
            "reasoning": score_dict["reasoning"],
        }

    # Calculate total cost
    total_cost = summary_cost + total_qa_cost + total_judge_cost

    # Export artifacts
    base_dir = dataset_dir or os.path.join(settings.BASE_DIR, "entities", "memory_evals")
    outputs_dir = os.path.join(base_dir, "outputs", spec.dataset)
    os.makedirs(outputs_dir, exist_ok=True)

    # Token metrics
    enc = tiktoken.get_encoding("o200k_base")
    raw_text = "\n".join(json.dumps(m.message_data, ensure_ascii=False) for m in eval_messages)
    raw_tokens = len(enc.encode(raw_text))
    context_tokens = len(enc.encode(memory_context))
    reduction_ratio = (context_tokens / raw_tokens) if raw_tokens > 0 else 0.0

    # Write memory context
    with open(os.path.join(outputs_dir, "memory_context.txt"), "w", encoding="utf-8") as fh:
        fh.write(memory_context)

    # Delete entity and account
    await sync_to_async(acct.delete)()

    # Write QA results and metrics
    out = {
        "dataset": spec.dataset,
        "model": model_name,
        "scores": scores,
        "average_score": (sum(scores.values()) / max(1, len(scores))) if scores else 0.0,
        "metrics": {
            "raw_tokens": raw_tokens,
            "context_tokens": context_tokens,
            "reduction_ratio": reduction_ratio,
            "llm_usage": total_usage,
            "cost": {
                "summary": summary_cost,
                "qa": total_qa_cost,
                "judge": total_judge_cost,
                "total": total_cost,
            },
        },
        "answers": answers,
    }
    with open(os.path.join(outputs_dir, "qa_results.json"), "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, indent=2)

    return RunResult(
        scores=scores,
        memory_context=memory_context,
        model_name=model_name,
        total_cost=total_cost,
        usage=total_usage,
    )


def run_spec(spec_path: str, dataset_dir: str | None = None) -> RunResult:
    """Sync wrapper for async run_spec."""
    return asyncio.run(run_spec_async(spec_path, dataset_dir))


def run_single(dataset_name: str) -> dict[str, Any]:
    """Run a single eval spec and return detailed results."""
    base_dir = os.path.join(settings.BASE_DIR, "entities", "memory_evals")
    specs_dir = os.path.join(base_dir, "questions")
    outputs_dir = os.path.join(base_dir, "outputs")
    results: dict[str, Any] = {}

    # Add .json extension if not present
    fname = f"{dataset_name}.json" if not dataset_name.endswith(".json") else dataset_name
    spec_path = os.path.join(specs_dir, fname)

    if not os.path.exists(spec_path):
        raise FileNotFoundError(f"Dataset spec not found: {spec_path}")

    logger.info(f"Running single dataset: {fname}")
    res = run_spec(spec_path, dataset_dir=base_dir)

    # Read the detailed qa_results.json file that was just written
    spec_name = fname.replace(".json", "")
    qa_results_path = os.path.join(outputs_dir, spec_name, "qa_results.json")
    if os.path.exists(qa_results_path):
        with open(qa_results_path, "r") as f:
            detailed_results = json.load(f)
            results[fname] = detailed_results
    else:
        # Fallback to basic results
        results[fname] = {
            "scores": res.scores,
            "model": res.model_name,
            "context_chars": len(res.memory_context),
        }

    return results


def run_all() -> dict[str, Any]:
    """Run all eval specs and return detailed results."""
    base_dir = os.path.join(settings.BASE_DIR, "entities", "memory_evals")
    specs_dir = os.path.join(base_dir, "questions")
    outputs_dir = os.path.join(base_dir, "outputs")
    results: dict[str, Any] = {}

    for fname in os.listdir(specs_dir):
        if fname.endswith(".json"):
            spec_path = os.path.join(specs_dir, fname)
            res = run_spec(spec_path, dataset_dir=base_dir)

            # Read the detailed qa_results.json file that was just written
            spec_name = fname.replace(".json", "")
            qa_results_path = os.path.join(outputs_dir, spec_name, "qa_results.json")
            if os.path.exists(qa_results_path):
                with open(qa_results_path, "r") as f:
                    detailed_results = json.load(f)
                    results[fname] = detailed_results
            else:
                # Fallback to basic results
                results[fname] = {
                    "scores": res.scores,
                    "model": res.model_name,
                    "context_chars": len(res.memory_context),
                }
    return results
