FROM node:22-slim

# Install poppler-utils (pdftoppm) for PDF-to-image rendering in the KINGA pipeline
RUN apt-get update && apt-get install -y --no-install-recommends \
    poppler-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy everything (patches dir must be present before pnpm install)
COPY . .

# Install dependencies and build
RUN npm install -g corepack@latest && corepack pnpm install && corepack pnpm run build

ENV NODE_ENV=production

CMD ["node", "dist/index.js"]
