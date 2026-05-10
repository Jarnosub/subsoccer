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
        let apiKey = process.env.MY_OPENAI_KEY || process.env.OPENAI_API_KEY;
        if (apiKey && apiKey.startsWith("eyJ")) {
            apiKey = process.env.MY_OPENAI_KEY; // Ignore Netlify JWT overrides
        }

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

        // Build multipart/form-data
        const boundary = "----SubsoccerBoundary" + Date.now();

        const prompt = `Comic book illustration of this person as a street football player. Preserve their face, age, gender, facial hair, and glasses exactly.

Style: Bold outlines, vibrant cel-shaded comic art, flat colors. Cool street football jersey. Background: Urban street football court. NO UI elements, NO text, NO panels.`;

        // Construct multipart body
        const formParts = [];

        // -- image
        formParts.push(Buffer.from(
            `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="selfie.png"\r\nContent-Type: image/png\r\n\r\n`, "utf-8"
        ));
        formParts.push(imageBuffer);
        formParts.push(Buffer.from("\r\n", "utf-8"));

        // -- prompt
        formParts.push(Buffer.from(
            `--${boundary}\r\nContent-Disposition: form-data; name="prompt"\r\n\r\n${prompt}\r\n`, "utf-8"
        ));

        // -- model
        formParts.push(Buffer.from(
            `--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\ngpt-image-1\r\n`, "utf-8"
        ));

        // -- size (512x512 for much faster generation)
        formParts.push(Buffer.from(
            `--${boundary}\r\nContent-Disposition: form-data; name="size"\r\n\r\n512x512\r\n`, "utf-8"
        ));

        // -- closing
        formParts.push(Buffer.from(`--${boundary}--\r\n`, "utf-8"));

        const body = Buffer.concat(formParts);

        console.log("Sending image to gpt-image-1 edit API... (" + (imageBuffer.length / 1024).toFixed(0) + " KB image)");

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 120000); // 120s for detailed images

        const response = await fetch("https://api.openai.com/v1/images/edits", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": `multipart/form-data; boundary=${boundary}`
            },
            body: body,
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        const data = await response.json();

        if (data.error) {
            console.error("OpenAI API error:", JSON.stringify(data.error));
            if (data.error.code === 'content_policy_violation' || (data.error.message && data.error.message.toLowerCase().includes('safety'))) {
                return {
                    statusCode: 400,
                    body: JSON.stringify({ error: "POLICY_VIOLATION" })
                };
            }
            throw new Error(data.error.message);
        }

        console.log("Image generated successfully!");

        // gpt-image-1 returns b64_json by default
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

        // If URL was returned, fetch and convert to b64
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
