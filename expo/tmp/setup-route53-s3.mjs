import {
  Route53Client,
  ListHostedZonesByNameCommand,
  ChangeResourceRecordSetsCommand,
} from "@aws-sdk/client-route-53";

const DOMAIN = "ivxholding.com";
const WWW_DOMAIN = "www.ivxholding.com";
const REGION = "us-east-1";
const S3_HOSTED_ZONE_ID = "Z3AQBSTGFYJSTF"; // us-east-1 S3 website hosted zone ID

const creds = {
  credentials: {
    accessKeyId: (process.env.AWS_ACCESS_KEY_ID || "").trim(),
    secretAccessKey: (process.env.AWS_SECRET_ACCESS_KEY || "").trim(),
  },
};

const route53 = new Route53Client({ ...creds, region: REGION });

async function main() {
  console.log("Finding Route53 hosted zone...");
  const listResp = await route53.send(new ListHostedZonesByNameCommand({ DNSName: DOMAIN }));
  const zone = listResp.HostedZones?.find((z) => z.Name === DOMAIN + ".");

  if (!zone) {
    console.error("No hosted zone found for " + DOMAIN);
    process.exit(1);
  }

  const zoneId = zone.Id.replace("/hostedzone/", "");
  console.log("Found zone: " + zoneId);

  console.log("Creating A record aliases to S3 website endpoints...");

  const changes = [
    {
      Action: "UPSERT",
      ResourceRecordSet: {
        Name: DOMAIN + ".",
        Type: "A",
        AliasTarget: {
          DNSName: "s3-website-us-east-1.amazonaws.com.",
          HostedZoneId: S3_HOSTED_ZONE_ID,
          EvaluateTargetHealth: false,
        },
      },
    },
    {
      Action: "UPSERT",
      ResourceRecordSet: {
        Name: WWW_DOMAIN + ".",
        Type: "A",
        AliasTarget: {
          DNSName: "s3-website-us-east-1.amazonaws.com.",
          HostedZoneId: S3_HOSTED_ZONE_ID,
          EvaluateTargetHealth: false,
        },
      },
    },
  ];

  await route53.send(new ChangeResourceRecordSetsCommand({
    HostedZoneId: zoneId,
    ChangeBatch: {
      Changes: changes,
      Comment: "IVX Holdings — Landing page S3 website alias",
    },
  }));

  console.log("DNS records created:");
  console.log("  " + DOMAIN + " → A (Alias) → S3 website");
  console.log("  " + WWW_DOMAIN + " → A (Alias) → S3 website");
  console.log("\nYour landing page should be live at http://ivxholding.com within minutes.");
  console.log("(HTTPS requires CloudFront — your AWS account needs verification first)");
}

main().catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});
