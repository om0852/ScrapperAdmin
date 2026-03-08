# Specify the base Docker image with Playwright and Chrome
FROM apify/actor-node-playwright-chrome:22

# Copy package.json and package-lock.json
COPY --chown=myuser package*.json ./

# Install NPM packages, skip optional and development dependencies
RUN npm --quiet set progress=false \
    && npm install --omit=dev --omit=optional \
    && echo "Installed NPM packages:" \
    && (npm list --omit=dev --all || true) \
    && echo "Node.js version:" \
    && node --version \
    && echo "NPM version:" \
    && npm --version

# Install Playwright browsers (CRITICAL STEP)
RUN npx playwright install chromium

# Copy the remaining files and directories
COPY --chown=myuser . ./

# Expose port 4000 for Render
EXPOSE 4000

# Set environment to production
ENV NODE_ENV=production

# Run the server (changed from npm start to npm run server)
CMD npm run server --silent