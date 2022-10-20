#!/bin/bash
set -xe

# Copy war file from S3 bucket to tomcat webapp folder
aws s3 cp s3://am-github-actions-test-bucket/app.zip /usr/share/nginx/html/app.zip

cd /usr/share/nginx/html

unzip app.zip