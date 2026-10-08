# Build stage
FROM dhi.io/node:26.10.0-alpine3.24-dev@sha256:62b5dbaa16acf23a35f3801a40c2916f95fbf09806838a230907033d46c9944e AS builder
WORKDIR /app

# Install dependencies (the postinstall hook runs `prisma generate`, so it needs the schema)
COPY package*.json .npmrc prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci

# Copy source
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build the app
RUN npm run build

# Runner stage
FROM dhi.io/node:26.10.0-debian13@sha256:2ae29c7b39b5f87a97d4edf69f4930a7f15eb3eb2bfc5b4f56a65fbc4afb6eb6 AS runner
WORKDIR /app

# Set environment variables
ENV NODE_ENV=production
ENV PORT=8080

# Copy necessary files from builder
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

USER node

# Expose port
EXPOSE 8080

# Start the app
CMD ["node", "server.js"]