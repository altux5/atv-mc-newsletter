# syntax=docker/dockerfile:1

# Single-stage image: a Node server that serves the prebuilt SPA (dist/) + /api.
#
# IMPORTANT: dist/ is built LOCALLY by deploy.ps1 (npm run build) BEFORE this
# image is built, so Vite inlines build-time VITE_* vars from your local .env
# (e.g. VITE_EDITOR_EMAILS). The image deliberately does NOT rebuild the
# frontend, because .env is excluded from the build context (.dockerignore).
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

# Server code + the prebuilt frontend (committed by deploy.ps1).
COPY server ./server
COPY dist ./dist

# OpenShift runs containers as an arbitrary non-root UID in group 0.
# Make the app directory group-accessible so that UID can read/run everything.
RUN chgrp -R 0 /app && chmod -R g=u /app

EXPOSE 8080
CMD ["npm", "run", "start"]
