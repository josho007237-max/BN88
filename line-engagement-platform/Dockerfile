# Dockerfile
FROM node:18-alpine AS base
WORKDIR /usr/src/app
ENV NODE_ENV=production

# install postgres client for pg_isready
RUN apk add --no-cache postgresql-client

COPY package*.json ./
RUN npm ci --production

COPY . .

FROM node:18-alpine AS build
WORKDIR /usr/src/app
COPY --from=base /usr/src/app ./
RUN npm ci
RUN npm run build

FROM node:18-alpine AS runtime
WORKDIR /usr/src/app
ENV NODE_ENV=production
COPY --from=build /usr/src/app/dist ./dist
COPY package*.json ./
RUN npm ci --production
EXPOSE 8080
CMD ["node", "dist/server.js"]
