// Netlify function: Content moderation for uploaded images
// Uses OpenAI Moderation API (free) to check for policy violations

exports.config = {
    path: "/.netlify/functions/moderate-image"
};

exports.handler = async function (event) {
    if (event.httpMethod !== "POST") {
        return { statusCode: 405, body: "Method Not Allowed" };
    }

    // CORS headers
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Content-Type': 'application/json'
    };

    try {
        const { image_b64 } = JSON.parse(event.body);

        if (!image_b64) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ safe: false, error: "No image provided" })
            };
        }

        // Check image size (reject if base64 > ~5MB)
        if (image_b64.length > 7_000_000) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ safe: false, error: "Image too large (max 5MB)" })
            };
        }

        const apiKey = process.env.MY_OPENAI_KEY || process.env.OPENAI_API_KEY;
        if (!apiKey) {
            // If no API key configured, allow but log warning
            console.warn("No OpenAI API key configured for moderation — allowing image");
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ safe: true, skipped: true })
            };
        }

        // Call OpenAI Moderation API with image
        const response = await fetch('https://api.openai.com/v1/moderations', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: "omni-moderation-latest",
                input: [
                    {
                        type: "image_url",
                        image_url: {
                            url: `data:image/jpeg;base64,${image_b64}`
                        }
                    }
                ]
            })
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error("OpenAI Moderation API error:", response.status, errText);
            // On API error, allow the image but log it
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ safe: true, skipped: true, reason: "Moderation API unavailable" })
            };
        }

        const result = await response.json();
        const modResult = result.results?.[0];

        if (!modResult) {
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ safe: true, skipped: true })
            };
        }

        const flagged = modResult.flagged;
        const categories = modResult.categories || {};

        // Build list of flagged categories for logging
        const flaggedCategories = Object.entries(categories)
            .filter(([, v]) => v === true)
            .map(([k]) => k);

        if (flagged) {
            console.warn("Image flagged by moderation:", flaggedCategories.join(', '));
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                safe: !flagged,
                flagged_categories: flaggedCategories,
                message: flagged ? "This image violates our content policy. Please choose a different photo." : null
            })
        };

    } catch (err) {
        console.error("Moderation function error:", err);
        // On error, allow but log
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ safe: true, skipped: true, reason: "Internal error" })
        };
    }
};
