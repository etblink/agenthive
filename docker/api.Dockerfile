FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production

# Cache-friendly dependency layer:
# copy only manifests first, install, then copy the full source.
COPY package.json package-lock.json* ./
COPY apps/api/package.json ./apps/api/package.json
COPY packages/db/package.json ./packages/db/package.json

# Deterministic install: fail if lockfile is out of sync.
RUN npm ci --omit=dev

# Now copy source.
COPY apps ./apps
COPY packages ./packages

WORKDIR /app/apps/api
EXPOSE 3001
CMD ["npm","run","start"]
