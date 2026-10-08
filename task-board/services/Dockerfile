# One image, three services: docker-compose picks which one with `command`.
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev
COPY src ./src
COPY rules.json ./rules.json
USER node
CMD ["node", "src/outbox-relay.js"]
