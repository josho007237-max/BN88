
codex/analyze-bn88-project-structure-and-workflow-s9ghbu
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


# ---------- build stage ----------
FROM node:18-alpine AS build

WORKDIR /usr/src/app

# ติดตั้ง dependency สำหรับ build
COPY package*.json ./
RUN npm ci

# คัดลอกซอร์สทั้งหมด
COPY . .

# build โปรเจกต์ (ต้องมี script "build" ใน package.json)
RUN npm run build

# ---------- runtime stage ----------
FROM node:18-alpine AS runtime

WORKDIR /usr/src/app
ENV NODE_ENV=production

# คัดลอกไฟล์ build ที่จำเป็น
COPY --from=build /usr/src/app/dist ./dist

# คัดลอก package*.json เพื่อติดตั้ง dependency สำหรับ production
COPY package*.json ./
RUN npm ci --only=production

# เปิด port ที่ app ใช้งาน
EXPOSE 8080

# คำสั่งรันหลักของ container

main
CMD ["node", "dist/server.js"]
