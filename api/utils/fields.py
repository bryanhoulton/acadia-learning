"""
Custom Django fields for block-related data.
"""

import logging

from pgvector.django import VectorField


class AutoEmbeddingField(VectorField):
    """
    A VectorField that automatically generates embeddings based on a source field.

    This field automatically generates OpenAI embeddings when:
    - The instance is created for the first time
    - The source field value changes

    Usage:
        embedding = AutoEmbeddingField(source_field='description', dimensions=1536)
    """

    def __init__(self, source_field=None, *args, **kwargs):
        """
        Initialize the AutoEmbeddingField.

        Args:
            source_field: The name of the field to generate embeddings from
            *args, **kwargs: Arguments passed to VectorField
        """
        if source_field is None:
            raise ValueError("source_field is required for AutoEmbeddingField")

        self.source_field = source_field

        # Set default values for embedding field
        kwargs.setdefault("dimensions", 1536)
        kwargs.setdefault("blank", True)
        kwargs.setdefault("null", True)
        kwargs.setdefault("help_text", "OpenAI embedding vector for semantic similarity")

        super().__init__(*args, **kwargs)

    def contribute_to_class(self, cls, name, **kwargs):
        """
        Add the field to the model class and set up the auto-embedding behavior.
        """
        super().contribute_to_class(cls, name, **kwargs)

        # Store the embedding field name on the class for use in pre_save
        if not hasattr(cls, "_auto_embedding_fields"):
            cls._auto_embedding_fields = {}
        cls._auto_embedding_fields[name] = self.source_field

        # Connect the pre_save signal to handle embedding generation
        from django.db.models.signals import pre_save
        from django.dispatch import receiver

        # Create a unique receiver for this field on this model
        signal_uid = f"{cls._meta.label_lower}_{name}_auto_embedding"

        @receiver(pre_save, sender=cls, dispatch_uid=signal_uid)
        def auto_generate_embedding(sender, instance, **kwargs):
            """Generate embedding automatically before saving."""
            self._generate_embedding_if_needed(instance, name)

    def _generate_embedding_if_needed(self, instance, field_name):
        """
        Generate embedding if needed based on source field changes.

        Args:
            instance: The model instance being saved
            field_name: The name of the embedding field
        """
        source_field = self.source_field
        source_value = getattr(instance, source_field, None)
        current_embedding = getattr(instance, field_name, None)

        should_update_embedding = False

        # Always generate embedding if it doesn't exist and source has value
        if source_value and current_embedding is None:
            should_update_embedding = True
        # Check if source field changed for existing instances
        elif instance.pk is not None:
            try:
                old_instance = instance.__class__.objects.get(pk=instance.pk)
                old_source_value = getattr(old_instance, source_field, None)
                if old_source_value != source_value:
                    should_update_embedding = True
            except instance.__class__.DoesNotExist:
                # Instance doesn't exist in DB yet, treat as new
                should_update_embedding = True

        if should_update_embedding:
            embedding = self._generate_embedding(source_value, instance, field_name)
            setattr(instance, field_name, embedding)

    def _generate_embedding(self, text, instance, field_name):
        """
        Generate OpenAI embedding for the given text.

        Args:
            text: The text to generate embedding for
            instance: The model instance (for error logging)
            field_name: The name of the embedding field (for error logging)

        Returns:
            The generated embedding vector or None if generation fails
        """
        try:
            from utils.llms import embed

            return embed(text)
        except Exception as e:
            logger = logging.getLogger(__name__)
            model_name = instance.__class__.__name__
            instance_str = str(instance) if hasattr(instance, "__str__") else f"{model_name} instance"
            logger.error(f"Error generating embedding for {instance_str} field '{field_name}': {str(e)}")
            return None

    def deconstruct(self):
        """Return a tuple of arguments to recreate this field."""
        name, path, args, kwargs = super().deconstruct()
        kwargs["source_field"] = self.source_field
        return name, path, args, kwargs
