"""
Minimal block type definitions for storage.

NOTE: The frontend (portal/src/components/playground/canvas/schema.ts) is the source of truth
for block schemas. The agent validates blocks using JSON Schema sent from the frontend.
These types are kept minimal for backward compatibility with existing database storage.
"""

from typing import Any

from pydantic import BaseModel


class Block(BaseModel):
    """A block to display on the canvas. Structure is validated by frontend schema."""

    data: dict[str, Any]
    index: int

    model_config = {"extra": "allow"}


class CanvasContent(BaseModel):
    """Canvas content containing multiple blocks. Structure is validated by frontend schema."""

    blocks: list[Block]

    model_config = {"extra": "allow"}
