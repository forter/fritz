FROM 174522763890.dkr.ecr.us-east-1.amazonaws.com/node:18.6.0

WORKDIR /app
COPY package*.json ./

RUN npm ci --omit=dev

COPY fritz.js ./
COPY ./lib ./lib

EXPOSE 5555

CMD ["node", "fritz.js"]
