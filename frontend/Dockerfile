FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci

# Copy application code
COPY . .

# Expose port
EXPOSE 3000

# Start in development mode (simpler for self-hosted)
# For production, you'd need to add Suspense boundaries to all pages using useSearchParams
CMD ["npm", "run", "dev"]
