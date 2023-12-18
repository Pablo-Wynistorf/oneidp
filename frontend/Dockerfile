FROM nginx:latest


WORKDIR /usr/share/nginx/html

RUN rm -rf /usr/share/nginx/html/*

COPY index.html /usr/share/nginx/html/
COPY ./home/ /usr/share/nginx/html/home
COPY ./login/ /usr/share/nginx/html/login
COPY ./recoverpassword/ /usr/share/nginx/html/recoverpassword
COPY ./register/ /usr/share/nginx/html/register
COPY ./setpassword/ /usr/share/nginx/html/setpassword
COPY ./emailverification/ /usr/share/nginx/html/emailverification

EXPOSE 80

CMD sh -c 'nginx -g "daemon off;"'

