# Stage 1: Build the Vite app
FROM node:20-slim AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Accept build arguments for environment variables
# These override values in .env.production when provided
ARG VITE_API_URL
ARG VITE_GOOGLE_MAPS_API_KEY

# Build for production
# Only export ARGs as env vars if they have non-empty values
# This prevents empty ARGs from overriding .env.production values
RUN if [ -n "$VITE_API_URL" ]; then export VITE_API_URL="$VITE_API_URL"; fi && \
    if [ -n "$VITE_GOOGLE_MAPS_API_KEY" ]; then export VITE_GOOGLE_MAPS_API_KEY="$VITE_GOOGLE_MAPS_API_KEY"; fi && \
    npm run build

# Stage 2: Serve with nginx
FROM nginx:alpine

# Copy built files to nginx
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Cloud Run requires port 8080
EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
