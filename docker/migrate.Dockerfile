FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
COPY apps ./apps
COPY packages ./packages
COPY migrations ./migrations
RUN npm ci || npm install
CMD ["npm","run","db:migrate"]
