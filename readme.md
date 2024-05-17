# Basic loginapp and with api:

This loginapp can be placed in front of practically ever application to authenticate their users. After a successful login, the api sends back a session cookie to authenticate the user.

The app is build with express js and a mongodb backend. 
For mail delievery we use mailjet. Create a account to get the api key. https://app.mailjet.com/signin

For alerting and log we use discord webhook. Create a channel in a discord server and get the webhook url. https://discord.com




# Deployment on Kubernetes:

1.) Clone the github repo

```yaml
git clone https://github.com/Pablo-Wynistorf/login-app.git && cd login-app
```
2.) Add the values to the secrets.yaml file

```bash
URL= # Add the url of your application. Format: http://login.example.com, https://login.example.com
DATABASE_URI= # Add the MongoDB database uri. Format: mongodb+srv://username:password@db-host.example.com, mongodb://username:password@db-host.example.com
API_PORT= # Enter the api port you want to use. 
JWT_SECRET= # Define a jason webtoken secret to create secure access tokens.
MJ_APIKEY_PUBLIC= # Enter the mailjet public api key
MJ_APIKEY_PRIVATE= # Enter the mailjet private api key
MJ_SENDER_EMAIL= # Enter the email address the verification codes should be sent from. You need to configure it in the mailjet dashboard. 
DC_MONITORING_WEBHOOK_URL= # Enter the discord webhook url.
```

3.) Its not recommended to use the mongodb in kubernetes. But if you want to, you just need to install these manifests. Make sure to add the values in the secrets.yaml to MONGO_INITDB_ROOT_USERNAME and MONGO_INITDB_ROOT_PASSWORD. 
```yaml
kubectl create ns loginapp
kubectl apply -f secrets.yaml
kubectl apply -f storageclass.yaml
kubectl apply -f database-deployment.yaml
```

4.) Apply all deployment files. 
I used a nginx ingress controller. Also dont forget to change the values to your demand in ingress-deployment.yaml

```yaml
kubectl apply -f ingress-deployment.yaml
kubectl apply -f app-deployment.yaml
```

5.) Check if all pods are up and running:

```yaml
kubectl get pods -n loginapp
```
