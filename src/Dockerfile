FROM node:latest

WORKDIR /usr/src/app/api

COPY package.json /usr/src/app/api
COPY package-lock.json /usr/src/app/api
COPY express.js /usr/src/app/api
COPY public /usr/src/app/api/public
COPY routes /usr/src/app/api/routes
COPY notify /usr/src/app/api/notify
COPY database /usr/src/app/api/database

RUN npm install

CMD sh -c 'node express.js'