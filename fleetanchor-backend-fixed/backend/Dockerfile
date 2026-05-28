FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package.json ./

# Install dependencies - npm install not npm ci
RUN npm install --production=false

# Copy prisma schema
COPY prisma ./prisma/

# Generate Prisma client
RUN npx prisma generate

# Copy source code
COPY . .

# Expose port
EXPOSE 5000

# Start command
CMD ["sh", "-c", "npx prisma migrate deploy && node src/server.js"]