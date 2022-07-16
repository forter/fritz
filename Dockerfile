FROM node:18.6.0

WORKDIR /usr/src/app
COPY package*.json ./

RUN npm ci --omit=dev

COPY fritz.js ./
COPY ./lib ./lib

EXPOSE 5555

CMD ["node", "fritz.js"]