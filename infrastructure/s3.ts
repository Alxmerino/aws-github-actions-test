import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

export default class S3 extends pulumi.ComponentResource {
  public readonly arn: pulumi.Output<string>;
  public readonly name: pulumi.Output<string>;

  constructor(name: string, args?: any, opts?: pulumi.ComponentResourceOptions) {
    super("custom:resource:S3", name, args, opts);

    const S3Bucket = new aws.s3.Bucket(name, {
      acl: 'private',
      versioning: {
        enabled: true,
      },
      tags: {
        Project: args?.projectTag,
        Name: args?.projectTag,
      },
    });

    this.arn = S3Bucket.arn;
    this.name = S3Bucket.bucket;
  }
}
