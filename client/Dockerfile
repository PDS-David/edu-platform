# ── Stage 1: build React app ──────────────────────────────────────────────────
FROM node:22-alpine AS builder

# Increase Node heap for esbuild/Rollup on the shared 4GB VPS.
# manualChunks (which reduced peak build memory by splitting the bundle)
# was reverted — it caused two separate "React is not defined" incidents,
# via module-init-order bugs and stale-chunk-reference issues after a
# deploy changes the chunk graph. See client/vite.config.js for details.
# Building as a single ~1.7-2MB+ bundle again needs more heap room than
# the chunked build did, hence the bump from 2048 to 3584.
#
# NOTE: this VPS runs api + api_staging + web + web_staging + caddy + redis
# concurrently (see docker-compose.yml). --max-old-space-size is a CEILING
# on what Node may use, not a reservation — it only helps if the host
# actually has that much physical RAM free when the build runs. If OOM
# crashes recur after this change, the next things to try, in order, are:
#   1. Bump this further (headroom permitting).
#   2. Stop the *_staging containers for the duration of `docker compose
#      build` in deploy.sh, freeing several hundred MB on the host.
#   3. Upsize the VPS — splitting the bundle to dodge a memory ceiling
#      caused more total engineering cost this week than the ceiling itself.
ENV NODE_OPTIONS="--max-old-space-size=3584"

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build

# ── Stage 2: serve built assets with nginx ────────────────────────────────────
FROM nginx:1.27-alpine AS runner

RUN rm /etc/nginx/conf.d/default.conf

COPY nginx-spa.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/health.txt || exit 1

CMD ["nginx", "-g", "daemon off;"]
