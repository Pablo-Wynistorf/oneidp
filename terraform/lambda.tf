###############################################################################
# Build & package the Lambda bundle
###############################################################################

# Rebuild whenever any source file changes (hash of all files under src, minus
# node_modules which is not committed).
resource "null_resource" "build" {
  triggers = {
    source_hash = sha1(join("", [
      for f in fileset(local.src_dir, "**") :
      filesha1("${local.src_dir}/${f}") if !startswith(f, "node_modules/")
    ]))
  }

  # Build the Lambda bundle: copy the app source into a clean build directory
  # and install production dependencies.
  provisioner "local-exec" {
    interpreter = ["/bin/bash", "-c"]
    command     = <<-EOT
      set -euo pipefail
      echo "==> Cleaning build directory: ${local.build_dir}"
      rm -rf '${local.build_dir}'
      mkdir -p '${local.build_dir}'

      echo "==> Copying source from ${local.src_dir}"
      cp -R '${local.src_dir}/.' '${local.build_dir}/'

      # Drop files that must never ship inside the Lambda package. `public/` is
      # excluded because the frontend is now served from S3/CloudFront and the
      # Express app no longer mounts any static routes.
      rm -rf \
        '${local.build_dir}/node_modules' \
        '${local.build_dir}/public' \
        '${local.build_dir}/.env' \
        '${local.build_dir}/Dockerfile' \
        '${local.build_dir}/.DS_Store'

      echo "==> Installing production dependencies"
      cd '${local.build_dir}'
      if [ -f package-lock.json ]; then
        npm ci --omit=dev --no-audit --no-fund
      else
        npm install --omit=dev --no-audit --no-fund
      fi

      echo "==> Build complete"
    EOT
  }
}

data "archive_file" "lambda_zip" {
  type        = "zip"
  source_dir  = local.build_dir
  output_path = "${path.module}/lambda.zip"

  depends_on = [null_resource.build]
}

resource "random_id" "suffix" {
  byte_length = 4
}

###############################################################################
# IAM role
###############################################################################

data "aws_iam_policy_document" "lambda_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "lambda" {
  name               = "${var.project_name}-lambda-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

resource "aws_iam_role_policy_attachment" "lambda_basic" {
  role       = aws_iam_role.lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

###############################################################################
# Lambda function
###############################################################################

resource "aws_cloudwatch_log_group" "lambda" {
  name              = "/aws/lambda/${var.project_name}"
  retention_in_days = var.log_retention_days
}

resource "aws_lambda_function" "this" {
  function_name = var.project_name
  role          = aws_iam_role.lambda.arn
  handler       = "lambda.handler"
  runtime       = var.lambda_runtime
  memory_size   = var.lambda_memory_size
  timeout       = var.lambda_timeout

  # Upload the zip directly to Lambda (no S3 staging). Keep the package under
  # the 50 MB direct-upload limit.
  filename         = data.archive_file.lambda_zip.output_path
  source_code_hash = data.archive_file.lambda_zip.output_base64sha256

  environment {
    variables = local.app_environment
  }

  depends_on = [
    aws_iam_role_policy_attachment.lambda_basic,
    aws_cloudwatch_log_group.lambda,
  ]
}
