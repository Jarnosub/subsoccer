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
            if (taskId && supabaseUrl && supabaseKey) {
                const supabase = createClient(supabaseUrl, supabaseKey);
                const channel = supabase.channel(`avatar-${taskId}`);
                await new Promise((resolve) => {
                    channel.subscribe(async (status) => {
                        if (status === 'SUBSCRIBED') {
                            await channel.send({
                                type: 'broadcast',
                                event: 'avatar-error',
                                payload: { error: "Server configuration missing (API Key)" }
                            });
                            resolve();
                        }
                    });
                });
                await new Promise(r => setTimeout(r, 1000));
            }
            return { statusCode: 400, body: "Bad Request" };
        }

        const supabase = createClient(supabaseUrl, supabaseKey);

        // Convert base64 data URL to raw binary for multipart upload
        const base64Data = image_b64.replace(/^data:image\/\w+;base64,/, "");
        const imageBuffer = Buffer.from(base64Data, "base64");

        console.log(`[${taskId}] Step 1: Getting description from GPT-4o...`);

        // 1. Analyze selfie with GPT-4o
        const visionResp = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "gpt-4o",
                messages: [
                    {
                        role: "user",
                        content: [
                            { type: "text", text: "Describe the physical appearance of the person in this image in one concise paragraph. Focus ONLY on their face, hair color/style, eye color, skin tone, facial hair, glasses, or distinct facial features. Do not describe the background or clothing." },
                            { type: "image_url", image_url: { url: `data:image/png;base64,${base64Data}` } }
                        ]
                    }
                ],
                max_tokens: 150
            })
        });

        const visionData = await visionResp.json();
        if (visionData.error) throw new Error("Vision API error: " + visionData.error.message);
        
        const description = visionData.choices[0].message.content;
        console.log(`[${taskId}] Description:`, description);

        const prompt = `A stylized sports portrait of a person matching this exact physical description: ${description}

They are an elite street football player.

STYLE: Semi-realistic digital art inspired by FIFA Ultimate Team and NBA2K player cards. Slight illustrated texture, enhanced lighting, confident expression. NOT a cartoon, NOT a photo — premium AAA game artwork.
OUTFIT: Modern street football jersey with bold design. No specific brand logos.
LIGHTING: Cinematic stadium lighting with subtle neon accents and shallow depth of field. Dark atmospheric background.
COMPOSITION: Portrait from chest up, facing camera, centered, clean silhouette.
ABSOLUTELY NO: text, logos, badges, stats, overlays, frames, watermarks, extra objects, other people.`;

        console.log(`[${taskId}] Step 2: Generating avatar with dall-e-3...`);

        // 2. Generate with DALL-E 3
        const dalleResp = await fetch("https://api.openai.com/v1/images/generations", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "dall-e-3",
                prompt: prompt,
                n: 1,
                size: "1024x1024",
                response_format: "b64_json"
            })
        });

        const data = await dalleResp.json();

        if (data.error) {
            console.error(`[${taskId}] OpenAI error:`, JSON.stringify(data.error));
            const channel = supabase.channel(`avatar-${taskId}`);
            await new Promise((resolve) => {
                channel.subscribe(async (status) => {
                    if (status === 'SUBSCRIBED') {
                        await channel.send({
                            type: 'broadcast',
                            event: 'avatar-error',
                            payload: { error: data.error.message || "OpenAI API Error" }
                        });
                        resolve();
                    }
                });
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
            await new Promise((resolve) => {
                channel.subscribe(async (status) => {
                    if (status === 'SUBSCRIBED') {
                        await channel.send({
                            type: 'broadcast',
                            event: 'avatar-error',
                            payload: { error: "No image data received from API" }
                        });
                        resolve();
                    }
                });
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
                await new Promise((resolve) => {
                    channel.subscribe(async (status) => {
                        if (status === 'SUBSCRIBED') {
                            await channel.send({
                                type: 'broadcast',
                                event: 'avatar-error',
                                payload: { error: "Internal server error during background task" }
                            });
                            resolve();
                        }
                    });
                });
                await new Promise(r => setTimeout(r, 1000));
            }
        } catch (e) {}
        
        return { statusCode: 500, body: "Error" };
    }
};
