###############################################################################
# Build & package the Lambda bundle
###############################################################################

locals {
  # Same reasoning as frontend_source_globs: node_modules/ is left out of the
  # pattern rather than filtered after the fact, because fileset() walks
  # everything it is given and a listing that changes between plan and apply
  # fails the apply. A new top-level directory under src/ has to be added here
  # to take part in build-change detection.
  lambda_source_globs = ["*", "database/**", "notify/**", "routes/**", "utils/**"]

  lambda_source_files = sort(distinct(flatten([
    for g in local.lambda_source_globs : tolist(fileset(local.src_dir, g))
  ])))

  # Identifies a build, and reflects real source edits only.
  lambda_source_hash = sha1(join("", [
    for f in local.lambda_source_files :
    filesha1("${local.src_dir}/${f}") if !endswith(f, ".DS_Store")
  ]))

  # Holds the hash of the last successful build so that plans against unchanged
  # sources skip npm entirely instead of rebuilding on every run.
  lambda_build_stamp = "${path.module}/.lambda-build-hash"
}

# data.archive_file is read during plan, so the bundle has to exist by then. A
# local-exec provisioner would only run on apply, which makes plan-only runs
# (CI) fail with "could not archive missing directory: ./build". Building through
# data.external keeps the packaging step ahead of the archive read in both
# phases, and mirrors how the frontend is built.
data "external" "lambda_build" {
  program = ["/bin/bash", "-c", <<-EOT
    set -euo pipefail

    src='${local.src_dir}'
    build='${local.build_dir}'
    stamp='${local.lambda_build_stamp}'
    want='${local.lambda_source_hash}'

    have=''
    if [ -f "$stamp" ]; then
      have="$(cat "$stamp")"
    fi

    # stdout carries the JSON result, so every build message goes to stderr.
    if [ ! -f "$build/lambda.mjs" ] || [ ! -d "$build/node_modules" ] || [ "$have" != "$want" ]; then
      command -v npm >/dev/null || { echo "npm is required to build the Lambda bundle" >&2; exit 1; }

      echo "==> Cleaning build directory: $build" >&2
      rm -rf "$build"
      mkdir -p "$build"

      echo "==> Copying source from $src" >&2
      cp -R "$src/." "$build/"

      # Drop files that must never ship inside the Lambda package. `public/` is
      # excluded because the frontend is now served from S3/CloudFront and the
      # Express app no longer mounts any static routes.
      rm -rf \
        "$build/node_modules" \
        "$build/public" \
        "$build/.env" \
        "$build/Dockerfile" \
        "$build/.DS_Store"

      echo "==> Installing production dependencies" >&2
      (
        cd "$build"
        if [ -f package-lock.json ]; then
          npm ci --omit=dev --no-audit --no-fund >&2
        else
          npm install --omit=dev --no-audit --no-fund >&2
        fi
      )

      test -f "$build/lambda.mjs" || { echo "build produced no lambda.mjs" >&2; exit 1; }
      printf '%s' "$want" > "$stamp"
      echo "==> Build complete" >&2
    fi

    printf '{"build_dir":"%s","source_hash":"%s"}' "$build" "$want"
  EOT
  ]
}

data "archive_file" "lambda_zip" {
  type = "zip"

  # Referencing the build output creates the ordering dependency, so no
  # depends_on is needed here.
  source_dir  = data.external.lambda_build.result.build_dir
  output_path = "${path.module}/lambda.zip"
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
