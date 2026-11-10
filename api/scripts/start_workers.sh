#!/bin/bash

# Set defaults if not provided
CONCURRENCY=${CELERY_CONCURRENCY:-16}
MAX_MEMORY=${CELERY_MAX_MEMORY_PER_CHILD:-256000} # 256MB in KB
MAX_TASKS=${CELERY_MAX_TASKS_PER_CHILD:-50}

echo "Starting Celery workers with:"
echo "  Concurrency: $CONCURRENCY"
echo "  Max memory per child: ${MAX_MEMORY}KB"
echo "  Max tasks per child: $MAX_TASKS"

uv run celery -A api worker \
  --loglevel=info \
  --concurrency=$CONCURRENCY \
  --max-memory-per-child=$MAX_MEMORY \
  --max-tasks-per-child=$MAX_TASKS \
  --prefetch-multiplier=1