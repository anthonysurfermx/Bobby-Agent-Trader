FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY index.mjs ./
EXPOSE 8080
CMD ["node", "index.mjs"]
