import { ECSClient, DescribeServicesCommand, UpdateServiceCommand } from "@aws-sdk/client-ecs";

const ECS_CLUSTER_REGION = process.env.ECS_CLUSTER_REGION;
const ECS_CLUSTER_NAME = process.env.ECS_CLUSTER_NAME;
const ECS_SERVICE_NAME = process.env.ECS_SERVICE_NAME;

const ecsClient = new ECSClient({ region: ECS_CLUSTER_REGION });

export async function handler(event) {
    let body;
    
    try {
        body = JSON.parse(event.body);
    } catch (error) {
        console.error("Malformatted JSON:", error);
        return {
            statusCode: 400,
            body: JSON.stringify({ message: "Malformatted webhook request:" }),
        };
    }

    try {
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
            body: JSON.stringify({ message: "Error processing the webhook.", error: error.message }),
        };
    }
}

async function forceEcsRedeployment() {
    try {
        console.log("Forcing ECS redeployment...");

        const describeCommand = new DescribeServicesCommand({
            cluster: ECS_CLUSTER_NAME,
            services: [ECS_SERVICE_NAME],
        });

        const describeServiceResponse = await ecsClient.send(describeCommand);
        const taskDefinitionArn = describeServiceResponse.services?.[0]?.taskDefinition;

        if (!taskDefinitionArn) {
            throw new Error("Task definition not found for the ECS service.");
        }

        console.log(`Current task definition: ${taskDefinitionArn}`);

        const updateCommand = new UpdateServiceCommand({
            cluster: ECS_CLUSTER_NAME,
            service: ECS_SERVICE_NAME,
            forceNewDeployment: true,
        });

        await ecsClient.send(updateCommand);

        console.log("ECS redeployment triggered successfully.");
    } catch (error) {
        console.error("Error forcing ECS redeployment:", error);
        throw error;
    }
}
