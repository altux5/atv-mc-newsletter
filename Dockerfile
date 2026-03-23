FROM docker.io/node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM docker.io/nginxinc/nginx-unprivileged:stable-alpine

# Copy generated static site from the build stage
COPY --from=build /app/dist /usr/share/nginx/html

# Provide an explicit config: non-root port and SPA fallback
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
