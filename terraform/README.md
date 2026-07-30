# ONEIDP – Serverless deployment (Lambda + API Gateway + CloudFront)

This Terraform module deploys the ONEIDP app as a single AWS Lambda function
running the existing Express app (via `serverless-http`), fronted by an
API Gateway HTTP API and a CloudFront distribution.

```
Viewer ──► CloudFront ──► API Gateway (HTTP API) ──► Lambda (Express app)
                                                          │
                                                          ├─► MongoDB (MONGODB_URI)
                                                          └─► Redis   (REDIS_URI)
```

## Prerequisites

- Terraform >= 1.5
- AWS credentials configured (`aws configure` or environment variables)
- Node.js + npm on the machine running `terraform apply` (used to build the
  Lambda bundle from `../src`)
- A publicly reachable MongoDB and Redis instance (e.g. MongoDB Atlas,
  Redis Cloud)

## Usage

```bash
cd terraform
cp terraform.tfvars.example terraform.tfvars   # then edit values
terraform init
terraform apply
```

On apply, an inline build step copies `../src` into `./build`, runs
`npm ci --omit=dev`, and the resulting bundle is zipped, uploaded to an S3
artifact bucket, and deployed to Lambda. Any change to the source triggers a
rebuild + redeploy on the next apply.

After apply, the public URL is printed as the `app_url` / `cloudfront_domain_name`
output.

## Custom domain

To serve on your own domain:

1. Request/import an ACM certificate **in us-east-1** covering the domain.
2. Set `domain_name` and `acm_certificate_arn` in `terraform.tfvars`.
3. `terraform apply`, then point a DNS CNAME/ALIAS at the CloudFront domain.

## Notes

- CloudFront uses the managed `CachingDisabled` + `AllViewerExceptHostHeader`
  policies so cookies, query strings and headers reach the Express app intact.
  This is correct for an auth app; static-asset caching can be layered on later
  with an extra cache behavior.
- JWT keys must be provided as the **base64 body only** (no `BEGIN/END` lines),
  matching how the app wraps them at runtime.
- Update your Google/GitHub OAuth app callback URLs and any registered OIDC
  client redirect URIs to use the deployed `app_url`.
