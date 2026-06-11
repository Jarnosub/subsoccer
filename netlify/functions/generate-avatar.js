// Netlify function config
exports.config = {
    path: "/.netlify/functions/generate-avatar"
};

// ============================================================
// RATE LIMITING (in-memory, resets on cold start)
// For persistent limiting, use Supabase or Redis in the future
// ============================================================
const rateLimitMap = new Map(); // key: userId -> { count, resetAt }
const globalCounter = { count: 0, resetAt: 0 };

const PER_USER_MAX = 5;       // max 5 avatars per user per hour
const PER_USER_WINDOW = 60 * 60 * 1000; // 1 hour
const GLOBAL_DAILY_MAX = 100;  // kill switch: max 100 total per day
const GLOBAL_WINDOW = 24 * 60 * 60 * 1000; // 24 hours

function checkRateLimit(userId) {
    const now = Date.now();

    // Global kill switch
    if (now > globalCounter.resetAt) {
        globalCounter.count = 0;
        globalCounter.resetAt = now + GLOBAL_WINDOW;
    }
    if (globalCounter.count >= GLOBAL_DAILY_MAX) {
        return { allowed: false, reason: 'Daily avatar generation limit reached. Please try again tomorrow.' };
    }

    // Per-user limit
    const userLimit = rateLimitMap.get(userId);
    if (userLimit && now < userLimit.resetAt) {
        if (userLimit.count >= PER_USER_MAX) {
            return { allowed: false, reason: `You can generate up to ${PER_USER_MAX} avatars per hour. Please wait.` };
        }
        userLimit.count++;
    } else {
        rateLimitMap.set(userId, { count: 1, resetAt: now + PER_USER_WINDOW });
    }

    globalCounter.count++;
    return { allowed: true };
}

// ============================================================
// CORS helpers
// ============================================================
const ALLOWED_ORIGINS = ['https://subsoccer.pro', 'https://staging.subsoccer.pro', 'http://localhost:8787', 'http://127.0.0.1:8082'];

function getCorsHeaders(origin) {
    const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
    return {
        "Access-Control-Allow-Origin": allowed,
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Content-Type": "application/json"
    };
}

// ============================================================
// MAIN HANDLER
// ============================================================
exports.handler = async function (event, context) {
    const origin = event.headers?.origin || '';
    const corsHeaders = getCorsHeaders(origin);

    // Handle CORS preflight
    if (event.httpMethod === "OPTIONS") {
        return { statusCode: 204, headers: corsHeaders, body: "" };
    }

    if (event.httpMethod !== "POST") {
        return { statusCode: 405, headers: corsHeaders, body: "Method Not Allowed" };
    }

    try {
        // ==========================================
        // AUTH CHECK: Verify Supabase JWT token
        // ==========================================
        const authHeader = event.headers?.authorization || '';
        if (!authHeader.startsWith('Bearer ')) {
            return {
                statusCode: 401,
                headers: corsHeaders,
                body: JSON.stringify({ error: "Authentication required. Please log in." })
            };
        }

        const token = authHeader.replace('Bearer ', '');

        // Verify token with Supabase
        const supabaseUrl = process.env.SUPABASE_URL || 'https://ujxmmrsmdwrgcwatdhvx.supabase.co';
        const verifyResp = await fetch(`${supabaseUrl}/auth/v1/user`, {
            headers: { 'Authorization': `Bearer ${token}`, 'apikey': process.env.SUPABASE_ANON_KEY || '' }
        });

        if (!verifyResp.ok) {
            return {
                statusCode: 401,
                headers: corsHeaders,
                body: JSON.stringify({ error: "Invalid or expired session. Please log in again." })
            };
        }

        const user = await verifyResp.json();
        const userId = user.id;

        if (!userId) {
            return {
                statusCode: 401,
                headers: corsHeaders,
                body: JSON.stringify({ error: "Could not verify user identity." })
            };
        }

        // ==========================================
        // RATE LIMIT CHECK
        // ==========================================
        const rl = checkRateLimit(userId);
        if (!rl.allowed) {
            console.warn(`Rate limit hit for user ${userId}: ${rl.reason}`);
            return {
                statusCode: 429,
                headers: corsHeaders,
                body: JSON.stringify({ error: rl.reason })
            };
        }

        // ==========================================
        // GENERATE AVATAR
        // ==========================================
        const { description } = JSON.parse(event.body);
        let apiKey = process.env.MY_OPENAI_KEY || process.env.OPENAI_API_KEY;
        if (apiKey && apiKey.startsWith("eyJ")) {
            apiKey = process.env.MY_OPENAI_KEY;
        }

        if (!apiKey) {
            return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: "Missing API Key" }) };
        }

        if (!description) {
            return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "No description provided" }) };
        }

        console.log(`Generating avatar for user ${userId} with dall-e-3...`);

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
                    headers: corsHeaders,
                    body: JSON.stringify({ error: "POLICY_VIOLATION" })
                };
            }
            throw new Error(data.error.message);
        }

        console.log("Image generated successfully with GPT Image 1.5!");

        if (data.data && data.data[0] && data.data[0].b64_json) {
            return {
                statusCode: 200,
                headers: corsHeaders,
                body: JSON.stringify({ success: true, image_b64: data.data[0].b64_json })
            };
        }

        if (data.data && data.data[0] && data.data[0].url) {
            const imgResp = await fetch(data.data[0].url);
            const imgBuf = await imgResp.arrayBuffer();
            const b64 = Buffer.from(imgBuf).toString("base64");
            return {
                statusCode: 200,
                headers: corsHeaders,
                body: JSON.stringify({ success: true, image_b64: b64 })
            };
        }

        throw new Error("No image data in response");

    } catch (error) {
        console.error("Avatar generation error:", error.message);
        const corsHeaders2 = getCorsHeaders(event.headers?.origin || '');
        const isTimeout = error.name === 'AbortError' || (error.message && error.message.includes('abort'));
        return {
            statusCode: isTimeout ? 504 : 500,
            headers: corsHeaders2,
            body: JSON.stringify({ error: isTimeout ? 'Generation took too long. Please try again.' : (error.message || 'Failed to generate image') })
        };
    }
};
