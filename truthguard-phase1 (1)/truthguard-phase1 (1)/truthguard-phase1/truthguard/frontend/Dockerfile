# ==============================================================================
# TruthGuard AI Frontend Production Dockerfile
# Multi-stage build: Vite Compilation -> Nginx Alpine Edge Serving
# ==============================================================================

# Stage 1: Build Vite Bundle
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# Stage 2: Serve with Nginx Alpine
FROM nginx:1.27-alpine AS runner

# Remove default nginx website
RUN rm -rf /usr/share/nginx/html/*

# Copy built frontend assets
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy production nginx configuration
COPY nginx.conf /etc/nginx/nginx.conf

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost/ || exit 1

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
