###############################################################################
# Static frontend: private S3 bucket served through the shared CloudFront
# distribution.
#
# The React SPA lives in its own origin, but deliberately behind the *same*
# distribution as the API rather than a separate one. The session cookie is
# httpOnly and host-scoped, and the API redirects to frontend routes such as
# /login and /consent during the OAuth flow. Splitting the two across
# distributions (and therefore hostnames) would make the cookie cross-site and
# break those redirects.
###############################################################################

resource "aws_s3_bucket" "frontend" {
  bucket        = "${var.project_name}-frontend-${random_id.suffix.hex}"
  force_destroy = true
}

# The bucket is reachable only through CloudFront's origin access control.
resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket                  = aws_s3_bucket.frontend.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "frontend" {
  bucket = aws_s3_bucket.frontend.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "frontend" {
  bucket = aws_s3_bucket.frontend.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# No expiration rule for assets/: every object in the bucket is tracked in
# Terraform state, so a rule that quietly deleted a still-referenced file would
# leave state claiming an object that no longer exists. Superseded builds are
# pruned by the apply that replaces them instead.
resource "aws_s3_bucket_lifecycle_configuration" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  rule {
    id     = "abort-incomplete-uploads"
    status = "Enabled"

    filter {}

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

resource "aws_cloudfront_origin_access_control" "frontend" {
  name                              = "${var.project_name}-frontend-oac"
  description                       = "OAC for the ${var.project_name} SPA bucket"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# Read-only access, restricted to this one distribution.
data "aws_iam_policy_document" "frontend_bucket" {
  statement {
    sid       = "AllowCloudFrontRead"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.frontend.arn}/*"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.this.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "frontend" {
  bucket = aws_s3_bucket.frontend.id
  policy = data.aws_iam_policy_document.frontend_bucket.json

  depends_on = [aws_s3_bucket_public_access_block.frontend]
}

###############################################################################
# Build
#
# The upload itself is a set of aws_s3_object resources (below), so every file
# is tracked in state: changed files are re-uploaded, removed files are deleted,
# and `terraform plan` says up front what a deploy will do.
#
# That only works if dist/ already exists while the plan is being built, because
# `fileset()` is evaluated at plan time. Building from a provisioner is too late:
# the plan would see an empty directory and upload nothing. An external data
# source is read before the plan is finalised, so the build runs first, and the
# object resources take the dist path out of its result, which is also what
# gives Terraform the dependency edge between the two.
###############################################################################

locals {
  # The globs list the source paths explicitly instead of walking "**" and
  # filtering afterwards. fileset() enumerates everything it is pointed at, and
  # node_modules/ and dist/ do not hold still between the plan and the apply
  # (npm rewrites one, the SPA build replaces the other). Terraform compares
  # both evaluations and aborts the apply with "function returned an
  # inconsistent result" as soon as the listing differs, so those two
  # directories must stay out of the pattern.
  #
  # A new top-level directory under frontend/ has to be added here to take part
  # in build-change detection.
  frontend_source_globs = ["*", "src/**", "public/**", "scripts/**"]

  frontend_source_files = sort(distinct(flatten([
    for g in local.frontend_source_globs : tolist(fileset(local.frontend_dir, g))
  ])))

  # Identifies a build, and reflects real source edits only.
  frontend_source_hash = sha1(join("", concat(
    [
      for f in local.frontend_source_files :
      filesha1("${local.frontend_dir}/${f}")
      if !endswith(f, ".DS_Store")
    ],
    # The /docs route inlines the integration markdown at build time, so an
    # edit under docs/ has to republish the SPA as well.
    [
      for f in fileset(local.docs_dir, "*.md") :
      filesha1("${local.docs_dir}/${f}")
    ],
  )))

  # Holds the hash of the last successful build so that plans against unchanged
  # sources skip npm entirely instead of rebuilding on every run.
  frontend_build_stamp = "${path.module}/.frontend-build-hash"
}

data "external" "frontend_build" {
  program = ["/bin/bash", "-c", <<-EOT
    set -euo pipefail

    src='${local.frontend_dir}'
    stamp='${local.frontend_build_stamp}'
    want='${local.frontend_source_hash}'

    have=''
    if [ -f "$stamp" ]; then
      have="$(cat "$stamp")"
    fi

    # stdout carries the JSON result, so every build message goes to stderr.
    if [ ! -f "$src/dist/index.html" ] || [ "$have" != "$want" ]; then
      command -v npm >/dev/null || { echo "npm is required to build the frontend" >&2; exit 1; }

      (
        cd "$src"

        echo "==> Installing frontend dependencies" >&2
        if [ -f package-lock.json ]; then
          npm ci --no-audit --no-fund >&2
        else
          npm install --no-audit --no-fund >&2
        fi

        echo "==> Building the SPA" >&2
        rm -rf dist
        npm run build >&2
      )

      test -f "$src/dist/index.html" || { echo "build produced no dist/index.html" >&2; exit 1; }
      printf '%s' "$want" > "$stamp"
    fi

    printf '{"dist_dir":"%s","source_hash":"%s"}' "$src/dist" "$want"
  EOT
  ]
}

###############################################################################
# Publish
###############################################################################

locals {
  frontend_dist_dir = data.external.frontend_build.result.dist_dir

  frontend_files = toset([
    for f in fileset(local.frontend_dist_dir, "**") : f
    if !endswith(f, ".DS_Store")
  ])

  # S3 keeps no notion of file type on its own, so Content-Type has to be set at
  # upload time or the browser gets application/octet-stream and refuses to run
  # the app.
  frontend_content_types = {
    avif        = "image/avif"
    css         = "text/css; charset=utf-8"
    eot         = "application/vnd.ms-fontobject"
    gif         = "image/gif"
    html        = "text/html; charset=utf-8"
    ico         = "image/x-icon"
    jpeg        = "image/jpeg"
    jpg         = "image/jpeg"
    js          = "text/javascript; charset=utf-8"
    json        = "application/json; charset=utf-8"
    map         = "application/json; charset=utf-8"
    md          = "text/markdown; charset=utf-8"
    mjs         = "text/javascript; charset=utf-8"
    otf         = "font/otf"
    pdf         = "application/pdf"
    png         = "image/png"
    svg         = "image/svg+xml"
    ttf         = "font/ttf"
    txt         = "text/plain; charset=utf-8"
    webmanifest = "application/manifest+json"
    webp        = "image/webp"
    woff        = "font/woff"
    woff2       = "font/woff2"
    xml         = "application/xml; charset=utf-8"
  }
}

resource "aws_s3_object" "frontend" {
  for_each = local.frontend_files

  bucket = aws_s3_bucket.frontend.id
  key    = each.value
  source = "${local.frontend_dist_dir}/${each.value}"

  # Re-uploads an object only when the built file actually differs.
  etag = filemd5("${local.frontend_dist_dir}/${each.value}")

  content_type = lookup(
    local.frontend_content_types,
    lower(try(regex("[^./]+$", each.value), "")),
    "application/octet-stream"
  )

  cache_control = "public, max-age=${var.frontend_cache_ttl_seconds}"

  depends_on = [
    aws_s3_bucket_ownership_controls.frontend,
    aws_s3_bucket_public_access_block.frontend,
  ]
}

# Drop the cached HTML so the new build is served straight away. Hashed assets
# do not need invalidating because their filenames change. The AWS provider has
# no invalidation resource, so this one step stays a CLI call.
resource "null_resource" "frontend_invalidation" {
  triggers = {
    objects = sha1(join(",", [
      for key, obj in aws_s3_object.frontend : "${key}=${obj.etag}"
    ]))
  }

  provisioner "local-exec" {
    interpreter = ["/bin/bash", "-c"]
    command     = <<-EOT
      set -euo pipefail
      aws cloudfront create-invalidation \
        --distribution-id '${aws_cloudfront_distribution.this.id}' \
        --paths '/' '/index.html' \
        --output text >/dev/null
      echo "==> CloudFront invalidation requested"
    EOT
  }

  depends_on = [aws_s3_object.frontend]
}
