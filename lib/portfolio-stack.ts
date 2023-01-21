import { RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import { Certificate, CertificateValidation } from 'aws-cdk-lib/aws-certificatemanager';
import { Distribution, ViewerProtocolPolicy } from 'aws-cdk-lib/aws-cloudfront';
import { S3Origin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { ARecord, HostedZone, RecordTarget } from 'aws-cdk-lib/aws-route53';
import { CloudFrontTarget } from 'aws-cdk-lib/aws-route53-targets';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { BucketDeployment, Source } from 'aws-cdk-lib/aws-s3-deployment';
import { Construct } from 'constructs';
import path from 'path';

const DOMAIN_NAME = 'sls-mentor.dev';
const WWW_DOMAIN_NAME = `www.${DOMAIN_NAME}`;
const FRONT_SRC_PATH = path.join(__dirname, '../front/src');

export class PortfolioStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Create the bucket hosting the website
    const staticWebsiteHostingBucket = new Bucket(this, 'StaticWebsiteHostingBucket', {
      publicReadAccess: true,
      removalPolicy: RemovalPolicy.DESTROY,
      websiteIndexDocument: 'index.html',
    })
  
    // Sync the bucket's content with the codebase
    new BucketDeployment(this, 'StaticWebsiteHostingBucketSync', {
      sources: [Source.asset(FRONT_SRC_PATH)],
      destinationBucket: staticWebsiteHostingBucket,
    });

    // Create a Route53 hosted zone to later create DNS records
    // ⚠️ Manual action required: when the hosted zone is created, copy its NS record into your domain's name servers
    const hostedZone = new HostedZone(this, 'DomainHostedZone', {
      zoneName: DOMAIN_NAME,
    });

    // Create the HTTPS certificate (⚠️ must be in region us-east-1 ⚠️)
    const httpsCertificate = new Certificate(this, 'HttpsCertificate', {
      domainName: DOMAIN_NAME,
      subjectAlternativeNames: [WWW_DOMAIN_NAME],
      validation: CertificateValidation.fromDns(hostedZone),
    });

    // Create the CloudFront distribution linked to the website hosting bucket and the HTTPS certificate
    const cloudFrontDistribution = new Distribution(this, 'CloudFrontDistribution', {
      defaultBehavior: {
        origin: new S3Origin(staticWebsiteHostingBucket, {}),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        responseHeadersPolicy: { responseHeadersPolicyId: '67f7725c-6f97-4210-82d7-5512b31e9d03' },
      },
      domainNames: [DOMAIN_NAME, WWW_DOMAIN_NAME],
      certificate: httpsCertificate,
    });

    // Add DNS records to the hosted zone to redirect from the domain name to the CloudFront distribution
    new ARecord(this, 'CloudFrontRedirect', {
      zone: hostedZone,
      target: RecordTarget.fromAlias(new CloudFrontTarget(cloudFrontDistribution)),
      recordName: DOMAIN_NAME,
    });

    // Same from www. sub-domain
    new ARecord(this, 'CloudFrontWWWRedirect', {
      zone: hostedZone,
      target: RecordTarget.fromAlias(new CloudFrontTarget(cloudFrontDistribution)),
      recordName: WWW_DOMAIN_NAME,
    });
  }
}
