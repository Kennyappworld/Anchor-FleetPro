FROM node:20-slim AS base

RUN apt-get update -y && \
    apt-get install -y openssl ca-certificates && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/

RUN npm install --legacy-peer-deps

RUN npx prisma generate

COPY . .

EXPOSE 5000

CMD ["sh", "-c", "npx prisma db push --accept-data-loss && node src/server.js"]
