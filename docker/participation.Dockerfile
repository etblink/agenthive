FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json* ./
COPY apps/participation/package.json ./apps/participation/package.json
COPY packages/db/package.json ./packages/db/package.json

RUN npm ci --omit=dev

COPY apps ./apps
COPY packages ./packages

WORKDIR /app/apps/participation
CMD ["npm","run","start"]
