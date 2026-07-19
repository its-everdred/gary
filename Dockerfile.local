# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root package files
COPY package.json ./

# Copy bot app files
COPY apps/bot/package.json apps/bot/package-lock.json ./apps/bot/
COPY apps/bot/prisma ./apps/bot/prisma/
COPY apps/bot/src ./apps/bot/src/
COPY apps/bot/tsconfig.json ./apps/bot/

# Install dependencies and build
WORKDIR /app/apps/bot
RUN npm ci
RUN npx prisma generate
RUN npm run build

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

# Install only production dependencies
COPY apps/bot/package.json apps/bot/package-lock.json ./
RUN npm ci --only=production

# Copy prisma schema and generate client
COPY apps/bot/prisma ./prisma/
RUN npx prisma generate

# Copy built files from builder
COPY --from=builder /app/apps/bot/dist ./dist/

# Set environment
ENV NODE_ENV=production

# Run the bot
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
