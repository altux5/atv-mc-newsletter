# syntax=docker/dockerfile:1

# ---- build stage: compile the frontend (produces dist/) ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- runtime stage: a single Node server serving dist/ + /api ----
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
# OpenShift runs as an arbitrary UID with no home; send caches to writable /tmp.
ENV HOME=/tmp
ENV npm_config_cache=/tmp/.npm
ENV XDG_CACHE_HOME=/tmp/.cache

# Production dependencies only (includes tsx, used to run the TypeScript server).
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Server code + the prebuilt frontend from the build stage.
COPY server ./server
COPY --from=build /app/dist ./dist

# OpenShift runs containers as an arbitrary non-root UID in group 0.
# Make the app directory group-accessible so that UID can read/run everything.
RUN chgrp -R 0 /app && chmod -R g=u /app

EXPOSE 8080
CMD ["npm", "run", "start"]
