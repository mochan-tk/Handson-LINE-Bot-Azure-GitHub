FROM node:16
WORKDIR /usr/src/app
COPY package.json package*.json ./
RUN npm install --only=production
COPY . .
EXPOSE 3000
CMD [ "npm", "start" ]