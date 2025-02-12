import { ECSClient, DescribeServicesCommand, UpdateServiceCommand } from "@aws-sdk/client-ecs";

const ecsClient = new ECSClient();

const clusterName = "oneidp-cluster";
const serviceName = "oneidp-service"; 

export async function handler(event) {
    try {
        const body = JSON.parse(event.body);

        const repoName = body.repository?.repo_name;
        const tag = body.push_data?.tag;

        console.log(`Received webhook for repository: ${repoName}, tag: ${tag}`);

        if (repoName === "pablo06/oneidp" && tag === "latest") {
            console.log("Image pushed with 'latest' tag. Triggering ECS redeployment...");

            await forceEcsRedeployment();

            return {
                statusCode: 200,
                body: JSON.stringify({ message: "ECS redeployment triggered for :latest image." }),
            };
        } else {
            console.log("No action taken. Repository or tag does not match.");

            return {
                statusCode: 200,
                body: JSON.stringify({ message: "No action taken." }),
            };
        }
    } catch (error) {
        console.error("Error processing the webhook:", error);

        return {
            statusCode: 500,
            body: JSON.stringify({ message: "Error processing the webhook.", error }),
        };
    }
}

async function forceEcsRedeployment() {
    try {
        console.log("Forcing ECS redeployment...");

        const describeCommand = new DescribeServicesCommand({
            cluster: clusterName,
            services: [serviceName],
        });

        const describeServiceResponse = await ecsClient.send(describeCommand);
        const taskDefinitionArn = describeServiceResponse.services?.[0]?.taskDefinition;

        if (!taskDefinitionArn) {
            throw new Error("Task definition not found for the ECS service.");
        }

        console.log(`Current task definition: ${taskDefinitionArn}`);

        const updateCommand = new UpdateServiceCommand({
            cluster: clusterName,
            service: serviceName,
            forceNewDeployment: true,
        });

        await ecsClient.send(updateCommand);

        console.log("ECS redeployment triggered successfully.");
    } catch (error) {
        console.error("Error forcing ECS redeployment:", error);
        throw error;
    }
}
