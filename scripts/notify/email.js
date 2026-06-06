const nodemailer = require('nodemailer');

/**
 * Lähettää sähköposti-ilmoituksen uusista brändimaininnoista.
 * Käyttää nodemailer-kirjastoa ja SMTP-asetuksia ympäristömuuttujista.
 */

function getConfig() {
  const to = process.env.NOTIFY_EMAIL_TO;
  const from = process.env.NOTIFY_EMAIL_FROM || to;
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = parseInt(process.env.SMTP_PORT, 10) || 587;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  return { to, from, host, port, user, pass };
}

function isConfigured(config) {
  return !!(config.to && config.user && config.pass);
}

function buildSourceBadge(source) {
  const colors = {
    google: { bg: '#1a472a', text: '#34d399' },
    reddit: { bg: '#4a2018', text: '#f97316' },
    twitter: { bg: '#1a3a5c', text: '#60a5fa' },
    youtube: { bg: '#4a1818', text: '#f87171' },
    facebook: { bg: '#1a2a4a', text: '#818cf8' },
  };

  const key = (source || '').toLowerCase();
  const color = colors[key] || { bg: '#1f2937', text: '#9ca3af' };

  return `<span style="
    display: inline-block;
    padding: 2px 10px;
    border-radius: 12px;
    font-size: 12px;
    font-weight: 600;
    background-color: ${color.bg};
    color: ${color.text};
    text-transform: uppercase;
    letter-spacing: 0.5px;
  ">${source || 'Tuntematon'}</span>`;
}

function buildMentionRow(mention, index) {
  const rowBg = index % 2 === 0 ? '#111827' : '#0d1321';
  const title = mention.title || 'Ei otsikkoa';
  const source = mention.source || 'Tuntematon';
  const link = mention.link || '#';
  const domain = mention.domain || '';

  return `
    <tr style="background-color: ${rowBg};">
      <td style="padding: 14px 16px; border-bottom: 1px solid #1f2937; color: #e5e7eb; font-size: 14px; max-width: 350px;">
        <a href="${link}" style="color: #10b981; text-decoration: none; font-weight: 500;" target="_blank">
          ${title}
        </a>
        ${domain ? `<br><span style="color: #6b7280; font-size: 11px;">${domain}</span>` : ''}
      </td>
      <td style="padding: 14px 16px; border-bottom: 1px solid #1f2937; text-align: center;">
        ${buildSourceBadge(source)}
      </td>
      <td style="padding: 14px 16px; border-bottom: 1px solid #1f2937; text-align: center;">
        <a href="${link}" style="
          display: inline-block;
          padding: 6px 16px;
          background-color: #10b981;
          color: #ffffff;
          text-decoration: none;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 600;
        " target="_blank">Avaa &rarr;</a>
      </td>
    </tr>`;
}

function buildHtmlEmail(mentions) {
  const now = new Date().toLocaleString('fi-FI', {
    timeZone: 'Europe/Helsinki',
    dateStyle: 'long',
    timeStyle: 'short',
  });

  const rows = mentions.map((m, i) => buildMentionRow(m, i)).join('\n');

  return `
<!DOCTYPE html>
<html lang="fi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Subsoccer – Uudet maininnat</title>
</head>
<body style="margin: 0; padding: 0; background-color: #070b14; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #070b14;">
    <tr>
      <td align="center" style="padding: 32px 16px;">
        <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="
          background-color: #0a0f1d;
          border-radius: 12px;
          border: 1px solid #1f2937;
          overflow: hidden;
          max-width: 640px;
          width: 100%;
        ">
          <!-- Header -->
          <tr>
            <td style="
              padding: 32px 32px 24px;
              background: linear-gradient(135deg, #0a0f1d 0%, #111d35 100%);
              border-bottom: 1px solid #1f2937;
            ">
              <h1 style="margin: 0 0 8px; color: #10b981; font-size: 24px; font-weight: 700;">
                🔍 Subsoccer Brand Monitor
              </h1>
              <p style="margin: 0; color: #9ca3af; font-size: 14px;">
                ${mentions.length} uutta mainintaa löydetty &middot; ${now}
              </p>
            </td>
          </tr>

          <!-- Table -->
          <tr>
            <td style="padding: 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <thead>
                  <tr style="background-color: #0d1424;">
                    <th style="padding: 12px 16px; text-align: left; color: #6b7280; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; border-bottom: 1px solid #1f2937;">
                      Maininta
                    </th>
                    <th style="padding: 12px 16px; text-align: center; color: #6b7280; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; border-bottom: 1px solid #1f2937;">
                      Lähde
                    </th>
                    <th style="padding: 12px 16px; text-align: center; color: #6b7280; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; border-bottom: 1px solid #1f2937;">
                      Linkki
                    </th>
                  </tr>
                </thead>
                <tbody>
                  ${rows}
                </tbody>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="
              padding: 24px 32px;
              background-color: #0d1424;
              border-top: 1px solid #1f2937;
              text-align: center;
            ">
              <p style="margin: 0; color: #4b5563; font-size: 12px;">
                Tämä viesti lähetettiin automaattisesti Subsoccer Brand Monitor -työkalusta.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Lähettää sähköposti-ilmoituksen uusista maininnoista.
 * @param {Array<{title: string, source: string, link: string, domain: string}>} newMentions
 */
async function notifyNewMentions(newMentions) {
  try {
    if (!newMentions || newMentions.length === 0) {
      console.log('📧 Ei uusia mainintoja – sähköpostia ei lähetetä.');
      return;
    }

    const config = getConfig();

    if (!isConfigured(config)) {
      console.warn('⚠️  Sähköpostiasetukset puuttuvat (NOTIFY_EMAIL_TO, SMTP_USER, SMTP_PASS). Ilmoitusta ei lähetetä.');
      return;
    }

    console.log(`📧 Lähetetään sähköposti-ilmoitus ${newMentions.length} uudesta maininnasta...`);

    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.port === 465,
      auth: {
        user: config.user,
        pass: config.pass,
      },
    });

    const subject = `🔍 Subsoccer: ${newMentions.length} uutta mainintaa löydetty!`;
    const html = buildHtmlEmail(newMentions);

    const info = await transporter.sendMail({
      from: config.from,
      to: config.to,
      subject,
      html,
    });

    console.log(`✅ Sähköposti lähetetty onnistuneesti: ${info.messageId}`);
  } catch (error) {
    console.error(`❌ Sähköpostin lähetys epäonnistui: ${error.message}`);
    throw error;
  }
}

module.exports = { notifyNewMentions };
