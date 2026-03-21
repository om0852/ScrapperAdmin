# Multi-stage build for optimal image size
FROM node:18-alpine AS base

# Install dependencies for Playwright (browser automation)
RUN apk add --no-cache \
    chromium \
    firefox \
    dumb-init \
    python3 \
    make \
    g++ \
    libc6-compat

ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV CHROMIUM_PATH=/usr/bin/chromium-browser

WORKDIR /app

# Stage 1: Install dependencies
FROM base AS deps
COPY package*.json ./
RUN npm ci --only=production && \
    npm cache clean --force

# Stage 2: Install dev dependencies for development image
FROM base AS dev-deps
COPY package*.json ./
RUN npm ci && \
    npm cache clean --force

# Stage 3: Development image
FROM base AS development
COPY --from=dev-deps /app/node_modules ./node_modules
COPY . .

EXPOSE 7000 3088 3089 3090 3091 3092

ENV NODE_ENV=development
ENV PORT=7000

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["npm", "start"]

# Stage 4: Production image (uses remote MongoDB)
FROM base AS production
COPY --from=deps /app/node_modules ./node_modules
COPY . .

EXPOSE 7000 3088 3089 3090 3091 3092

ENV NODE_ENV=production
ENV PORT=7000

# MongoDB URI will be injected via environment variables
# No healthcheck since MongoDB is external

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["npm", "start"]
