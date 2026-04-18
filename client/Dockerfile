# ── Stage 1: build the React app ─────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# Copy source
COPY . .

# VITE_API_URL is baked in at build time.
# Pass it via --build-arg when running docker build, or set it in docker-compose.
# Example: --build-arg VITE_API_URL=https://yourdomain.com
ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build

# ── Stage 2: serve with nginx ─────────────────────────────────────────────────
FROM nginx:1.27-alpine AS runner

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy our nginx config for the React SPA
COPY nginx-spa.conf /etc/nginx/conf.d/default.conf

# Copy built React app
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost/health.txt || exit 1

CMD ["nginx", "-g", "daemon off;"]
