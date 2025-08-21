# Use Node.js LTS
FROM node:18-slim

# Install dependencies required for Chromium
RUN apt-get update && apt-get install -y \
    chromium \
    chromium-common \
    chromium-driver \
    fonts-liberation \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libatspi2.0-0 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libxkbcommon0 \
    libnss3 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libasound2 \
    xdg-utils \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Set Chromium path for puppeteer
ENV CHROMIUM_PATH=/usr/bin/chromium

# Create app directory
WORKDIR /app

# Install app dependencies
COPY package*.json ./
RUN npm install --production

# Copy app source
COPY . .


# Expose port
EXPOSE 8080

# Start app
CMD ["node", "index.js"]
