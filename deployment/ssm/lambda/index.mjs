import { SSMClient, SendCommandCommand } from "@aws-sdk/client-ssm";

const REGION = process.env.SSM_REGION; // e.g. eu-central-1
const INSTANCE_ID = process.env.INSTANCE_ID; // e.g. i-042e11f3943ed5ac
const DOCUMENT_NAME = process.env.DOCUMENT_NAME || "ONEIDP_DOCKER_REDEPLOYMENT";

const ssmClient = new SSMClient({ region: REGION });

export async function handler(event) {
    let body;

    try {
        body = JSON.parse(event.body);
    } catch (error) {
        console.error("Malformatted JSON:", error);
        return {
            statusCode: 400,
            body: JSON.stringify({ message: "Malformatted webhook request" }),
        };
    }

    try {
        const repoName = body.repository?.repo_name;
        const tag = body.push_data?.tag;

        console.log(`Received webhook for repository: ${repoName}, tag: ${tag}`);

        if (repoName === "pablo06/oneidp" && tag === "latest") {
            console.log("Image pushed with 'latest' tag. Running SSM document...");

            await runSsmDocument();

            return {
                statusCode: 200,
                body: JSON.stringify({ message: "SSM document executed for :latest image." }),
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

async function runSsmDocument() {
    try {
        console.log("Sending SSM command...");

        const command = new SendCommandCommand({
            Targets: [
                {
                    Key: "InstanceIds",
                    Values: [INSTANCE_ID],
                },
            ],
            DocumentName: DOCUMENT_NAME,
            Parameters: {
                ComposeFile: ["docker-compose.yaml"],
                WorkingDir: ["/oneidp/app"],
            },
        });

        const response = await ssmClient.send(command);

        console.log("SSM command sent successfully:", response.Command?.CommandId);
    } catch (error) {
        console.error("Error executing SSM document:", error);
        throw error;
    }
}
