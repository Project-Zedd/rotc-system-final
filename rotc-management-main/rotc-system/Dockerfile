# Use official Node.js LTS image
FROM node:18-alpine

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
COPY backend/package*.json ./
RUN npm install --production

# Bundle app source
COPY backend/ .

# Expose port
EXPOSE 3000

# Start the app
CMD ["node", "server.js"]
