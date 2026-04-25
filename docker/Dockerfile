# ---- Base ----
FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache dumb-init

# ---- Dependencies ----
FROM base AS deps
COPY package*.json ./
RUN npm ci --only=production && cp -R node_modules /tmp/prod_modules
RUN npm ci

# ---- Builder ----
FROM deps AS builder
COPY tsconfig*.json ./
COPY src ./src
RUN npm run build

# ---- Production ----
FROM base AS production
ENV NODE_ENV=production
COPY --from=builder /app/dist ./dist
COPY --from=deps /tmp/prod_modules ./node_modules
COPY package.json ./

# Non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

EXPOSE 3000 3001

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]
