FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production

# Cache-friendly dependency layer:
COPY package.json package-lock.json* ./
COPY packages/db/package.json ./packages/db/package.json

# Deterministic install: fail if lockfile is out of sync.
RUN npm ci --omit=dev

# Now copy source + migrations.
COPY apps ./apps
COPY packages ./packages
COPY migrations ./migrations

CMD ["npm","run","db:migrate"]
