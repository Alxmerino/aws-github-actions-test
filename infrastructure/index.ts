import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';
import * as fs from "fs";

import S3 from './s3'
// import * as awsx from '@pulumi/awsx';

const projectTag = 'gh-actions-test';
const tags = {
  Project: projectTag
}
const callerIdentity = pulumi.output(aws.getCallerIdentity({}));
const callerPartition = pulumi.output(aws.getPartition());

const S3Bucket = new S3(projectTag, {
  projectTag
})

/**
 * BEGIN ROLES
 */
const GHOpenIdConnectProvider = new aws.iam.OpenIdConnectProvider('GHOpenIDConnect', {
  clientIdLists: ['sts.amazonaws.com'],
  thumbprintLists: [],
  url: 'https://token.actions.githubusercontent.com',
});

const GHActionRole = GHOpenIdConnectProvider.arn.apply(arn => {
  return new aws.iam.Role('GHActionRole', {
    assumeRolePolicy: JSON.stringify({
      Version: '2012-10-17',
      Statement: [{
        Effect: 'Allow',
        Principal: {
          Federated: arn,
        },
        Action: 'sts:AssumeRoleWithWebIdentity',
        Condition: {
          StringEquals: {
            'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com'
          }
        }
      }],
    }),
    tags
  });
});

const GHActionRolePolicy = pulumi.all([S3Bucket.arn, callerPartition.partition, callerIdentity.accountId]).apply(([arn, partition, accountId]) => {
  return new aws.iam.RolePolicy('GHActionRolePolicy', {
    role: GHActionRole.id,
    policy: JSON.stringify({
      Version: '2012-10-17',
      Statement: [{
        Action: [
          'codedeploy:Get*',
          'codedeploy:Batch*',
          'codedeploy:CreateDeployment',
          'codedeploy:RegisterApplicationRevision',
          'codedeploy:List*',
        ],
        Effect: 'Allow',
        Resource: `arn:${partition}:codedeploy:*:${accountId}:*`,
      }, {
        Action: ['s3:putObject'],
        Effect: 'Allow',
        Resource: arn
      }],
    })
  });
});

const GHActionEC2Role = S3Bucket.arn.apply(arn => {
  new aws.iam.Role('GHActionEC2Role', {
    assumeRolePolicy: JSON.stringify({
      Version: '2012-10-17',
      Statement: [{
        Effect: 'Allow',
        Principal: {
          Service: [
            'codedeploy.amazonaws.com',
            'ec2.amazonaws.com'
          ]
        },
        Action: 'sts:AssumeRole'
      }],
    }),
    inlinePolicies: [{
      name: 'GHActionEC2S3ReadOnly',
      policy: JSON.stringify({
        Version: '2012-10-17',
        Statement: [{
          Action: ['s3:putObject'],
          Effect: 'Allow',
          Resource: arn
        }],
      })
    }],
    managedPolicyArns: [
      'arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore',
    ],
    tags
  });
});

const GHActionCodeDeployRole = pulumi.all([callerPartition.partition, callerIdentity.accountId]).apply(([partition, accountId]) => {
  return new aws.iam.Role('GHActionCodeDeployRole', {
    assumeRolePolicy: JSON.stringify({
      Version: '2012-10-17',
      Statement: [{
        Effect: 'Allow',
        Principal: {
          Service: [
            'codedeploy.amazonaws.com',
          ]
        },
        Action: 'sts:AssumeRole'
      }],
    }),
    inlinePolicies: [{
      name: 'GHActionEC2AutoScaling',
      policy: JSON.stringify({
        Version: '2012-10-17',
        Statement: [{
          Action: [
            'ec2:RunInstances',
            'ec2:CreateTags',
            'iam:PassRole',
          ],
          Effect: 'Allow',
          Resource: `arn:${partition}:codedeploy:*:${accountId}:*`,
        }],
      })
    }],
    managedPolicyArns: [
      'arn:aws:iam::aws:policy/service-role/AWSCodeDeployRole'
    ],
    tags
  })
})

/**
 * END ROLES
 */

/**
 * BEGIN EC2 INSTANCE
 */
const ami = aws.ec2.getAmiOutput({
  mostRecent: true,
  filters: [
    {
      name: "name",
      values: ["amzn2-ami-kernel-*-x86_64-gp2"],
    },
  ],
  owners: ["137112412989"],
});

const group = new aws.ec2.SecurityGroup(projectTag + "web-secgrp", {
  ingress: [
    {protocol: "tcp", fromPort: 22, toPort: 22, cidrBlocks: ["0.0.0.0/0"]},
    {protocol: "tcp", fromPort: 80, toPort: 80, cidrBlocks: ["0.0.0.0/0"]},
  ],
  egress: [
    {protocol: "-1", fromPort: 0, toPort: 0, cidrBlocks: ["0.0.0.0/0"],},
  ]
});

const userData =
`#!/bin/bash
sudo yum update -y
sudo yum install ruby -y
sudo yum install wget -y

CODEDEPLOY_BIN="/opt/codedeploy-agent/bin/codedeploy-agent"
$CODEDEPLOY_BIN stop
yum erase codedeploy-agent -y

wget https://aws-codedeploy-us-east-1.s3.us-east-1.amazonaws.com/latest/install
chmod +x ./install
sudo ./install auto

sudo amazon-linux-extras install -y nginx1
sudo service nginx start`;

const server = new aws.ec2.Instance("web-server-www", {
  tags: {"Name": "web-server-www"},
  instanceType: aws.ec2.InstanceType.T2_Micro, // t2.micro is available in the AWS free tier
  vpcSecurityGroupIds: [group.id], // reference the group object above
  ami: ami.id,
  keyName: 'aws-amaya-media',
  userData: userData,
  // userData: Buffer.from(fs.readFileSync(`${path.module}/example.sh`), 'binary').toString('base64'),              // start a simple web server
});

export const publicIp = server.publicIp;
export const publicHostName = server.publicDns;
/**
 * END EC2 INSTANCE
 */