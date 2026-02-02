FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
COPY apps ./apps
COPY packages ./packages
# Deterministic install: fail if lockfile is out of sync.
RUN npm ci --omit=dev
WORKDIR /app/apps/api
EXPOSE 3001
CMD ["npm","run","start"]
