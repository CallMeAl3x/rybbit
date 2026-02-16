# syntax=docker/dockerfile:1

FROM node:20-alpine AS base

# Build shared package
FROM base AS shared-builder
WORKDIR /app/shared
COPY shared/ ./
RUN npm install && npm run build

# Build server
FROM base AS server-builder
WORKDIR /app
COPY --from=shared-builder /app/shared ./shared
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci
COPY server/ .
RUN npm run build

# Build client
FROM base AS client-builder
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY --from=shared-builder /app/shared ./shared
WORKDIR /app/client
COPY client/package.json client/package-lock.json* ./
RUN npm ci --legacy-peer-deps
COPY client/ .

# Next.js build args and env vars
ENV NEXT_TELEMETRY_DISABLED=1
ARG NEXT_PUBLIC_BACKEND_URL
ARG NEXT_PUBLIC_DISABLE_SIGNUP
ARG NEXT_PUBLIC_CLOUD
ENV NEXT_PUBLIC_BACKEND_URL=${NEXT_PUBLIC_BACKEND_URL}
ENV NEXT_PUBLIC_DISABLE_SIGNUP=${NEXT_PUBLIC_DISABLE_SIGNUP}
ENV NEXT_PUBLIC_CLOUD=${NEXT_PUBLIC_CLOUD}

RUN npm run build

# Runtime image
FROM base AS runtime

WORKDIR /app

# Install PostgreSQL client for server mode
RUN apk add --no-cache postgresql-client

# Copy server files
COPY --from=server-builder /app/server/package*.json ./server/
COPY --from=server-builder /app/server/GeoLite2-City.mmdb ./server/GeoLite2-City.mmdb
COPY --from=server-builder /app/server/dist ./server/dist
COPY --from=server-builder /app/server/node_modules ./server/node_modules
COPY --from=server-builder /app/server/docker-entrypoint.sh /docker-entrypoint.sh
COPY --from=server-builder /app/server/drizzle.config.ts ./server/drizzle.config.ts
COPY --from=server-builder /app/server/public ./server/public
COPY --from=server-builder /app/server/src ./server/src
COPY --from=shared-builder /app/shared ./shared

# Copy client files
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
COPY --from=client-builder /app/client/public ./client/public
RUN mkdir -p ./client/.next && chown nextjs:nodejs ./client/.next
COPY --from=client-builder --chown=nextjs:nodejs /app/client/.next/standalone ./client/
COPY --from=client-builder --chown=nextjs:nodejs /app/client/.next/static ./client/.next/static

# Make the entrypoint executable
RUN chmod +x /docker-entrypoint.sh

# Expose both ports
EXPOSE 3001 3002

# Install su-exec for user switching
RUN apk add --no-cache su-exec

# Copy the startup script
COPY start.sh /start.sh
RUN chmod +x /start.sh

ENTRYPOINT ["/start.sh"]