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
# 0.0.0.0 inside the container; publish the port on 127.0.0.1 only and put nginx in front (docker-compose.yml)
ENV FREEFIELD_HOST=0.0.0.0 FREEFIELD_OUT=/data PORT=3000
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 3000
CMD ["node", "--experimental-strip-types", "--disable-warning=ExperimentalWarning", "server/server.ts"]
