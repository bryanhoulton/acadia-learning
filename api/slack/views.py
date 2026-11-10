import json
import logging
from urllib.parse import parse_qs

import requests
from django.http import HttpResponse, JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from api.settings import slack_client
from entities.models import Entity
from entities.services import DRMService
from entities.tasks import possibly_run_entity

from .tasks import process_entity_identification, process_entity_question

logger = logging.getLogger(__name__)


@csrf_exempt
@require_http_methods(["POST"])
def announce(request):
    # Parse the request body
    body = request.body.decode("utf-8")
    parsed_data = parse_qs(body)

    # Extract the text from the command
    # token = parsed_data.get("token", [""])[0]  # May be used for validation in future
    text = parsed_data.get("text", [""])[0]

    # Parse entity IDs from the command text
    # Format: /announce [entity_ids] message
    # Example: /announce 1,2,3 Hello everyone
    # Example: /announce Hello everyone (no entity IDs = all entities)
    parts = text.strip().split(" ", 1)

    if len(parts) == 1:
        # No entity IDs specified, send to all entities
        entity_ids = []
        announcement_text = parts[0]
        target_entities = "all entities"
    else:
        first_part = parts[0]
        announcement_text = parts[1]

        # Check if first part looks like entity IDs (comma-separated numbers)
        if first_part.replace(",", "").replace(" ", "").isdigit():
            # Parse entity IDs
            entity_ids = [int(entity_id.strip()) for entity_id in first_part.split(",") if entity_id.strip().isdigit()]
            if entity_ids:
                # Get entity names for display
                entities = Entity.objects.filter(id__in=entity_ids)
                entity_names = [f"{e.id} ({e.name})" for e in entities]
                target_entities = ", ".join(entity_names)
                # Update announcement_text to use the actual text
                announcement_text = parts[1]
            else:
                entity_ids = []
                target_entities = "all entities"
        else:
            # First part is not entity IDs, treat as part of the message
            entity_ids = []
            announcement_text = text
            target_entities = "all entities"

    return JsonResponse(
        {
            "response_type": "in_channel",
            "blocks": [
                {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": f"*Announcement Preview:*\n{announcement_text}",
                    },
                },
                {
                    "type": "context",
                    "elements": [
                        {
                            "type": "mrkdwn",
                            "text": f"*Target:* {target_entities}",
                        },
                    ],
                },
                {
                    "type": "input",
                    "block_id": "confirmation_input",
                    "element": {
                        "type": "plain_text_input",
                        "action_id": "confirmation_text",
                        "placeholder": {
                            "type": "plain_text",
                            "text": "Type 'confirm' to proceed",
                        },
                    },
                    "label": {
                        "type": "plain_text",
                        "text": "Confirmation",
                        "emoji": True,
                    },
                },
                {
                    "type": "section",
                    "block_id": "options_section",
                    "text": {"type": "mrkdwn", "text": "*Options:*"},
                    "accessory": {
                        "type": "checkboxes",
                        "action_id": "run_entity_checkbox",
                        "options": [
                            {
                                "text": {
                                    "type": "mrkdwn",
                                    "text": "Run entities after announcement",
                                },
                                "value": "run_entities",
                            }
                        ],
                        "initial_options": [
                            {
                                "text": {
                                    "type": "mrkdwn",
                                    "text": "Run entities after announcement",
                                },
                                "value": "run_entities",
                            }
                        ],
                    },
                },
                {
                    "type": "actions",
                    "elements": [
                        {
                            "type": "button",
                            "text": {
                                "type": "plain_text",
                                "text": "Submit",
                                "emoji": True,
                            },
                            "style": "primary",
                            "action_id": "submit_confirmation",
                            "value": json.dumps({"text": announcement_text, "entity_ids": entity_ids}),
                        },
                        {
                            "type": "button",
                            "text": {
                                "type": "plain_text",
                                "text": "Cancel",
                                "emoji": True,
                            },
                            "style": "danger",
                            "action_id": "cancel_announcement",
                        },
                    ],
                },
            ],
        }
    )


@csrf_exempt
@require_http_methods(["POST"])
def ask(request):
    # Parse the request body
    body = request.body.decode("utf-8")
    parsed_data = parse_qs(body)

    # Extract the text from the command
    text = parsed_data.get("text", [""])[0]
    channel_id = parsed_data.get("channel_id", [""])[0]

    # Parse entity ID and question from the command text
    # Format: /ask entity_id question
    # Example: /ask 1 What is this entity's recent activity?
    parts = text.strip().split(" ", 1)

    if len(parts) < 2:
        return JsonResponse(
            {
                "response_type": "ephemeral",
                "text": "Usage: /ask <entity_id> <question>\nExample: /ask 1 What is this entity's recent activity?",
            }
        )

    question = ""
    try:
        entity_id = int(parts[0])
        question = str(parts[1])
    except ValueError:
        return JsonResponse(
            {
                "response_type": "ephemeral",
                "text": "Invalid entity ID. Please provide a valid number.\nUsage: /ask <entity_id> <question>",
            }
        )

    # Get the entity
    try:
        entity = Entity.objects.get(id=entity_id)
    except Entity.DoesNotExist:
        return JsonResponse(
            {
                "response_type": "ephemeral",
                "text": f"Entity with ID {entity_id} not found.",
            }
        )

    # Post initial message and capture thread_ts
    try:
        initial_msg = slack_client.chat_postMessage(
            channel=channel_id,
            blocks=[
                {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": f"*Question for Entity {entity.id} ({entity.name}):*\n{question}",
                    },
                },
                {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": "🤔 *Processing your question...*",
                    },
                },
            ],
            text=f"Question for Entity {entity.id}: {question}",
        )
        thread_ts = initial_msg.get("ts")

        # Launch async task with thread_ts
        process_entity_question.delay(entity_id, question, channel_id, str(thread_ts))

        # Return empty 200 response (don't send anything via response_url)
        return HttpResponse(status=200)

    except Exception as e:
        logger.error(f"Error posting initial message: {e}")
        return JsonResponse(
            {
                "response_type": "ephemeral",
                "text": "Error: Failed to post question to Slack. Please try again.",
            }
        )


@csrf_exempt
@require_http_methods(["POST"])
def identify(request):
    # Parse the request body
    body = request.body.decode("utf-8")
    parsed_data = parse_qs(body)

    # Extract the text from the command
    text = parsed_data.get("text", [""])[0]
    channel_id = parsed_data.get("channel_id", [""])[0]

    if not text.strip():
        return JsonResponse(
            {
                "response_type": "ephemeral",
                "text": "Usage: /identify [--paid] <question>\nExample: /identify What is 2 + 2?\nExample: /identify --paid Who likes math?",
            }
        )

    # Parse --paid flag from anywhere in the message
    paid_only = False
    question = text.strip()
    if "--paid" in question:
        paid_only = True
        question = question.replace("--paid", "").strip()  # Remove "--paid" from the question

    if not question:
        return JsonResponse(
            {
                "response_type": "ephemeral",
                "text": "Usage: /identify [--paid] <question>\nExample: /identify What is 2 + 2?\nExample: /identify --paid Who likes math?",
            }
        )

    # Post initial message and capture thread_ts
    try:
        scope_text = "paid entity" if paid_only else "all entity"
        initial_msg = slack_client.chat_postMessage(
            channel=channel_id,
            blocks=[
                {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": f"*Identification Query:*\n{question}",
                    },
                },
                {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": f"🔍 *Analyzing {scope_text} memories...*",
                    },
                },
            ],
            text=f"Identification Query: {question}",
        )
        thread_ts = initial_msg.get("ts")

        # Launch async task with thread_ts and paid_only flag
        process_entity_identification.delay(question, channel_id, str(thread_ts), paid_only)

        # Return empty 200 response (don't send anything via response_url)
        return HttpResponse(status=200)

    except Exception as e:
        logger.error(f"Error posting initial message: {e}")
        return JsonResponse(
            {
                "response_type": "ephemeral",
                "text": "Error: Failed to post query to Slack. Please try again.",
            }
        )


@csrf_exempt
@require_http_methods(["POST"])
def handle_interaction(request):
    # Parse the URL-encoded form data from Slack
    body = request.body.decode("utf-8")
    parsed_data = parse_qs(body)

    # Extract the payload from the form data
    payload_str = parsed_data.get("payload", [""])[0]
    payload = json.loads(payload_str)

    response_url = payload.get("response_url")

    # Extract the interaction details
    action_id = payload.get("actions", [{}])[0].get("action_id")
    value = payload.get("actions", [{}])[0].get("value", "")
    user = payload.get("user", {}).get("username", "Unknown")

    # Prepare the updated blocks based on the action
    if action_id == "run_entity_checkbox":
        # Checkbox interaction - just acknowledge without changing the message
        return JsonResponse({})
    elif action_id == "submit_confirmation":
        # Check if user typed 'confirm' in the text input
        state_values = payload.get("state", {}).get("values", {})
        confirmation_text = state_values.get("confirmation_input", {}).get("confirmation_text", {}).get("value", "")

        # Check if run entities checkbox is checked
        run_entities = False
        # Slack checkbox values are accessed via the section block ID and the accessory action_id
        checkbox_section = state_values.get("options_section", {})
        checkbox_values = checkbox_section.get("run_entity_checkbox", {}).get("selected_options", [])

        if any(option.get("value") == "run_entities" for option in checkbox_values):
            run_entities = True

        if confirmation_text.lower().strip() == "confirm":
            # Parse the value JSON to get announcement text and entity IDs
            try:
                value_data = json.loads(value)
                announcement_text = value_data.get("text", "")
                entity_ids = value_data.get("entity_ids", [])
            except (json.JSONDecodeError, KeyError):
                # Fallback for old format
                announcement_text = value
                entity_ids = []

            # Get entities to send announcement to
            if entity_ids:
                entities = Entity.objects.filter(id__in=entity_ids)
                target_description = f"entities {', '.join(str(e.id) for e in entities)}"
            else:
                entities = Entity.objects.all()
                target_description = "all entities"

            # Add announcement to specified entities using coordinator
            success_count = 0
            error_count = 0
            run_count = 0

            for entity in entities:
                try:
                    # This is kinda fucked. We probably should make announcements into another
                    # tool instead of messing with memory.
                    drm = DRMService(entity.id)
                    drm.log_messages(
                        [
                            {
                                "type": "message",
                                "role": "system",
                                "content": "New announcement from your team: " + announcement_text,
                            }
                        ]
                    )
                    success_count += 1
                    logger.info(f"Added announcement to entity {entity.id} ({entity.name})")

                    # Optionally run the entity after announcement
                    if run_entities:
                        if possibly_run_entity(entity.id, wakeup=True):
                            run_count += 1
                            logger.info(f"Started entity {entity.id} ({entity.name}) after announcement")
                        else:
                            logger.info(
                                f"Entity {entity.id} ({entity.name}) was not started "
                                f"(already running, on call, or sleeping)"
                            )

                except Exception as e:
                    error_count += 1
                    logger.error(f"Error adding announcement to entity {entity.id}: {e}")

            # Create success message with results
            total_entities = entities.count()
            if error_count == 0:
                status_text = f"✅ Successfully sent to all {success_count} entities"
            else:
                status_text = f"⚠️ Sent to {success_count}/{total_entities} entities ({error_count} failed)"

            # Add run status if entities were supposed to be run
            if run_entities:
                status_text += f"\n🚀 Started {run_count}/{success_count} entities"

            updated_blocks = [
                {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": f"✅ *Announcement confirmed by @{user}!*\n\n{announcement_text}",
                    },
                },
                {
                    "type": "context",
                    "elements": [
                        {
                            "type": "mrkdwn",
                            "text": f"*Target:* {target_description}\n*Result:* {status_text}",
                        },
                    ],
                },
            ]
        else:
            updated_blocks = [
                {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": "❌ *Confirmation failed*\n\nYou must type 'confirm' exactly to proceed.",
                    },
                },
                {
                    "type": "context",
                    "elements": [
                        {
                            "type": "mrkdwn",
                            "text": f"@{user} typed: '{confirmation_text}'",
                        },
                    ],
                },
            ]
    elif action_id == "cancel_announcement":
        updated_blocks = [
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": f"❌ *Announcement cancelled by @{user}*",
                },
            },
            {
                "type": "context",
                "elements": [
                    {
                        "type": "mrkdwn",
                        "text": "The announcement was not sent.",
                    },
                ],
            },
        ]
    else:
        # Fallback for unknown actions
        updated_blocks = [
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": "❓ Unknown action received",
                },
            },
        ]

    # Send the updated blocks to the response URL
    if response_url:
        try:
            response_data = {
                "replace_original": "true",
                "blocks": updated_blocks,
            }
            requests.post(response_url, json=response_data)
        except Exception as e:
            logger.error(f"Error updating message: {e}")

    # Acknowledge the request with an empty response
    return JsonResponse({})
