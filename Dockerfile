# Freefield web UI + API (server/server.ts). The GPU backend stays on Modal; this image only needs Node.
FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server ./server
COPY web ./web
COPY apps ./apps
COPY packs ./packs
COPY schema ./schema
COPY lab ./lab
COPY docs ./docs
# listens on 127.0.0.1 (server default): run with the host network so nginx is a loopback peer (docker-compose.yml)
ENV FREEFIELD_OUT=/data PORT=3030
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 3030
CMD ["node", "--experimental-strip-types", "--disable-warning=ExperimentalWarning", "server/server.ts"]
