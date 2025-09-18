# Use a multi-stage build: builder stage runs the Vite build, runner stage serves static files
FROM node:22-bullseye AS builder

WORKDIR /app

# Allow overriding the V8 max-old-space size at build time
ARG MAX_OLD_SPACE=4096
ENV NODE_OPTIONS="--max-old-space-size=${MAX_OLD_SPACE}"

# Copy package manifests first to leverage Docker cache
COPY package*.json ./
COPY package-lock.json* yarn.lock* pnpm-lock.yaml* ./

# Install all deps (dev deps needed for build)
RUN npm ci --prefer-offline --no-audit --progress=false

# Copy source
COPY . .

# Run the build using node so the max-old-space-size flag is applied reliably
RUN node --max-old-space-size=${MAX_OLD_SPACE} ./node_modules/vite/bin/vite build

# Production runner: serve static files with nginx
FROM nginx:stable-alpine AS runner

COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
