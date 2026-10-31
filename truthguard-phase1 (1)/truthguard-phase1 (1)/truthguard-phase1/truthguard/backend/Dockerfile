# ==============================================================================
# TruthGuard AI Backend Production Dockerfile
# Multi-stage, minimal attack surface, non-root user execution
# ==============================================================================

FROM node:20-alpine AS base
WORKDIR /app

# Install system dependencies for media processing if required
RUN apk add --no-cache curl ffmpeg

# ------------------------------------------------------------------------------
# Dependencies Layer
# ------------------------------------------------------------------------------
FROM base AS dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# ------------------------------------------------------------------------------
# Production Runtime Image
# ------------------------------------------------------------------------------
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000

# Create uploads directory and set permissions
RUN mkdir -p /app/uploads/videos /app/uploads/keyframes && \
    chown -R node:node /app

# Copy production node_modules and application code
COPY --from=dependencies /app/node_modules ./node_modules
COPY --chown=node:node . .

# Switch to unprivileged user
USER node

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:4000/api/health || exit 1

EXPOSE 4000

CMD ["node", "src/server.js"]
