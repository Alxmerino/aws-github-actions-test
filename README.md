# aws-github-actions-test
Testing GH Actions with AWS S3 and Code Deploy

## Pulumi resources

- IAM Instance Profile
- IAM Role
  - GitHub
  - CodeDeploy
  - EC2
- IAM Identity Provider
- S3 Bucket
- EC2 with NGINX ```sudo amazon-linux-extras install -y nginx1```
- CodeDeploy