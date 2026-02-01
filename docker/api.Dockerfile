FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
COPY apps ./apps
COPY packages ./packages
RUN npm ci || npm install
WORKDIR /app/apps/api
EXPOSE 3001
CMD ["npm","run","start"]
