# Create a lambda function that will be used to redeploy the ECS service
resource "aws_lambda_function" "oneidp_redeployment_lambda" {
  provider = aws.lambda_region
  function_name = "oneidp-redeployment-lambda"
  handler = "index.handler"
  runtime = "nodejs22.x"
  filename         = data.archive_file.lambda_code.output_path
  source_code_hash = data.archive_file.lambda_code.output_base64sha256
  role = aws_iam_role.oneidp_redeployment_lambda_role.arn
  timeout = 10
  memory_size = 128
}

# Create a URL for the lambda function
resource "aws_lambda_function_url" "oneidp_redeployment_lambda_url" {
  provider = aws.lambda_region
  function_name      = aws_lambda_function.oneidp_redeployment_lambda.function_name
  authorization_type = "NONE"
}

# Output the URL of the lambda function
output "oneidp_redeployment_lambda_url" {
  value = aws_lambda_function_url.oneidp_redeployment_lambda_url.function_url
}

# Create a zip file with the lambda code
data "archive_file" "lambda_code" {
  type        = "zip"
  source_dir  = "lambda_code"
  output_path = "lambda_code/lambda_code.zip"
}

# Create the IAM role for the lambda function
resource "aws_iam_role" "oneidp_redeployment_lambda_role" {
  name = "oneidp-redeployment-lambda-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Effect = "Allow",
        Principal = {
          Service = "lambda.amazonaws.com"
        },
        Action = "sts:AssumeRole"
      }
    ]
  })
}

# Attach the necessary policies to the IAM role
resource "aws_iam_policy" "oneidp_redeployment_lambda_policy" {
  name = "oneidp-redeployment-lambda-policy"
  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Effect = "Allow",
        Action = [
          "ecs:UpdateService",
          "ecs:DescribeServices"
        ],
        Resource = aws_ecs_service.oneidp_service.id
      }
    ]
  })
}

# Attach the policy to the IAM role
resource "aws_iam_role_policy_attachment" "oneidp_redeployment_lambda_policy_attachment" {
  role = aws_iam_role.oneidp_redeployment_lambda_role.name
  policy_arn = aws_iam_policy.oneidp_redeployment_lambda_policy.arn
}

# Attach the AWSLambdaBasicExecutionRole policy to the IAM role
resource "aws_iam_role_policy_attachment" "oneidp_lambda_basic_execution" {
  role = aws_iam_role.oneidp_redeployment_lambda_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

