// Netlify function config
exports.config = {
    path: "/.netlify/functions/generate-avatar"
};

exports.handler = async function (event, context) {
    if (event.httpMethod !== "POST") {
        return { statusCode: 405, body: "Method Not Allowed" };
    }

    try {
        const { description } = JSON.parse(event.body);
        let apiKey = process.env.MY_OPENAI_KEY || process.env.OPENAI_API_KEY;
        if (apiKey && apiKey.startsWith("eyJ")) {
            apiKey = process.env.MY_OPENAI_KEY; // Ignore Netlify JWT overrides
        }

        if (!apiKey) {
            return { statusCode: 500, body: JSON.stringify({ error: "Missing API Key" }) };
        }

        if (!description) {
            return { statusCode: 400, body: JSON.stringify({ error: "No description provided" }) };
        }

        console.log("Generating avatar with dall-e-3 based on description...");

        const prompt = `A stylized sports portrait of a person matching this exact physical description: ${description}

They are an elite street football player.

STYLE: Semi-realistic digital art inspired by FIFA Ultimate Team and NBA2K player cards. Slight illustrated texture, enhanced lighting, confident expression. NOT a cartoon, NOT a photo — premium AAA game artwork.

OUTFIT: Modern street football jersey with bold design. No specific brand logos.

LIGHTING: Cinematic stadium lighting with subtle neon accents and shallow depth of field. Dark atmospheric background.

COMPOSITION: Portrait from chest up, facing camera, centered, clean silhouette.

ABSOLUTELY NO: text, logos, badges, stats, overlays, frames, watermarks, extra objects, other people.`;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 120000);

        const dalleResponse = await fetch("https://api.openai.com/v1/images/generations", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "gpt-image-1.5",
                prompt: prompt,
                n: 1,
                size: "1024x1024"
            }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        const data = await dalleResponse.json();

        if (data.error) {
            console.error("GPT Image 2 error:", JSON.stringify(data.error));
            if (data.error.code === 'content_policy_violation' || (data.error.message && data.error.message.toLowerCase().includes('safety'))) {
                return {
                    statusCode: 400,
                    body: JSON.stringify({ error: "POLICY_VIOLATION" })
                };
            }
            throw new Error(data.error.message);
        }

        console.log("Image generated successfully with GPT Image 1.5!");

        if (data.data && data.data[0] && data.data[0].b64_json) {
            return {
                statusCode: 200,
                headers: {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*"
                },
                body: JSON.stringify({ success: true, image_b64: data.data[0].b64_json })
            };
        }

        if (data.data && data.data[0] && data.data[0].url) {
            const imgResp = await fetch(data.data[0].url);
            const imgBuf = await imgResp.arrayBuffer();
            const b64 = Buffer.from(imgBuf).toString("base64");
            return {
                statusCode: 200,
                headers: {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*"
                },
                body: JSON.stringify({ success: true, image_b64: b64 })
            };
        }

        throw new Error("No image data in response");

    } catch (error) {
        console.error("Avatar generation error:", error.message);
        const isTimeout = error.name === 'AbortError' || (error.message && error.message.includes('abort'));
        return {
            statusCode: isTimeout ? 504 : 500,
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            },
            body: JSON.stringify({ error: isTimeout ? 'Generation took too long. Please try again.' : (error.message || 'Failed to generate image') })
        };
    }
};
