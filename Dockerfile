FROM nginxinc/nginx-unprivileged:stable-alpine

# Copy prebuilt static site
COPY dist /usr/share/nginx/html

# Provide an explicit config: non-root port and SPA fallback
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
