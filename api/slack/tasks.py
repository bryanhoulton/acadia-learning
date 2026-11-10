import asyncio
import logging
from datetime import datetime
from textwrap import dedent
from zoneinfo import ZoneInfo

from asgiref.sync import sync_to_async
from celery import shared_task
from pydantic import BaseModel

from api.settings import gai, oai, slack_client
from entities.models import Entity, Message
from entities.services import DRMService
from tracing.spans import traced

logger = logging.getLogger(__name__)


@shared_task
@traced
def process_entity_question(
    entity_id: int,
    question: str,
    channel_id: str,
    thread_ts: str,
):
    """Celery task to process entity questions with o3 model"""
    try:
        # Get the entity
        entity = Entity.objects.get(id=entity_id)

        # Get entity's memory context (summaries are auto-updated when messages are logged)
        memory_context = DRMService(entity_id).get_memory_context()
        logger.info(f"Retrieved memory context for entity {entity_id} ({entity.name})")

        system_prompt = dedent(
            f"""
        You are an AI assistant analyzing an entity's memory and activity.


        Entity Timezone: {entity.timezone}
        Current time for the entity: {datetime.now(ZoneInfo(entity.timezone)).isoformat()}

        Memory Context:
        {memory_context}

        Answer the question from your team about this entity based on their memory and activity.
        Be concise but informative, and speak in the first person as if you are the entity.
        If the entity has no relevant memory, say so.
        """
        )

        response = oai.responses.create(
            model="o3",
            input=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": question},
            ],
        )
        answer = response.output_text
        num_messages = len(Message.objects.filter(entity=entity))

        logger.info(f"Generated answer for entity {entity_id} question: {question[:50]}...")

        # Post response to the thread
        slack_client.chat_postMessage(
            channel=channel_id,
            thread_ts=thread_ts,
            blocks=[
                {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": f"*Answer from {entity.name}:*\n{answer}",
                    },
                },
                {
                    "type": "context",
                    "elements": [
                        {
                            "type": "mrkdwn",
                            "text": f"Based on {num_messages} messages in memory",
                        },
                    ],
                },
            ],
            text=f"Answer: {answer}",
        )
        logger.info("Posted answer to thread")

    except Exception as e:
        logger.error(f"Error processing entity question: {e}")
        try:
            slack_client.chat_postMessage(
                channel=channel_id,
                thread_ts=thread_ts,
                text=f"❌ Error processing question: {str(e)}",
            )
        except Exception as slack_error:
            logger.error(f"Error posting error message to Slack: {slack_error}")


class IdentificationOutput(BaseModel):
    identifies: bool
    reason: str


async def identify_single_entity_async(entity: Entity, question: str, async_client) -> dict | None:
    """Async helper to identify a single entity using async Gemini client"""
    try:
        # Get entity attributes early to avoid async context issues
        entity_id = entity.id
        entity_name = await sync_to_async(lambda: entity.name)()
        entity_account = await sync_to_async(lambda: str(entity.account))()

        # Get entity's memory context (summaries are auto-updated when messages are logged)
        # Wrap Django ORM call in sync_to_async
        memory_context = await sync_to_async(lambda: DRMService(entity.id).get_memory_context())()

        # Create a prompt that asks Gemini if the entity would identify with this question
        # Simulate a fourth-grader asking the question
        identification_prompt = dedent(
            f"""
        You are analyzing whether an entity (student) would identify with the following question or statement, 
        as if it were asked by a fourth grader.

        QUESTION/STATEMENT: {question}

        ENTITY MEMORY AND CONTEXT:
        {memory_context}

        Based on the entity's memory and context, determine if they would identify with this question or statement.
        Consider their knowledge, experiences, interests, and demonstrated abilities.

        Respond with a JSON object containing:
        - "identifies": boolean (true if the entity identifies with the question/statement)
        - "reason": string (brief explanation of why or why not)
        """
        )

        response = await async_client.models.generate_content(
            model="gemini-2.5-pro",
            contents=[identification_prompt],
            config={
                "response_mime_type": "application/json",
                "response_schema": IdentificationOutput,
            },
        )

        result = IdentificationOutput.model_validate(response.parsed)

        if result.identifies:
            logger.info(
                f"Entity {entity_id} ({entity_name}): identifies={result.identifies}, reason={result.reason[:50]}..."
            )
            return {
                "entity_id": entity_id,
                "entity_name": entity_name,
                "account": entity_account,
                "reason": result.reason,
            }
        else:
            logger.info(f"Entity {entity_id} ({entity_name}): does not identify")
            return None

    except Exception as e:
        logger.error(f"Error identifying entity {entity.id}: {e}")
        return None


async def process_entities_in_batches(
    entities: list[Entity], question: str, async_client, batch_size: int = 100, progress_callback=None
) -> tuple[list[dict], int]:
    """Process entities in batches using async Gemini calls"""
    matching_entities = []
    error_count = 0

    # Process entities in batches
    for i in range(0, len(entities), batch_size):
        batch = entities[i : i + batch_size]
        logger.info(f"Processing batch {i // batch_size + 1} ({len(batch)} entities)")

        # Create async tasks for this batch
        tasks = [identify_single_entity_async(entity, question, async_client) for entity in batch]

        # Execute batch concurrently
        results = await asyncio.gather(*tasks, return_exceptions=True)

        # Process results
        for result in results:
            if isinstance(result, Exception):
                error_count += 1
                logger.error(f"Exception in batch processing: {result}")
            elif result is not None:
                matching_entities.append(result)

        # Update progress after each batch
        if progress_callback:
            entities_processed = min(i + batch_size, len(entities))
            progress_callback(entities_processed, len(entities), len(matching_entities))

    return matching_entities, error_count


def create_progress_bar(current: int, total: int, width: int = 20) -> str:
    """Create a text-based progress bar"""
    percentage = int((current / total) * 100) if total > 0 else 0
    filled = int((current / total) * width) if total > 0 else 0
    bar = "█" * filled + "░" * (width - filled)
    return f"{bar} {percentage}% ({current}/{total})"


@shared_task
@traced
def process_entity_identification(
    question: str,
    channel_id: str,
    thread_ts: str,
    paid_only: bool = False,
):
    """Celery task to identify entities that match a question"""
    try:
        # Get entities (optionally filter to paid accounts only)
        if paid_only:
            entities = list(Entity.objects.filter(account__stripe_customer_id__isnull=False))
            logger.info(f"Identifying PAID entities for question: {question[:50]}... ({len(entities)} paid entities)")
        else:
            entities = list(Entity.objects.all())
            logger.info(f"Identifying entities for question: {question[:50]}... ({len(entities)} total entities)")

        # Post initial progress message with question
        progress_bar = create_progress_bar(0, len(entities))
        initial_message = slack_client.chat_postMessage(
            channel=channel_id,
            thread_ts=thread_ts,
            blocks=[
                {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": f"*Question:* {question}",
                    },
                },
                {"type": "divider"},
                {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": f"🔍 *Analyzing entities...*\n`{progress_bar}`\n_Found 0 matches so far_",
                    },
                },
            ],
            text=f"Question: {question}",
        )
        progress_message_ts = initial_message["ts"]
        logger.info("Posted initial progress message")

        # Define sync progress callback wrapper
        def update_progress_sync(processed: int, total: int, matches_found: int):
            try:
                progress_bar = create_progress_bar(processed, total)
                slack_client.chat_update(
                    channel=channel_id,
                    ts=str(progress_message_ts),
                    blocks=[
                        {
                            "type": "section",
                            "text": {
                                "type": "mrkdwn",
                                "text": f"*Question:* {question}",
                            },
                        },
                        {"type": "divider"},
                        {
                            "type": "section",
                            "text": {
                                "type": "mrkdwn",
                                "text": f"🔍 *Analyzing entities...*\n`{progress_bar}`\n_Found {matches_found} matches so far_",
                            },
                        },
                    ],
                    text=f"Question: {question} - {processed}/{total}",
                )
            except Exception as e:
                logger.error(f"Error updating progress message: {e}")

        # Create async Gemini client
        async_client = gai.aio

        # Process entities in async batches with progress updates
        # Use asyncio.new_event_loop() to avoid conflicts with forked processes
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            matching_entities, error_count = loop.run_until_complete(
                process_entities_in_batches(
                    entities, question, async_client, batch_size=100, progress_callback=update_progress_sync
                )
            )
        finally:
            loop.close()

        # Update progress message to show completion
        try:
            total_matches = len(matching_entities)
            completion_text = (
                f"✅ *Analysis Complete!*\nFound {total_matches} matching entit{'ies' if total_matches != 1 else 'y'}"
            )
            slack_client.chat_update(
                channel=channel_id,
                ts=str(progress_message_ts),
                blocks=[
                    {
                        "type": "section",
                        "text": {
                            "type": "mrkdwn",
                            "text": f"*Question:* {question}",
                        },
                    },
                    {"type": "divider"},
                    {
                        "type": "section",
                        "text": {
                            "type": "mrkdwn",
                            "text": completion_text,
                        },
                    },
                ],
                text=f"Complete: {total_matches} matches found",
            )
            logger.info("Updated progress message to show completion")
        except Exception as e:
            logger.warning(f"Could not update completion message: {e}")

        # Collect tutor emails and entity IDs from matching entities
        tutor_emails = []
        entity_ids = []
        for entity_info in matching_entities:
            entity_id = entity_info["entity_id"]
            # Generate tutor email format: acadia-{entity_id}@tutor.acadialearning.org
            tutor_email = f"acadia-{entity_id}@tutor.acadialearning.org"
            tutor_emails.append(tutor_email)
            entity_ids.append(str(entity_id))

        # Post each answer as a threaded reply under the main message
        if matching_entities:
            total_matches = len(matching_entities)

            # Post each entity's answer as a reply to the main progress message
            for idx, entity_info in enumerate(matching_entities, start=1):
                try:
                    slack_client.chat_postMessage(
                        channel=channel_id,
                        thread_ts=str(progress_message_ts),  # Reply to the main progress message
                        blocks=[
                            {
                                "type": "section",
                                "text": {
                                    "type": "mrkdwn",
                                    "text": f"*{idx}. {entity_info['entity_name']}* (ID: {entity_info['entity_id']})\n_{entity_info['account']}_",
                                },
                            },
                            {"type": "divider"},
                            {
                                "type": "section",
                                "text": {
                                    "type": "mrkdwn",
                                    "text": f"*Answer:*\n{entity_info['reason']}",
                                },
                            },
                        ],
                        text=f"{idx}. {entity_info['entity_name']}: {entity_info['reason'][:100]}",
                    )
                except Exception as e:
                    logger.error(f"Error posting answer for entity {entity_info['entity_id']}: {e}")

            logger.info(f"Posted {total_matches} answers as threaded replies")

            # Post summary message with email list
            summary_text = (
                f"Analyzed {len(entities)} total entities ({error_count} errors)"
                if error_count > 0
                else f"Analyzed all {len(entities)} entities"
            )

            summary_blocks = [
                {
                    "type": "context",
                    "elements": [
                        {
                            "type": "mrkdwn",
                            "text": summary_text,
                        },
                    ],
                }
            ]

            # Add tutor email list and entity IDs if available
            if tutor_emails:
                email_list = ", ".join(tutor_emails)
                id_list = ", ".join(entity_ids)
                summary_blocks.extend(
                    [
                        {"type": "divider"},
                        {
                            "type": "section",
                            "text": {
                                "type": "mrkdwn",
                                "text": f"*📧 Tutor Emails for BCC ({len(tutor_emails)} tutors):*",
                            },
                        },
                        {
                            "type": "section",
                            "text": {
                                "type": "mrkdwn",
                                "text": f"```{email_list}```",
                            },
                        },
                        {"type": "divider"},
                        {
                            "type": "section",
                            "text": {
                                "type": "mrkdwn",
                                "text": f"*🆔 Entity IDs ({len(entity_ids)}):*",
                            },
                        },
                        {
                            "type": "section",
                            "text": {
                                "type": "mrkdwn",
                                "text": f"```{id_list}```",
                            },
                        },
                    ]
                )

            slack_client.chat_postMessage(
                channel=channel_id,
                thread_ts=str(progress_message_ts),  # Reply to the main progress message
                blocks=summary_blocks,
                text=summary_text,
            )
            logger.info("Posted summary message with email list as threaded reply")
        else:
            slack_client.chat_postMessage(
                channel=channel_id,
                thread_ts=thread_ts,
                blocks=[
                    {
                        "type": "section",
                        "text": {
                            "type": "mrkdwn",
                            "text": "❌ *No matching entities found*\n\nNo entities identified with the given question or statement.",
                        },
                    },
                ],
                text="No matching entities found",
            )

    except Exception as e:
        logger.error(f"Error processing entity identification: {e}")
        try:
            slack_client.chat_postMessage(
                channel=channel_id,
                thread_ts=thread_ts,
                text=f"❌ Error identifying entities: {str(e)}",
            )
        except Exception as slack_error:
            logger.error(f"Error posting error message to Slack: {slack_error}")
