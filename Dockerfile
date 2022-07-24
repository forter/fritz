FROM 174522763890.dkr.ecr.us-east-1.amazonaws.com/ubuntu-node17:latest

USER app
WORKDIR /app
COPY package*.json ./

# TODO: run with --omit=dev for production image
RUN npm ci

COPY server.js ./
COPY ./lib ./lib

EXPOSE 5555

CMD ["node", "server.js"]
