FROM node:22-slim

# Install PDF conversion and the explicit system Chromium binary used by
# server/reporting/pdfRenderer.ts. Render therefore does not depend on a
# browser supplied by Manus or a Puppeteer download at runtime.
RUN apt-get update && apt-get install -y --no-install-recommends \
    poppler-utils \
    chromium \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy everything (patches dir must be present before pnpm install)
COPY . .

# Install dependencies and build
RUN npm install -g corepack@latest && corepack pnpm install && corepack pnpm run build

ENV NODE_ENV=production

CMD ["node", "dist/index.js"]
