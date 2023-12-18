# Basic loginapp and with api:

This loginapp can be placed in front of practically ever application to authenticate their users. After a successful login, the api sends back a session cookie to authenticate the user.

![](https://slabstatic.com/prod/uploads/ptzfq7y2/posts/images/CKAMnofp4o8QW4xgQXMk_eX-.png)





# Deployment on Kubernetes:

1.) Clone the github repo

```yaml
git clone https://github.com/Pablo-Wynistorf/login-app.git && cd login-app
```

2.) Set the new env variables in the deploymentfile:

```yaml
nano deployment/api-deployment.yaml
nano deployment/frontend-deployment.yaml
```

3.) Setup the database with the database.sql file.

4.) Apply the two deploymentfiles:

```yaml
kubectl apply -f deployment/api-deployment.yaml
kubectl apply -f deployment/frontend-deployment.yaml
```
