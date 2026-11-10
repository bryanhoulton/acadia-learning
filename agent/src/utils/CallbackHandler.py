from asyncio import iscoroutinefunction
from typing import Any, Awaitable, Callable

Callback = Callable[[Any], None | Awaitable[None]]


class CallbackHandler:
    def __init__(self):
        self.callbacks: dict[str, Callback] = {}

    def register(self, id: str, callback: Callback):
        self.callbacks[id] = callback

    def unregister(self, id: str):
        del self.callbacks[id]

    async def emit(self, data: Any):
        for callback in self.callbacks.values():
            if iscoroutinefunction(callback):
                await callback(data)  # type: ignore
            else:
                callback(data)
