FROM nginx:stable-alpine

# Copy prebuilt static site
COPY dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
