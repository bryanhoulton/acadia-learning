from typing import TYPE_CHECKING

from entities.adapters import Adapter, Tool, register_adapter
from entities.models import Document
from entities.serializers import DocumentSerializer
from utils.timezone import format_datetime_for_llm

if TYPE_CHECKING:
    from entities.runtime import EntityRuntime


MAX_DOCUMENT_LIST_LIMIT = 10


def _format_document(doc: dict) -> str:
    """Format a single document for display."""
    doc_id = doc.get("id", "unknown")
    title = doc.get("title", "(untitled)")
    content = doc.get("content", "")
    updated = doc.get("updated_at", "")

    lines = [f"• {title}"]
    lines.append(f"   document_id: {doc_id}")
    if updated:
        lines.append(f"   Updated: {updated}")
    if content:
        lines.append(f"   Content: {content}")
    return "\n".join(lines)


class CreateDocumentTool(Tool):
    name = "create_document"
    description = "Create a new document. Don't create duplicate documents."
    parameters = {
        "title": {
            "type": "string",
            "description": "The title of the document.",
        },
        "content": {
            "type": "string",
            "description": "The content of the document.",
        },
    }

    def execute(self, entity_runtime: "EntityRuntime", parameters):
        d = Document.objects.create(
            title=parameters["title"],
            content=parameters["content"],
            entity=entity_runtime.entity,
        )
        data = DocumentSerializer(d).data
        # Convert updated_at to entity timezone
        entity_timezone = entity_runtime.entity.timezone or "UTC"
        if d.updated_at:
            data["updated_at"] = format_datetime_for_llm(d.updated_at, entity_timezone)
        return data

    def format_result(self, result):
        if isinstance(result, dict):
            return f"Document created:\n{_format_document(result)}"
        return str(result)


class ListDocumentsTool(Tool):
    name = "list_documents"
    description = f"List documents with explicit pagination. Use small pages; limit must be between 1 and {MAX_DOCUMENT_LIST_LIMIT}."
    parameters = {
        "limit": {
            "type": "integer",
            "description": f"The number of documents to return, from 1 to {MAX_DOCUMENT_LIST_LIMIT}.",
            "minimum": 1,
            "maximum": MAX_DOCUMENT_LIST_LIMIT,
        },
        "offset": {
            "type": "integer",
            "description": "The offset of the documents to return.",
            "minimum": 0,
        },
    }

    def execute(self, entity_runtime: "EntityRuntime", parameters):
        if "limit" not in parameters or "offset" not in parameters:
            return {"error": "limit and offset are required"}

        limit = parameters["limit"]
        offset = parameters["offset"]
        if not isinstance(limit, int) or not isinstance(offset, int):
            return {"error": "limit and offset must be integers"}
        if limit < 1 or limit > MAX_DOCUMENT_LIST_LIMIT:
            return {"error": f"limit must be between 1 and {MAX_DOCUMENT_LIST_LIMIT}"}
        if offset < 0:
            return {"error": "offset must be greater than or equal to 0"}

        documents = Document.objects.filter(entity=entity_runtime.entity).order_by("-updated_at")[
            offset : offset + limit
        ]
        data = DocumentSerializer(documents, many=True).data
        # Convert updated_at to entity timezone
        entity_timezone = entity_runtime.entity.timezone or "UTC"
        for i, doc in enumerate(documents):
            if doc.updated_at:
                data[i]["updated_at"] = format_datetime_for_llm(doc.updated_at, entity_timezone)
        return data

    def format_result(self, result):
        if isinstance(result, list):
            if not result:
                return "No documents found."

            lines = [f"DOCUMENTS ({len(result)} found)", "─" * 40]
            for doc in result:
                lines.append(_format_document(doc))
                lines.append("")
            return "\n".join(lines)
        return str(result)


class UpdateDocumentTool(Tool):
    name = "update_document"
    description = "Update an existing document."
    parameters = {
        "document_id": {
            "type": "string",
            "description": "The ID of the document to update.",
        },
        "title": {
            "type": "string",
            "description": "The title of the document.",
        },
        "content": {
            "type": "string",
            "description": "The content of the document.",
        },
    }

    def execute(self, entity_runtime: "EntityRuntime", parameters):
        d = Document.objects.get(id=parameters["document_id"], entity=entity_runtime.entity)
        d.title = parameters["title"]
        d.content = parameters["content"]
        d.save()
        data = DocumentSerializer(d).data
        # Convert updated_at to entity timezone
        entity_timezone = entity_runtime.entity.timezone or "UTC"
        if d.updated_at:
            data["updated_at"] = format_datetime_for_llm(d.updated_at, entity_timezone)
        return data

    def format_result(self, result):
        if isinstance(result, dict):
            return f"Document updated:\n{_format_document(result)}"
        return str(result)


class DeleteDocumentTool(Tool):
    name = "delete_document"
    description = "Delete a document."
    parameters = {
        "document_id": {
            "type": "string",
            "description": "The ID of the document to delete.",
        },
    }

    def execute(self, entity_runtime: "EntityRuntime", parameters) -> str:
        d = Document.objects.get(id=parameters["document_id"], entity=entity_runtime.entity)
        d.delete()
        return "Document deleted."


@register_adapter
class DocumentAdapter(Adapter):
    name = "documents"
    description = """
    Allows you to create, list, update, and delete documents. These documents will be available to you
    during live lessons, while most other tools will not. You should use documents for things like lesson
    plans, practice problems, and other artifacts that you want to keep track of or bring into lessons.

    You frequently overestimate the amount of time content will take to complete in a lesson. Lessons plans
    should include a large buffer of extra content in case the lesson goes quickly.

    Documents are completely private to you. They are not shared with the user or other entities.
    """
    tools = [CreateDocumentTool(), ListDocumentsTool(), UpdateDocumentTool(), DeleteDocumentTool()]
