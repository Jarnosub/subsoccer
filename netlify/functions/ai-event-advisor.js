// Netlify function for Subsoccer AI Event Advisor
exports.config = {
  path: "/.netlify/functions/ai-event-advisor"
};

const SYSTEM_PROMPT = `You are the official Subsoccer® AI Event Advisor & Tournament Architect.
Your mission is to help corporate event planners, sports clubs, brand managers, marketing agencies, shopping malls, and festival organizers design the ultimate Subsoccer table soccer experience.

KNOWLEDGE BASE & BENCHMARKS:
- Core Game: Subsoccer is the patented 1v1 seated table soccer game played inside a transparent-topped bench table. Fast, exciting, highly engaging for all ages (kids to pros).
- Subsoccer GO (Launched Spring 2026): The digital tournament and match management web platform. Players scan a QR code on the table to launch games, log scores, join live 8/16/32-player tournament brackets, and compete on digital leaderboards.
- Key Metrics: 10,777+ real matches played, 6,549 instant 1v1 games, 3,857 tournament bracket matches, 67% scan-to-play conversion rate, 77% player retention, played in 79 countries across 807 locations. 75 countries with tables delivered.
- Throughput Calculation:
  * 1 match takes ~2 minutes (first to 3 or 5 goals).
  * 1 table throughput = 20-30 matches/hour (40-60 unique players/hour).
  * 50-150 guests: 1-2 tables.
  * 150-400 guests: 2-3 tables.
  * 400-1000 guests: 3-5 tables (recommend 1 "Centre Court" finals table with TV screen connected to Subsoccer GO Lounge view).
  * 1000+ guests / Festivals: 4-6 tables with branded goal nets, influencer showmatches, and King of the Table speedruns.
- Proven Global Case Studies (mention relevant ones based on context):
  * Stadiums / Football Clubs: Wembley Stadium (UCL Final & Sidemen Match), Red Bull Arena Leipzig, Olympiapark Munich, Sporting Kansas City (MLS), FC Machida Zelvia (Japan).
  * Brand Activations / F1: F1 Belgian GP Spa (Checo Perez & Valtteri Bottas), F1 Mexico City GP, Coca-Cola x FIFA Los Angeles, Visa x Lamine Yamal (Barcelona), Uber x MetLife Stadium (NYC), Moeve x LaLiga (Madrid).
  * Malls & Entertainment: Mall of Tripla (Helsinki), Yas Mall (Abu Dhabi), SuperPark Glasgow, Retroids Arcade Bar (UK), Fashion District Philadelphia.
  * Festivals & Public Events: Lovestream Festival (Bratislava), Sidemen Charity Match, Lima Juega (Peru), London Lionesses Fan Zone.

RESPONSE GUIDELINES:
- Always reply in the same language the user writes in (Finnish if Finnish, English if English).
- Be concise, energetic, professional, and directly actionable.
- Structure recommendations clearly:
  1. 🎯 Tapahtumakonsepti & Aikataulu (Event Concept & Flow)
  2. 🏓 Suositeltu pöytämäärä & kapasiteetti (Tables needed & player throughput)
  3. 📱 Subsoccer GO -turnausformaatti (Digital tournament / instant format)
  4. 🌟 Relevantti aito referenssicase sivulta (Real matching case study)
  5. 💡 Pro-vinkki (Brändäys, älytaulu tai palkinnot)
- Keep responses friendly, structured with bullet points, under 250 words so it fits nicely in a chat drawer.`;

exports.handler = async function (event, context) {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS"
      }
    };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const userMessage = body.message || "";
    const conversationHistory = body.history || [];

    if (!userMessage.trim()) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error: "Message is required" })
      };
    }

    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      const fallbackResponse = generateSmartFallback(userMessage);
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ reply: fallbackResponse, mode: "knowledge-engine" })
      };
    }

    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...conversationHistory.slice(-6).map(h => ({
        role: h.role === "user" ? "user" : "assistant",
        content: h.content
      })),
      { role: "user", content: userMessage }
    ];

    const openAiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: messages,
        max_tokens: 600,
        temperature: 0.7
      })
    });

    if (!openAiRes.ok) {
      const fallbackResponse = generateSmartFallback(userMessage);
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ reply: fallbackResponse, mode: "knowledge-engine-fallback" })
      };
    }

    const data = await openAiRes.json();
    const reply = data.choices && data.choices[0] && data.choices[0].message
      ? data.choices[0].message.content
      : generateSmartFallback(userMessage);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ reply: reply, mode: "ai" })
    };

  } catch (err) {
    console.error("AI Event Advisor error:", err);
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({
        reply: generateSmartFallback(event.body ? JSON.parse(event.body).message || "" : ""),
        mode: "fallback-error"
      })
    };
  }
};

function generateSmartFallback(msg) {
  const m = msg.toLowerCase();
  const isFi = /mobiili|yritys|peli|pöytä|ihmistä|henkeä|turnaus|tapahtuma|seura|stadion|brändi|miten|paljonko|festar|kesä/.test(m);

  if (isFi) {
    if (m.includes("seura") || m.includes("stadion") || m.includes("fanzone") || m.includes("fani")) {
      return "### 🏟️ Matchday Fan Zone -suositus:\n\n" +
        "• **Pöytämäärä:** 2–3 Subsoccer-pöytää stadionin sisäänkäynneille tai fan zoneen.\n" +
        "• **Läpivirtaus:** ~50–70 peliä tunnissa (ottelu n. 2 min / peli). Subsoccer GO:n QR-koodi aktivoi jopa 67 % kävijöistä heti peliin.\n" +
        "• **Konsepti:** \n" +
        "  1. *Ennen ottelua:* Vapaa King of the Table -haaste lapsille ja aikuisille.\n" +
        "  2. *Puoliaika:* VIP-ottelu tai some-vaikuttajien 1v1-finaali.\n" +
        "• **Aito referenssi:** Katso sivulta *Wembley Stadium (UCL Final)* ja *Red Bull Arena Leipzig* -toteutukset!\n" +
        "• **Pro-vinkki:** Pöytien verkot ja sivulaidat voidaan brändätä seuran ja pääsponsorin väreihin.";
    }
    if (m.includes("brändi") || m.includes("f1") || m.includes("sponsor") || m.includes("messu")) {
      return "### 🏎️ Brändi- & Sponsoriaktivointi:\n\n" +
        "• **Pöytämäärä:** 2 kustomoitua Subsoccer-pöytää.\n" +
        "• **Konsepti:** Huippunäyttävä messu- tai VIP-aktivointi, jossa jokainen pelattu ottelu kerää liidejä Subsoccer GO -QR-skannauksen kautta.\n" +
        "• **Läpivirtaus:** 40–60 pelaajaa tunnissa. 77 % pelaajista palaa kokeilemaan uudelleen.\n" +
        "• **Aito referenssi:** Katso sivulta *F1 Spa-Francorchamps (Bottas & Perez)*, *Coca-Cola x FIFA LA* tai *Visa x Lamine Yamal (Barcelona)*!\n" +
        "• **Pro-vinkki:** Integroitu tulostaulu isolle näytölle tekee jokaisesta 1v1-matsista yleisömagneetin.";
    }
    return "### 🎯 Subsoccer Tapahtumasuunnitelma:\n\n" +
      "• **Pöytämäärä:** 2 Subsoccer-pöytää (riittää jopa 200–500 hengen tapahtumiin erinomaisesti).\n" +
      "• **Kapasiteetti:** ~40–60 peliä tunnissa. 1 ottelu kestää n. 2 minuuttia (first to 3 goals).\n" +
      "• **Turnausformaatti:**\n" +
      "  1. Alkuun 1–2 h vapaata 1v1 Instant Play -peliä.\n" +
      "  2. Lopuksi 16 tai 32 pelaajan nopea pudotuspeliturnaus Subsoccer GO -sovelluksella.\n" +
      "• **Aito referenssi:** Vastaava konsepti toteutettiin mm. *Lovestream Festivalilla* ja *Mall of Triplassa* (76 videoreferenssiä sivulla).\n" +
      "• **Haluatko tarkemman laskelman?** Kerro osallistujamäärä ja tapahtuman kesto!";
  }

  return "### 🎯 Subsoccer Event Blueprint:\n\n" +
    "• **Recommended Tables:** 2 Subsoccer tables (ideal for 150–500 guests).\n" +
    "• **Throughput:** ~40–60 matches/hour. Average match time is ~2 minutes (first to 3 goals).\n" +
    "• **Tournament Format:**\n" +
    "  1. Open 1v1 challenge for the first half of the event.\n" +
    "  2. 16 or 32-player single-elimination tournament bracket using Subsoccer GO QR app.\n" +
    "• **Case Study References:** Check out *Wembley Stadium*, *F1 Spa Fan Zone*, and *Lovestream Festival* on this page!\n" +
    "• **Need a tailored estimate?** Tell me your guest count and event duration!";
}
