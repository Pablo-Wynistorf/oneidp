create database `users`;
use users;
CREATE TABLE `users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `username` varchar(255) NOT NULL,
  `password` varchar(255) NOT NULL,
  `email` varchar(255) NOT NULL,
  `access_token` varchar(255) NOT NULL,
  `password_reset_code` varchar(255) NOT NULL,
  `password_reset_token` varchar(255) NOT NULL,
  `email_verification_code` varchar(255) NOT NULL,
  `email_verification_token` varchar(255) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
