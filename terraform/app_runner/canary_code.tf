# Pack and upload canary code

data "archive_file" "auth_ready_zip" {
  type        = "zip"
  output_path = "${path.module}/auth_ready.zip"
  source {
    content  = <<-EOT
      const https = require('https');
      exports.handler = async () => {
        const url = process.env.TARGET_URL;
        if (!url) throw new Error('TARGET_URL is not set');
        await new Promise((resolve, reject) => {
          https.get(url, (res) => {
            if (res.statusCode === 200) {
              resolve();
            } else {
              reject(new Error('Non-200: ' + res.statusCode));
            }
          }).on('error', reject);
        });
      };
    EOT
    filename = "index.js"
  }
}

resource "aws_s3_object" "canary_code" {
  bucket = data.aws_s3_bucket.synthetics_artifacts.bucket
  key    = "canaries/auth_ready.zip"
  source = data.archive_file.auth_ready_zip.output_path
  etag   = filemd5(data.archive_file.auth_ready_zip.output_path)
}

