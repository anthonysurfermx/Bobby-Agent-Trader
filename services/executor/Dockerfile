FROM node:22-slim
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY index.mjs ./
EXPOSE 8080
CMD ["node", "index.mjs"]
