# Production image: a self-contained Next.js server (output: "standalone").
# Build:   docker build -t service-platform .
# Migrate: docker build --target migrate -t service-platform-migrate . && docker run --rm -e DATABASE_URL=... service-platform-migrate
# Run:     docker run -p 3000:3000 -e DATABASE_URL=... service-platform

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
COPY . .
ENV NEXT_OUTPUT=standalone
RUN npm run build

# One-off release step: applies pending migrations, then exits.
FROM deps AS migrate
COPY db ./db
COPY scripts ./scripts
COPY src ./src
COPY tsconfig.json ./
CMD ["npx", "tsx", "scripts/migrate.ts"]

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "server.js"]
