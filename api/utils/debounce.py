import functools

import redis
from celery import Task, shared_task
from django.conf import settings

redis_client = redis.from_url(settings.CELERY_BROKER_URL, decode_responses=True)


def debounced_wrap(func):
    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        key = kwargs.pop("key", None)  # it's required
        call_count = kwargs.pop("call_count", 1)

        if key is None:
            raise ValueError("key is required")

        count = redis_client.get(key)
        if int(count) > call_count:  # type: ignore
            # someone called the function again before the this was executed
            return None
        # I'm the last call
        return func(*args, **kwargs)

    return wrapper


def _get_key(args, kwargs, keys):
    return "_".join([str(kwargs[key]) if isinstance(key, str) else str(args[key]) for key in keys])


def debounce(keys: list[str | int], delay: int = 10):
    """
    :param func: must be the @debounced_wrap decorated with @task / @shared_task from celery
    :param key_generator: function that knows how to generate a key from
    args and kwargs passed to func or a constant str used in the cache
    key will be prepended with function module and name
    :return: function that calls apply_async on the task keep that in mind when send the arguments
    """

    def decorator(func: Task) -> Task:
        @shared_task(name=f"debounced_{func.__name__}")
        def wrapper(*args, **kwargs):
            key = _get_key(args, kwargs, keys)
            if not redis_client.get(key):
                redis_client.set(key, 0)
            call_count = redis_client.incr(key)
            task_kwargs = kwargs.copy()
            task_kwargs.update({"key": key, "call_count": call_count})
            return func.apply_async(args=args, kwargs=task_kwargs, countdown=delay)

        return wrapper

    return decorator
