# Stage 1: Build Frontend and Backend
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root package.json and package-lock.json
COPY package.json package-lock.json ./

# Copy workspace package.json files
COPY backend/package.json backend/
COPY backend/frontend/package.json backend/frontend/

# Install dependencies for all workspaces
RUN npm ci

# Copy the rest of the application code
COPY . .

# Build frontend and backend
RUN npm run build

# Stage 2: Production Setup
FROM node:20-alpine

WORKDIR /app

# Set node environment to production
ENV NODE_ENV=production

# Copy root package.json and package-lock.json
COPY package.json package-lock.json ./

# Copy workspace package.json files
COPY backend/package.json backend/
COPY backend/frontend/package.json backend/frontend/

# Install only production dependencies
RUN npm ci --omit=dev

# Copy the built backend
COPY --from=builder /app/backend/dist ./backend/dist

# Copy the built frontend
COPY --from=builder /app/backend/frontend/dist ./backend/frontend/dist

# Expose the API port
EXPOSE 5000

# Command to run the backend server using the workspace script
CMD ["npm", "start"]
