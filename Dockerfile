# DIAGNOS CRM — obraz produkcyjny (jeden proces: API + zbudowany interfejs + zadania w tle)
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:22-bookworm-slim
ENV NODE_ENV=production \
    TZ=Europe/Warsaw \
    PORT=3000 \
    DIAGNOS_DATA_DIR=/data \
    DIAGNOS_CLIENT_DIR=/app/dist/client \
    DIAGNOS_ASSETS_DIR=/app/server/assets
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY server/assets ./server/assets
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--disable-warning=ExperimentalWarning", "dist/server/index.js"]
