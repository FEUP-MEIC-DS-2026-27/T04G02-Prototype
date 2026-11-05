FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

ENV PORT=8010 \
    KAFKA_BROKERS=project-status-kafka:29092 \
    CORS_ORIGINS=http://localhost:3000,http://localhost:3003,http://localhost:3005

EXPOSE 8010
CMD ["node", "server.js"]
