# Build stage
FROM node:26.10.0-alpine3.24@sha256:0b36e8c136b94cd4fcf02188228e76c31ad5872eef3fec8cbd2eee500cfd9e80 AS builder
WORKDIR /app

# Install dependencies
COPY package*.json .npmrc ./
RUN npm ci

# Copy source
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build the app
RUN npm run build

# Runner stage
FROM dhi.io/node:26.10.0-debian13@sha256:29d425d096403cca2750ee83fa31e4a6f25a73ea78089382578053d1682afaff AS runner
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