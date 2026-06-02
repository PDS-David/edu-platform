# ═══════════════════════════════════════════════════════════════════════════════
# AISchoolonair — Client (React/Vite) production image
#
# VITE_API_URL is baked into the JS bundle at build time.
# Pass it as a Docker build-arg (docker-compose handles this automatically).
# We use /api (relative path) so the SPA always calls the same origin — no
# CORS config needed and it works behind any domain.
# ═══════════════════════════════════════════════════════════════════════════════

# ── Stage 1: build React app ──────────────────────────────────────────────────
FROM node:22-alpine AS builder

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
