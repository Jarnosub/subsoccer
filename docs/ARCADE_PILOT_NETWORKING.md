# Subsoccer Arcade / Pulse: Netlify-to-NETIO Venue Networking Architecture

This document specifies how serverless Netlify Functions (`arcade-session.js`) securely communicate with the physical **NETIO PowerBOX 3PF** hardware relay installed in a commercial venue (e.g., Mall of Tripla, sports bar, or entertainment lounge).

---

## 1. Threat Model & Security Requirements

### The Golden Rule
> **NEVER expose the NETIO PowerBOX 3PF directly to the public internet** by port-forwarding port 80 or 443 on the venue's commercial router.

**Risks of Raw Exposure:**
- NETIO PowerBOX 3PF uses HTTP Basic Authentication over its JSON API (`/netio.json`). Without an encrypted tunnel, credentials can be intercepted.
- Embedded microcontrollers on smart PDUs are vulnerable to denial-of-service (DoS) and brute-force scans from automated scanners (e.g. Shodan, Censys).
- If unauthorized actors trip or cycle outlets, physical arcade units and power supplies could experience hardware stress or service interruption.

---

## 2. Production Networking Patterns

Because Netlify serverless functions execute in AWS Lambda multi-tenant IP pools with dynamic outbound IP addresses, static IP allowlisting at the venue firewall is difficult without a dedicated NAT gateway.

The following architectures solve this securely:

### Option A: Cloudflare Tunnel (Recommended)

```
[Customer Browser / QR]
        │
        ▼ (HTTPS)
[Netlify Serverless Function: arcade-session.js]
        │
        ▼ (HTTPS with custom authorization header)
[Cloudflare Edge: https://pulse-relay.subsoccer.pro]
        │
        ▼ (Encrypted Cloudflare Tunnel - Outbound only from venue)
[Venue Gateway: Raspberry Pi / Venue Server running `cloudflared`]
        │
        ▼ (Local Gigabit Subnet: 192.168.1.150:80)
[NETIO PowerBOX 3PF (Physical Table Relay)]
```

#### Setup Steps:
1. Install a lightweight edge device on the venue LAN (e.g., Raspberry Pi 4/5 or existing POS server).
2. Install Cloudflare Tunnel (`cloudflared` daemon). The daemon establishes an outbound-only connection to Cloudflare edge; no inbound open ports on the venue router.
3. Configure `cloudflared` ingress rule:
   ```yaml
   tunnel: <TUNNEL_ID>
   credentials-file: /etc/cloudflared/<TUNNEL_ID>.json
   ingress:
     - hostname: pulse-relay.subsoccer.pro
       service: http://192.168.1.150:80
     - service: http_status:404
   ```
4. Set Cloudflare Access Service Token or custom secret header (`x-pulse-gateway-key`) to ensure only Netlify functions can reach the hostname.
5. In Netlify environment variables:
   ```env
   NETIO_BASE_URL=https://pulse-relay.subsoccer.pro
   NETIO_USERNAME=admin
   NETIO_PASSWORD=<STRONG_GENERATED_PASSWORD>
   ```

---

### Option B: Tailscale Funnel / Subnet Router

```
[Netlify Serverless Function] 
        │
        ▼ (HTTPS with Bearer Token)
[Tailscale Funnel / Tailscale Node in Venue]
        │
        ▼ (Private Tailnet / LAN)
[NETIO PowerBOX 3PF]
```

#### Setup Steps:
1. Run a Tailscale node on the venue network with `--advertise-routes=192.168.1.0/24`.
2. Expose a tiny reverse proxy (e.g. Caddy or Nginx) via `tailscale funnel` requiring a pre-shared bearer token.
3. Caddy proxies incoming authenticated requests to `http://192.168.1.150/netio.json`.

---

### Option C: Reverse Proxy with TLS & Client Authentication

If the venue has a static public IP:
1. Use an Nginx or Caddy reverse proxy on port 443 with Let's Encrypt TLS.
2. Configure basic authentication or custom header verification (`X-Arcade-PDU-Secret`).
3. Forward requests to the internal IP of the NETIO PowerBOX.

---

## 3. Netlify Function Configuration Reference

The following environment variables must be defined in Netlify Dashboard (`Site Settings > Environment Variables`):

| Variable | Description | Example / Note |
| :--- | :--- | :--- |
| `NETIO_BASE_URL` | HTTPS URL to the authenticated tunnel/proxy | `https://pulse-relay.subsoccer.pro` |
| `NETIO_USERNAME` | NETIO JSON API username | `admin` |
| `NETIO_PASSWORD` | Strong password configured on NETIO device | (Never commit to git) |
| `ADMIN_TOKEN` | Secret key required for emergency stop & outlet control | (Generate with `openssl rand -hex 32`) |
| `PILOT_TABLE_ID` | Restricts API to single active pilot table | `subsoccer-tripla-live-01` |
| `ARCADE_ENV` | Environment mode | `production` (disables mock simulation) |
| `SUPABASE_URL` | Supabase project URL | `https://xyz.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Backend service key with RLS bypass | (Never expose to client) |

---

## 4. Hardware Verification Checklist (Prior to Public Launch)

Before activating public customer QR codes:

- [ ] **Physical Watchdog Verification:**
  Trigger timed play of 15 minutes. Unplug the network cable from NETIO. Confirm that NETIO's internal hardware timer automatically turns outlet 1 OFF after 15 minutes without needing server intervention.
- [ ] **Timeout / Disconnect Probe Verification:**
  Simulate network drop while starting a session. Verify that `arcade-session` attempts probe, falls back to `HARDWARE_UNCERTAIN`, sets table to `error_locked`, and prevents concurrent player booking.
- [ ] **Idempotency Replay Verification:**
  Submit payment/activation twice with same `client_session_token`. Verify second request returns 200 `isIdempotentReplay: true` without resetting or double-pulsing the relay.
- [ ] **Operator Emergency Cut Verification:**
  From `arcade.html` (with `?admin=1`), trigger Emergency Cut with `ADMIN_TOKEN`. Confirm relay cuts power within 1.5 seconds and UI transitions to COOLDOWN.
- [ ] **Unauthorized Activation Block:**
  Test scanning table QR on production table without admin token or pre-approved free-play. Confirm API returns `403 ACTIVATION_RESTRICTED`.
