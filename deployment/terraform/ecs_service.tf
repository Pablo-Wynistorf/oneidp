# Create an ECS Service
resource "aws_ecs_service" "oneidp_service" {
  name            = "oneidp-service"
  cluster         = aws_ecs_cluster.oneidp_cluster.id
  task_definition = aws_ecs_task_definition.oneidp.arn
  desired_count   = 1
  launch_type     = "FARGATE"
  platform_version = "1.4.0"

  network_configuration {
    subnets         = [aws_subnet.oneidp_a_2.id, aws_subnet.oneidp_b_2.id, aws_subnet.oneidp_c_2.id]
    security_groups = [aws_security_group.http_by_loadbalancer.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.oneidp_target_group.arn
    container_name   = "oneidp"
    container_port   = 80
  }

  deployment_controller {
    type = "ECS"
  }
}

# Create a scaling target
resource "aws_appautoscaling_target" "oneidp_scaling_target" {
  service_namespace  = "ecs"
  resource_id        = "service/${aws_ecs_cluster.oneidp_cluster.name}/${aws_ecs_service.oneidp_service.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  min_capacity       = 1
  max_capacity       = 10
}

# Create a scaling policy
resource "aws_appautoscaling_policy" "scale_out_policy" {
  name               = "oneidp-scale-out"
  service_namespace  = "ecs"
  resource_id        = aws_appautoscaling_target.oneidp_scaling_target.resource_id
  scalable_dimension = aws_appautoscaling_target.oneidp_scaling_target.scalable_dimension
  policy_type        = "TargetTrackingScaling"

  target_tracking_scaling_policy_configuration {
    target_value       = 100
    predefined_metric_specification {
      predefined_metric_type = "ALBRequestCountPerTarget"
      resource_label         = "${aws_lb.oneidp_alb.arn_suffix}/${aws_lb_target_group.oneidp_target_group.arn_suffix}"
    }
    scale_in_cooldown  = 60
    scale_out_cooldown = 60
  }
}

# Create an Application Load Balancer
resource "aws_lb" "oneidp_alb" {
  name               = "oneidp-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.loadbalancer.id]
  subnets            = [aws_subnet.oneidp_a_1.id, aws_subnet.oneidp_b_1.id, aws_subnet.oneidp_c_1.id]
}

output "oneidp_alb_dns_name" {
  value = aws_lb.oneidp_alb.dns_name
}

# Create a Target Group for the ECS service
resource "aws_lb_target_group" "oneidp_target_group" {
  name        = "oneidp-tg"
  port        = 80
  protocol    = "HTTP"
  vpc_id      = aws_vpc.oneidp_vpc.id
  target_type = "ip"
  health_check {
    protocol            = "HTTP"
    path                = "/api/health"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 2
  }
}

# Create a http listener for the ALB
resource "aws_lb_listener" "oneidp_http_listener" {
  load_balancer_arn = aws_lb.oneidp_alb.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "redirect"
    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

# Create a https listener for the ALB
resource "aws_lb_listener" "oneidp_https_listener" {
  load_balancer_arn = aws_lb.oneidp_alb.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = aws_acm_certificate.oneidp_cert.arn
  
  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.oneidp_target_group.arn
  }
}

# Create a certificate for the ALB
resource "aws_acm_certificate" "oneidp_cert" {
  domain_name       = "oneidp.ch"
  validation_method = "EMAIL"
}