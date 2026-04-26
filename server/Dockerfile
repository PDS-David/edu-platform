# ═══════════════════════════════════════════════════════════════════════════════
# AISchoolonair — Server (Node/Express) production image
#
# Multi-stage build:
#   deps   → install only production npm deps (no dev tools in final image)
#   runner → lean runtime image, non-root user, healthcheck
# ═══════════════════════════════════════════════════════════════════════════════

# ── Stage 1: install production dependencies ──────────────────────────────────
FROM node:22-alpine AS deps

WORKDIR /app

# Native addons (bcryptjs uses pure-JS but other deps may need build tools)
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ── Stage 2: lean production image ────────────────────────────────────────────
FROM node:22-alpine AS runner

# ffmpeg — required by fluent-ffmpeg for HLS video processing
RUN apk add --no-cache ffmpeg wget

WORKDIR /app

# Copy production node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy application source (uploads/ and logs/ are excluded via .dockerignore)
COPY . .

# Create runtime directories — volume mounts will overlay uploads/ in prod
RUN mkdir -p uploads/resources \
             uploads/past-papers \
             uploads/videos/raw \
             uploads/videos/hls \
             logs

# Non-root user — never run Node as root in production
RUN addgroup -S appgroup && adduser -S appuser -G appgroup \
 && chown -R appuser:appgroup /app

USER appuser

ENV NODE_ENV=production
ENV PORT=5000

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:5000/health || exit 1

CMD ["node", "server.js"]
