# Libiamo production image.
#
# One process: the SvelteKit adapter-node server on :3000. TLS, compression and
# routing belong to whatever reverse proxy sits in front of it.

ARG NODE_VERSION=22.23.4

FROM node:${NODE_VERSION}-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app

# --- Full dependency tree, used only to build ---------------------------------
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# --- Production dependency tree, shipped in the final image -------------------
# drizzle-kit is a runtime dependency because the entrypoint applies migrations.
FROM base AS prod-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile

# --- Build --------------------------------------------------------------------
FROM base AS build

# SvelteKit's post-build analysis imports server modules, and $lib/server/db
# throws at module scope when DATABASE_URL is absent. These placeholders satisfy
# that import only: everything real is read through $env/dynamic/private at
# runtime, and the postgres client does not connect until it is queried. Nothing
# here is baked into the output.
ENV DATABASE_URL=postgres://build:build@127.0.0.1:5432/build
ENV ORIGIN=http://localhost:3000
ENV BETTER_AUTH_SECRET=build-time-placeholder-not-used-at-runtime

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

# --- Runtime ------------------------------------------------------------------
FROM node:${NODE_VERSION}-alpine AS runtime

# tini reaps zombies and forwards signals so `docker stop` triggers SvelteKit's
# graceful shutdown hook rather than a SIGKILL.
RUN apk add --no-cache tini

WORKDIR /app

COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/build ./build
COPY --chown=node:node drizzle ./drizzle
COPY --chown=node:node drizzle.prod.config.ts package.json ./
COPY --chown=node:node deploy/docker-entrypoint.sh ./deploy/docker-entrypoint.sh

RUN chmod +x ./deploy/docker-entrypoint.sh

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
# adapter-node otherwise caps request bodies at 512K.
ENV BODY_SIZE_LIMIT=20M

# The stock `node` user (uid/gid 1000) owns everything above.
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--", "/app/deploy/docker-entrypoint.sh"]
CMD ["node", "build/index.js"]
