// Netlify function config
exports.config = {
    path: "/.netlify/functions/generate-avatar"
};

exports.handler = async function (event, context) {
    if (event.httpMethod !== "POST") {
        return { statusCode: 405, body: "Method Not Allowed" };
    }

    try {
        const { image_b64 } = JSON.parse(event.body);
        const apiKey = process.env.OPENAI_API_KEY;

        if (!apiKey) {
            return { statusCode: 500, body: JSON.stringify({ error: "Missing API Key" }) };
        }

        if (!image_b64) {
            return { statusCode: 400, body: JSON.stringify({ error: "No image provided" }) };
        }

        // ──────────────────────────────────────────────────────────
        // Use gpt-image-1 via the Images Edit API.
        // This model actually SEES the uploaded photo and can
        // preserve the person's likeness while applying a style.
        // ──────────────────────────────────────────────────────────

        // Convert base64 data URL to raw binary for multipart upload
        const base64Data = image_b64.replace(/^data:image\/\w+;base64,/, "");
        const imageBuffer = Buffer.from(base64Data, "base64");

        console.log("Analyzing selfie with gpt-4o-mini...");
        
        // Step 1: Analyze the image with GPT-4o-mini
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
                            { type: "text", text: "Describe the person in this image concisely: age, gender, hair color and style, skin tone, and distinguishing facial features. Keep it under 30 words." },
                            { type: "image_url", image_url: { url: `data:image/png;base64,${base64Data}`, detail: "low" } }
                        ]
                    }
                ],
                max_tokens: 50
            })
        });

        const visionData = await visionResponse.json();
        if (visionData.error) throw new Error(visionData.error.message);
        
        const description = visionData.choices[0].message.content;
        console.log("Description:", description);

        // Step 2: Generate avatar with DALL-E
        console.log("Generating avatar with DALL-E 3...");
        const dalleResponse = await fetch("https://api.openai.com/v1/images/generations", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "dall-e-3",
                prompt: `A stylized 2D mobile game character portrait of a soccer player. ${description} Flat colors, cel-shaded vector art style, matte finish, not glossy. Distinctive original cartoon style, expressive features, semi-realistic proportions. Wearing a cool street football jersey. Background: Urban street football court with a Subsoccer table game being played in the background, out of focus. Close-up portrait.`,
                n: 1,
                size: "1024x1024",
                response_format: "b64_json"
            })
        });

        const dalleData = await dalleResponse.json();

        if (dalleData.error) {
            console.error("OpenAI API error:", JSON.stringify(dalleData.error));
            if (dalleData.error.code === 'content_policy_violation' || (dalleData.error.message && dalleData.error.message.toLowerCase().includes('safety'))) {
                return {
                    statusCode: 400,
                    body: JSON.stringify({ error: "POLICY_VIOLATION" })
                };
            }
            throw new Error(dalleData.error.message);
        }

        console.log("Image generated successfully!");

        return {
            statusCode: 200,
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            },
            body: JSON.stringify({
                success: true,
                image_b64: dalleData.data[0].b64_json
            })
        };

    } catch (error) {
        console.error("Avatar generation error:", error.message);
        const isTimeout = error.name === 'AbortError' || (error.message && error.message.includes('abort'));
        return {
            statusCode: isTimeout ? 504 : 500,
            body: JSON.stringify({ error: isTimeout ? 'Generation took too long. Please try again.' : (error.message || 'Failed to generate image') })
        };
    }
};
