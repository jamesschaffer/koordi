# Use nginx to serve static files
FROM nginx:alpine

# Copy the marketing site files to nginx html directory
COPY index.html /usr/share/nginx/html/
COPY privacy-policy.html /usr/share/nginx/html/
COPY terms-of-service.html /usr/share/nginx/html/
COPY css/ /usr/share/nginx/html/css/
COPY images/ /usr/share/nginx/html/images/

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Cloud Run requires port 8080
EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
