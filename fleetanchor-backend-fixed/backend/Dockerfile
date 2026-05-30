FROM node:20-slim

RUN apt-get update -y && \
    apt-get install -y openssl ca-certificates && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/

RUN npm install --legacy-peer-deps
RUN npx prisma generate

COPY src ./src

EXPOSE 5000

CMD ["node", "src/startup.js"]
