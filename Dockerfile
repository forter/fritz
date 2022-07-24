FROM 174522763890.dkr.ecr.us-east-1.amazonaws.com/ubuntu-node17:latest

USER app
WORKDIR /app
COPY package*.json ./

RUN npm ci --omit=dev

COPY server.js ./
COPY ./lib ./lib

EXPOSE 5555

CMD ["node", "server.js"]
