FROM node:22-alpine
WORKDIR /app
COPY package.json server.js ./
COPY lib ./lib
COPY public ./public
COPY data/seed-events.json data/sources.json ./data/
ENV NODE_ENV=production DATA_DIR=/tmp/cosmoa PORT=7860
EXPOSE 7860
CMD ["node", "server.js"]
