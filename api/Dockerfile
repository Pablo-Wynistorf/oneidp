FROM node:latest

WORKDIR /usr/src/app/api

COPY package.json /usr/src/app/api
COPY package-lock.json /usr/src/app/api
COPY express.js /usr/src/app/api

RUN npm install express
RUN npm install body-parser
RUN npm install jsonwebtoken
RUN npm install mysql2
RUN npm install cors
RUN npm install bcryptjs
RUN npm install node-mailjet
RUN npm install dotenv
RUN npm install express-rate-limit

EXPOSE $API_PORT

CMD sh -c 'node express.js'