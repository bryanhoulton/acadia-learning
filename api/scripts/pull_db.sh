#!/usr/bin/env bash
# --- Remote credentials -------------------------------------------------
: "${DB_NAME:?Set DB_NAME}"
: "${DB_USER:?Set DB_USER}"
: "${DB_PASSWORD:?Set DB_PASSWORD}"

: "${DB_HOST:?Set the source database host}"
DB_PORT=5432

# 1. Dump remote → custom format (single compressed file)
PGPASSWORD=$DB_PASSWORD \
pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" \
        -d "$DB_NAME" --format=custom --no-owner --no-acl \
        -f /tmp/$DB_NAME.dump

# Stop and remove existing container
docker stop postgres
docker rm postgres

# Deploy new docker container with postgres
docker run -d \
  --name postgres \
  -p 5432:5432 \
  -e POSTGRES_PASSWORD=$DB_PASSWORD \
  -e POSTGRES_USER=$DB_USER \
  -e POSTGRES_DB=$DB_NAME \
  postgres
sleep 2

# Restore
PGPASSWORD=$DB_PASSWORD pg_restore -h localhost -p 5432 -U $DB_USER -d $DB_NAME /tmp/$DB_NAME.dump
echo "Done"
