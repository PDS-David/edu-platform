# ── Stage 1: deps ────────────────────────────────────────────────────────────
FROM node:22-alpine AS deps

WORKDIR /app

# Install OS packages needed at build time
# python3/make/g++ are needed by some native npm addons (bcrypt etc.)
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ── Stage 2: production image ─────────────────────────────────────────────────
FROM node:22-alpine AS runner

# ffmpeg for HLS video processing
RUN apk add --no-cache ffmpeg

WORKDIR /app

# Copy node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy all server source files
COPY . .

# Create upload dirs and logs dir so the process doesn't crash on first file write
RUN mkdir -p uploads/resources uploads/past-papers uploads/videos/raw uploads/videos/hls logs

# Non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
RUN chown -R appuser:appgroup /app
USER appuser

ENV NODE_ENV=production
ENV PORT=5000

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:5000/health || exit 1

CMD ["node", "server.js"]
