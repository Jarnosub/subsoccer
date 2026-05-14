// Netlify function config
exports.config = {
    path: "/.netlify/functions/analyze-face"
};

exports.handler = async function (event, context) {
    if (event.httpMethod !== "POST") {
        return { statusCode: 405, body: "Method Not Allowed" };
    }

    try {
        const { image_b64 } = JSON.parse(event.body);
        let apiKey = process.env.MY_OPENAI_KEY || process.env.OPENAI_API_KEY;
        if (apiKey && apiKey.startsWith("eyJ")) {
            apiKey = process.env.MY_OPENAI_KEY;
        }

        if (!apiKey) {
            return { statusCode: 500, body: JSON.stringify({ error: "Missing API Key" }) };
        }

        if (!image_b64) {
            return { statusCode: 400, body: JSON.stringify({ error: "No image provided" }) };
        }

        console.log("Analyzing face with gpt-4o-mini...");
        
        const visionResponse = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: [
                    {
                        role: "user",
                        content: [
                            {
                                type: "text",
                                text: "Describe this person's physical appearance (gender, approximate age, ethnicity, face shape, hair style and color, facial hair, glasses, distinct facial features) in exactly 1-2 highly descriptive sentences so an AI image generator can draw them accurately. Do NOT describe their clothing, expression, or the background. Focus ONLY on their face and head."
                            },
                            {
                                type: "image_url",
                                image_url: {
                                    url: `data:image/png;base64,${image_b64}`,
                                    detail: "low"
                                }
                            }
                        ]
                    }
                ],
                max_tokens: 150
            })
        });

        const visionData = await visionResponse.json();
        if (visionData.error) {
            console.error("GPT-4 Vision error:", visionData.error);
            throw new Error("Failed to analyze face: " + visionData.error.message);
        }

        const physicalDescription = visionData.choices[0].message.content.trim();
        console.log("Extracted physical description:", physicalDescription);

        return {
            statusCode: 200,
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            },
            body: JSON.stringify({ success: true, description: physicalDescription })
        };

    } catch (error) {
        console.error("Analyze face error:", error.message);
        return {
            statusCode: 500,
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            },
            body: JSON.stringify({ error: error.message || 'Failed to analyze face' })
        };
    }
};
