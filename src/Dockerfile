FROM node:latest

WORKDIR /usr/src/app/api

COPY package.json /usr/src/app/api
COPY package-lock.json /usr/src/app/api
COPY express.js /usr/src/app/api
COPY public /usr/src/app/api/public

RUN npm install

CMD sh -c 'node express.js'