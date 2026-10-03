#!/bin/sh
set -eu

# Applies pending Drizzle migrations, then hands over to the server (the CMD).
#
# Migrations run here rather than in a separate job so a plain `docker compose up`
# or `docker run` always lands on a schema the code expects. Set
# RUN_MIGRATIONS=0 to skip, e.g. when running several replicas and migrating
# from a dedicated one-shot container instead.

cd /app

: "${DATABASE_URL:?DATABASE_URL is not set}"
: "${ORIGIN:?ORIGIN is not set}"

case "$(printf %s "${RUN_MIGRATIONS:-1}" | tr '[:upper:]' '[:lower:]')" in
    0 | false | no | off) run_migrations=0 ;;
    *) run_migrations=1 ;;
esac

if [ "$run_migrations" = 1 ]; then
    echo "entrypoint: applying database migrations"
    attempt=1
    max_attempts="${MIGRATION_MAX_ATTEMPTS:-10}"
    until node_modules/.bin/drizzle-kit migrate --config=drizzle.prod.config.ts; do
        if [ "$attempt" -ge "$max_attempts" ]; then
            echo "entrypoint: migrations failed after $attempt attempts, aborting" >&2
            exit 1
        fi
        echo "entrypoint: migration attempt $attempt failed, retrying in 3s" >&2
        attempt=$((attempt + 1))
        sleep 3
    done
    echo "entrypoint: migrations up to date"
else
    echo "entrypoint: RUN_MIGRATIONS=$RUN_MIGRATIONS, skipping migrations"
fi

# exec so the server becomes the process tini supervises and receives SIGTERM.
exec "$@"
