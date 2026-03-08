# Use official Playwright image which includes Node.js and browsers
FROM mcr.microsoft.com/playwright:v1.40.0-jammy

WORKDIR /app

# Copy package files
COPY package.json ./

# Install app dependencies
RUN npm install

# Copy app source
COPY . .

# Copy app source
COPY . .

# Expose port
EXPOSE 3000

# Start command
CMD ["npm", "start"]