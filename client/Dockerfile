# ── Stage 1: build React app ──────────────────────────────────────────────────
FROM node:22-alpine AS builder

# Increase Node heap so esbuild/Rollup can handle large bundles without OOM.
# Default is ~1.5GB which is too small for this bundle on a 4GB shared VPS.
ENV NODE_OPTIONS="--max-old-space-size=3072"

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
