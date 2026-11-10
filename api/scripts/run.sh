#!/bin/bash

# Exit on error
set -e

# Load environment variables
if [ -f .env ]; then
  export $(cat .env | grep -v '^#' | xargs)
fi

# Set environment to production
export DJANGO_SETTINGS_MODULE=api.settings
export DEBUG=False

echo "Installing dependencies..."
pip install -r requirements.txt

echo "Collecting static files..."
python manage.py collectstatic --noinput

echo "Applying database migrations..."
python manage.py migrate --noinput

echo "Starting server..."
# Using Gunicorn to run the application in production
gunicorn api.wsgi:application --bind 0.0.0.0:${PORT:-8000} --workers=${WORKERS:-4} --timeout=${TIMEOUT:-120} --log-level=info
