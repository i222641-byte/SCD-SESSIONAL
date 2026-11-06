# FastBite inventory-service
# Small, pinned base image; production dependencies only; no secrets baked in.
FROM node:20-alpine

ENV NODE_ENV=production \
    PORT=3003
WORKDIR /app

# Install dependencies first (cached layer), exactly as locked in package-lock.json
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Application code
COPY index.js ./

# Do not run as root
USER node

EXPOSE 3003
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3003/health || exit 1

CMD ["node", "index.js"]
