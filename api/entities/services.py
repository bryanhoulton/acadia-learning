import logging
from datetime import datetime, timedelta

from openai.types.responses import ResponseInputParam
from pytz import timezone as pytz_timezone

from entities.memory.compression import Compression
from entities.memory.context import MemoryContextBuilder
from entities.memory.summarizer import SummaryUpdater
from entities.models import Message
from utils.timezone import force_timezone

from .models import Entity

logger = logging.getLogger(__name__)


class DRMService:
    """Service class for DRM operations."""

    def __init__(self, entity_id: int, tz: str | None = None):
        self.entity_id = entity_id
        self.entity: Entity = Entity.objects.get(id=entity_id)
        self.tz = pytz_timezone(tz) if tz else pytz_timezone("UTC")

        # Delegate to memory submodule components
        self._compression = Compression(self.entity)
        self._summarizer = SummaryUpdater(self.entity)
        self._context_builder = MemoryContextBuilder(self.entity, self._compression)

    def log_messages(self, messages: ResponseInputParam, timestamp: datetime | None = None) -> None:
        """Log messages to the DRM instance.

        Note: this does NOT trigger summarization. Summaries must be current
        before any LLM call that uses ``get_memory_context``; the caller is
        responsible for invoking ``update_summaries()`` synchronously before
        building a prompt (see ``EntityRuntime._create_response``).
        """
        if timestamp is None:
            timestamp = self.entity.current_time
        timestamp = force_timezone(timestamp, self.entity.timezone)

        # Create Message objects
        message_objects = []
        for i, msg_data in enumerate(messages):
            # Force message order by adding a small delay
            modified_timestamp = timestamp + timedelta(milliseconds=i)
            message_objects.append(Message(entity=self.entity, message_data=msg_data, timestamp=modified_timestamp))

        Message.objects.bulk_create(message_objects)

    def update_summaries(self):
        """Synchronously bring all summary levels up to date.

        Must be called before any LLM call that depends on the memory
        context, since the context relies on summaries being current.
        """
        return self._summarizer.update_all(self.entity.current_time)

    def get_memory_context(self, max_tokens: int = 50000, update: bool = False) -> str:
        """Get formatted memory context.

        Args:
            max_tokens: Maximum tokens to include in the context.
            update: Whether to update summaries before building context.
                Callers that own the agent loop typically update summaries
                explicitly before each LLM call and pass ``update=False``
                here.
        """
        if update:
            self.update_summaries()
        return self._context_builder.build(max_tokens=max_tokens)
