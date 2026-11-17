# Freefield web UI + API (server/server.ts). The GPU backend stays on Modal; this image needs Node and ffmpeg.
FROM node:22-slim
# ffmpeg/ffprobe: long clips are cut into pieces and joined (server/chunked.ts)
# (time-outs and retries: a stalled mirror connection hung the first build for 20+ minutes)
RUN apt-get -o Acquire::Retries=5 -o Acquire::http::Timeout=30 update \
 && apt-get -o Acquire::Retries=5 -o Acquire::http::Timeout=30 install -y --no-install-recommends ffmpeg \
 && apt-get clean
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
