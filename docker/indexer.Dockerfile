FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
COPY apps ./apps
COPY packages ./packages
RUN npm ci || npm install
WORKDIR /app/apps/indexer
CMD ["npm","run","start"]
