# Create ECS Cluster
resource "aws_ecs_cluster" "oneidp-cluster" {
  name = "oneidp-cluster"
}


# Create Cloudwatch Log Group
resource "aws_cloudwatch_log_group" "oneidp-ecs-cluster-loggroup" {
  name              = "/ecs/oneidp-cluster"
  retention_in_days = 7
}