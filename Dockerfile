# Use Node.js base image
FROM node:18-slim

# Install Chromium
RUN apt-get update && apt-get install -y chromium

# Tell puppeteer/whatsapp-web.js where Chromium is
ENV CHROMIUM_PATH=/usr/bin/chromium

# Set working directory
WORKDIR /app

# Copy dependencies first (faster build)
COPY package*.json ./
RUN npm install

# Copy app code
COPY . .

# Start server
CMD ["node", "index.js"]
