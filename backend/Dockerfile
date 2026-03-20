# Stage 1: Build
FROM node:20-alpine AS build

RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/

RUN npm run build

# Stage 2: Production
FROM node:20-alpine

RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm install tsx

COPY --from=build /app/dist ./dist
COPY src/ ./src/

COPY entrypoint.sh ./
RUN chmod +x entrypoint.sh

RUN mkdir -p /app/data

EXPOSE 3000

ENTRYPOINT ["./entrypoint.sh"]
