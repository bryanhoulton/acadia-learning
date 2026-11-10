# API Server Setup

## Prerequisites

1.  **Postgres**: Ensure your Postgres Docker container is running.
    first start the postgres container:
    ```bash
    docker run --name acadia-postgres \
      -e POSTGRES_PASSWORD=postgres \
      -e POSTGRES_USER=postgres \
      -e POSTGRES_DB=postgres \
      -p 5432:5432 \
      -d pgvector/pgvector:0.8.1-pg17-trixie
    ```
    
    If you already have the container created, you can just start it:
    ```bash
    docker start acadia-postgres
    ```

## Installation

Install dependencies using `uv`:

```bash
uv sync
```

## Database Migrations

If there are any database schema changes, run migrations:

```bash
uv run manage.py migrate
```

## Running the Server

Start the development server:

```bash
uv run manage.py runserver
```
