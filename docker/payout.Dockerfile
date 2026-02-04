FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json* ./
COPY apps/payout/package.json ./apps/payout/package.json
COPY packages/db/package.json ./packages/db/package.json

RUN npm ci --omit=dev

COPY apps ./apps
COPY packages ./packages

WORKDIR /app/apps/payout
# Default to participation payout - override in docker-compose for curated
CMD ["npm","run","participation"]
