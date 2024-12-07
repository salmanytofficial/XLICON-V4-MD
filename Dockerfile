FROM node:lts

# Install dependencies
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg imagemagick webp && apt-get clean

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install && npm cache clean --force
RUN npm install -g pm2

# Copy application code
COPY . .

# Set environment
ENV NODE_ENV production

# Run command
CMD ["npm", "run", "start"]
