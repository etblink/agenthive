FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
COPY apps ./apps
COPY packages ./packages
COPY migrations ./migrations
# Deterministic install: fail if lockfile is out of sync.
RUN npm ci --omit=dev
CMD ["npm","run","db:migrate"]
