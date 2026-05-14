// Netlify background function config
exports.config = {
    path: "/.netlify/functions/generate-avatar-background"
};

const { createClient } = require('@supabase/supabase-js');

exports.handler = async function (event, context) {
    if (event.httpMethod !== "POST") {
        return { statusCode: 405, body: "Method Not Allowed" };
    }

    try {
        const { image_b64, taskId, supabaseUrl, supabaseKey } = JSON.parse(event.body);
        let apiKey = process.env.MY_OPENAI_KEY || process.env.OPENAI_API_KEY;
        if (apiKey && apiKey.startsWith("eyJ")) {
            apiKey = process.env.MY_OPENAI_KEY;
        }

        if (!apiKey || !image_b64 || !taskId || !supabaseUrl || !supabaseKey) {
            console.error("Missing required parameters for background generation");
            return { statusCode: 400, body: "Bad Request" };
        }

        const supabase = createClient(supabaseUrl, supabaseKey);

        // Convert base64 data URL to raw binary for multipart upload
        const base64Data = image_b64.replace(/^data:image\/\w+;base64,/, "");
        const imageBuffer = Buffer.from(base64Data, "base64");

        const boundary = "----SubsoccerBoundary" + Date.now();

        const prompt = `Stylized sports portrait of this person as an elite street football player.

IDENTITY: Preserve their exact facial features, skin tone, hair, glasses, and facial hair. This must look like THEM — just upgraded.

STYLE: Semi-realistic digital art inspired by FIFA Ultimate Team and NBA2K player cards. Slight illustrated texture, enhanced lighting, confident expression. NOT a cartoon, NOT a photo — premium AAA game artwork.

OUTFIT: Modern street football jersey with bold design. No specific brand logos.

LIGHTING: Cinematic stadium lighting with subtle neon accents and shallow depth of field. Dark atmospheric background.

COMPOSITION: Portrait from chest up, facing camera, centered, clean silhouette.

ABSOLUTELY NO: text, logos, badges, stats, overlays, frames, watermarks, extra objects, other people.`;

        const formParts = [];
        formParts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="selfie.png"\r\nContent-Type: image/png\r\n\r\n`, "utf-8"));
        formParts.push(imageBuffer);
        formParts.push(Buffer.from("\r\n", "utf-8"));
        formParts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="prompt"\r\n\r\n${prompt}\r\n`, "utf-8"));
        formParts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\ngpt-image-2\r\n`, "utf-8"));
        formParts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="size"\r\n\r\n1024x1024\r\n`, "utf-8"));
        formParts.push(Buffer.from(`--${boundary}--\r\n`, "utf-8"));

        const body = Buffer.concat(formParts);

        console.log(`[${taskId}] Sending image to gpt-image-2 edit API...`);

        // No timeout for background functions! Let it take as long as it needs.
        const response = await fetch("https://api.openai.com/v1/images/edits", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": `multipart/form-data; boundary=${boundary}`
            },
            body: body
        });

        const data = await response.json();

        if (data.error) {
            console.error(`[${taskId}] OpenAI error:`, JSON.stringify(data.error));
            const channel = supabase.channel(`avatar-${taskId}`);
            await channel.subscribe();
            await channel.send({
                type: 'broadcast',
                event: 'avatar-error',
                payload: { error: data.error.message || "OpenAI API Error" }
            });
            await new Promise(r => setTimeout(r, 1000));
            return { statusCode: 500, body: "Error" };
        }

        let finalImageBuffer;
        if (data.data && data.data[0] && data.data[0].b64_json) {
            finalImageBuffer = Buffer.from(data.data[0].b64_json, "base64");
        } else if (data.data && data.data[0] && data.data[0].url) {
            const imgResp = await fetch(data.data[0].url);
            finalImageBuffer = Buffer.from(await imgResp.arrayBuffer());
        }

        if (!finalImageBuffer) {
            console.error(`[${taskId}] No image data received`);
            const channel = supabase.channel(`avatar-${taskId}`);
            await channel.subscribe();
            await channel.send({
                type: 'broadcast',
                event: 'avatar-error',
                payload: { error: "No image data received from API" }
            });
            await new Promise(r => setTimeout(r, 1000));
            return { statusCode: 500, body: "Error" };
        }

        // Send back via Supabase Realtime Broadcast
        console.log(`[${taskId}] Broadcasting generated image back to client...`);
        const channel = supabase.channel(`avatar-${taskId}`);
        await new Promise((resolve) => {
            channel.subscribe(async (status) => {
                if (status === 'SUBSCRIBED') {
                    await channel.send({
                        type: 'broadcast',
                        event: 'avatar-ready',
                        payload: { image_b64: finalImageBuffer.toString('base64') }
                    });
                    console.log(`[${taskId}] Successfully broadcasted!`);
                    resolve();
                }
            });
        });

        // Small delay to ensure delivery
        await new Promise(r => setTimeout(r, 1000));
        await supabase.removeChannel(channel);

        return { statusCode: 200, body: "Success" };

    } catch (error) {
        console.error("Background task error:", error.message);
        
        try {
            const { taskId, supabaseUrl, supabaseKey } = JSON.parse(event.body);
            if (taskId && supabaseUrl && supabaseKey) {
                const supabase = createClient(supabaseUrl, supabaseKey);
                const channel = supabase.channel(`avatar-${taskId}`);
                await channel.subscribe();
                await channel.send({
                    type: 'broadcast',
                    event: 'avatar-error',
                    payload: { error: "Internal server error during background task" }
                });
                await new Promise(r => setTimeout(r, 1000));
            }
        } catch (e) {}
        
        return { statusCode: 500, body: "Error" };
    }
};
