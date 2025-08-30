# Step 1: Use the official Node.js image as a base image
FROM node:18-slim

# Step 2: Set the working directory inside the container (use root directory)
WORKDIR /

# Install dependencies for Puppeteer (Chromium) in the container
RUN apt-get update && apt-get install -y \
    libnss3 \
    libatk-bridge2.0-0 \
    libx11-xcb1 \
    libxkbcommon0 \
    libxss1 \
    libgdk-pixbuf2.0-0 \
    libasound2 \
    libappindicator3-1 \
    libatk1.0-0 \
    libgtk-3-0 \
    ca-certificates \
    libdrm2 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Step 3: Copy the package.json and package-lock.json files into the container
COPY package.json package-lock.json* ./

# Step 4: Install Node.js dependencies
RUN npm install

# Step 5: Copy the rest of your application code into the container
COPY . .

# Step 6: Expose the port your application will run on (e.g., 8080)
EXPOSE 8080

# Step 7: Specify the command to run the application (start the server)
CMD ["npm", "start"]
