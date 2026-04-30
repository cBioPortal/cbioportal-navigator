# Build stage - run on host platform; output is platform-independent JS
FROM --platform=$BUILDPLATFORM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci --ignore-scripts

COPY . .

RUN npm run build

# Prod deps stage - run on host platform to avoid QEMU crash on arm64
FROM --platform=$BUILDPLATFORM node:22-alpine AS prod-deps

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci --omit=dev --ignore-scripts

# Production stage - target platform; no npm ci needed
FROM node:22-alpine

WORKDIR /app

COPY package.json ./
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

ENV NODE_ENV=production
ENV MCP_TRANSPORT=http

EXPOSE 8002

CMD ["node", "dist/index.js"]
