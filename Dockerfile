# Use Node base image
FROM node:18-slim

# Install Chromium
RUN apt-get update && apt-get install -y chromium \
  && rm -rf /var/lib/apt/lists/*

# Set puppeteer to use installed chromium
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Set work directory
WORKDIR /

# Copy files
COPY package*.json ./
RUN npm install

COPY . .

# Start app
CMD ["node", "index.js"]