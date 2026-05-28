FROM node:20-slim

WORKDIR /app

# Install openssl for Prisma
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Copy package.json only
COPY package.json ./

# Install with flags to avoid failures
RUN npm install --legacy-peer-deps --no-optional

# Copy prisma and generate client
COPY prisma ./prisma/
RUN npx prisma generate

# Copy all source files
COPY . .

EXPOSE 5000

CMD ["sh", "-c", "npx prisma migrate deploy && node src/server.js"]