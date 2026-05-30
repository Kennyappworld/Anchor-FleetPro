FROM node:20-slim

RUN apt-get update -y && \
    apt-get install -y openssl ca-certificates && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Step 1: Copy only what's needed for install + generate
COPY package*.json ./
COPY prisma ./prisma/

# Step 2: Install dependencies (this downloads the binary for linux)
RUN npm install --legacy-peer-deps

# Step 3: Generate Prisma Client (binary is now available for linux)
RUN npx prisma generate

# Step 4: Copy application source (does NOT overwrite node_modules)
COPY src ./src
COPY nixpacks.toml ./
COPY railway.toml ./
COPY railway.json ./

EXPOSE 5000

CMD ["sh", "-c", "npx prisma db push --accept-data-loss && node src/server.js"]
