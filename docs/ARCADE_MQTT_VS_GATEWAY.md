# Subsoccer Arcade Architecture Comparison: Direct NETIO MQTT Broker vs. Local Venue Gateway

## Executive Summary

Subsoccer Arcade / Pulse operates physical tables across commercial venues (sports bars, entertainment centers, shopping malls). Reliable, real-time, bidirectional communication between the central platform (Netlify serverless functions + Supabase DB) and the on-site hardware (**NETIO PowerBOX 3PF**) is essential for payment-triggered activations, game timer synchronization, display control, and telemetry reconciliation.

This document evaluates and compares two primary architectural patterns:
1. **Direct NETIO MQTT (Native M2M Broker)**
2. **Local Venue Gateway with Cloudflare Tunnel (HTTP Reverse Proxy)**

It concludes with a recommended phased adoption path for the Subsoccer Arcade fleet.

---

## Architecture 1: Direct NETIO MQTT Broker

### Topology Overview
In this model, the NETIO PowerBOX 3PF uses its built-in MQTT client firmware (`MQTT-flex`) to initiate an encrypted outbound TLS connection (port 8883) directly to a cloud-hosted MQTT broker (e.g. AWS IoT Core, HiveMQ Cloud, or EMQX).

```
┌─────────────────────────────────────────────────────────┐
│                     CLOUD LAYER                         │
│                                                         │
│  [Customer Phone]                                       │
│         │ (Stripe Checkout)                             │
│         ▼                                               │
│  [Netlify Serverless Function: arcade-session.js]       │
│         │                                               │
│         ▼ (HTTP POST / REST API)                        │
│  [MQTT Broker REST Bridge / AWS IoT Core Publish API]   │
│         │                                               │
│         ▼ (MQTT Publish: subsoccer/venue-01/table-01/cmd)│
│  [Cloud MQTT Broker (TLS 8883)]                         │
└───────────────────────────┬─────────────────────────────┘
                            │ Outbound MQTTS (Port 8883)
┌───────────────────────────▼─────────────────────────────┐
│                      VENUE LAN                          │
│                                                         │
│  [NETIO PowerBOX 3PF]                                   │
│    • Direct connection to Cloud MQTT Broker             │
│    • Outlet 1: Game Pulse                               │
│    • Outlet 2: Info Display                             │
│    • Outlet 3: Attract Lights                           │
└─────────────────────────────────────────────────────────┘
```

### Key Characteristics
- **Transport:** Outbound TLS (MQTTS on TCP 8883) from NETIO to broker.
- **Connection Model:** Persistent TCP socket maintained by the NETIO firmware.
- **Command Topic:** `subsoccer/{venue_id}/{table_id}/cmd` (payload: `{"action": "short_on", "output": 1, "duration_ms": 300000}`)
- **State Topic:** `subsoccer/{venue_id}/{table_id}/state` (retained messages with outlet states, current consumption, and uptime).
- **LWT (Last Will and Testament):** Automatic publication of `{"status": "offline"}` if the device loses power or connectivity.

### Advantages
1. **Zero On-Site Server Hardware:** No Raspberry Pi, Mini PC, or edge gateway hardware required at the venue. Reduces hardware bill of materials (BOM) by 80–120 € per venue.
2. **Built-In NAT/Firewall Traversal:** Because NETIO initiates the outbound connection to port 8883, venue routers require zero port forwarding or firewall pinholes.
3. **Instant Disconnect Detection:** MQTT Last Will and Testament (LWT) notifies the cloud immediately if the power cord is pulled or router drops connection.
4. **Bi-directional Push:** Real-time push updates for status and alarms without polling.

### Disadvantages & Serverless Constraints
1. **Serverless Impedance Mismatch:** Netlify serverless functions (AWS Lambda) have short execution lifetimes (< 10 seconds). Lambda cannot keep persistent MQTT subscriptions open. Handling commands requires an HTTP-to-MQTT bridge (e.g. AWS IoT Core HTTP API or EMQX Webhook/HTTP Publish endpoint).
2. **NETIO Firmware Configuration Complexity:** NETIO's `MQTT-flex` implementation requires configuring specific JSON templates and topic structures per outlet in the device web UI or via XML provisioning scripts.
3. **Broker Operational Cost:** Requires managing or paying for a cloud MQTT broker (AWS IoT Core, HiveMQ, or self-hosted EMQX cluster).

---

## Architecture 2: Local Venue Gateway with Cloudflare Tunnel

### Topology Overview
In this model, a small local gateway (e.g., Raspberry Pi 4/5, Intel NUC, or existing venue POS/kiosk terminal) runs on the venue LAN alongside the NETIO device. The gateway runs the `cloudflared` daemon, establishing an outbound encrypted tunnel to Cloudflare Edge. Central Netlify functions execute standard HTTP JSON commands (`/netio.json`) against the secure vanity endpoint.

```
┌─────────────────────────────────────────────────────────┐
│                     CLOUD LAYER                         │
│                                                         │
│  [Customer Phone]                                       │
│         │ (Stripe Checkout)                             │
│         ▼                                               │
│  [Netlify Serverless Function: arcade-session.js]       │
│         │                                               │
│         ▼ (HTTPS POST with Bearer / Service Token)      │
│  [Cloudflare Edge: https://pulse-relay.subsoccer.pro]    │
└───────────────────────────┬─────────────────────────────┘
                            │ Encrypted Outbound Cloudflare Tunnel
┌───────────────────────────▼─────────────────────────────┐
│                      VENUE LAN                          │
│                                                         │
│  [Local Gateway (Raspberry Pi 4 / Venue POS)]           │
│    • Daemon: cloudflared                                │
│    • Reverse proxy to 192.168.1.150:80                  │
│    • Also runs display.html Kiosk Browser on TV         │
│         │ (Local HTTP JSON: /netio.json)                │
│         ▼                                               │
│  [NETIO PowerBOX 3PF]                                   │
│    • Outlet 1: Game Pulse                               │
│    • Outlet 2: Info Display                             │
│    • Outlet 3: Attract Lights                           │
└─────────────────────────────────────────────────────────┘
```

### Key Characteristics
- **Transport:** Outbound Cloudflare Tunnel (QUIC/HTTP2) from gateway to Cloudflare Edge; local HTTP JSON on venue LAN.
- **Connection Model:** Request-response HTTP REST API (`netio-adapter.js`).
- **Security:** Protected by Cloudflare Access Service Token or custom authentication header (`X-Pulse-Gateway-Key`) and HTTP Basic Auth.

### Advantages
1. **100% Serverless Compatibility:** Netlify functions execute standard `fetch()` calls with sub-second request/response latency. No intermediate bridges needed.
2. **Existing Code Reuse:** Uses the existing, battle-tested `NetioAdapter` (`/netio.json`) with zero protocol changes or custom templates.
3. **Dual-Purpose Local Device:** The local Raspberry Pi / Mini PC can also act as the kiosk player driving the TV display (`display.html` on Outlet 2) via HDMI, eliminating a separate TV streaming stick.
4. **Local Resilience & Edge Intelligence:** Can queue commands, buffer telemetry, and provide local failover if the WAN drops momentarily.

### Disadvantages & Venue Constraints
1. **Hardware Maintenance:** Adding a Raspberry Pi introduces an extra operating system to patch, secure, and monitor.
2. **Hardware Cost:** Adds ~70–100 € one-time cost per venue.
3. **Single Point of Local Failure:** If the gateway crashes or its power supply fails, the NETIO device becomes unreachable even if the NETIO itself and venue internet are operational.

---

## Detailed Comparison Matrix

| Evaluation Criteria | Option 1: Direct NETIO MQTT | Option 2: Local Gateway (Cloudflare Tunnel) |
| :--- | :--- | :--- |
| **Hardware Footprint** | **None** (only NETIO PowerBOX) | Dedicated Raspberry Pi / Mini PC required |
| **Serverless Integration** | Requires HTTP-to-MQTT Bridge or IoT Core | **Native** (standard HTTP fetch in Netlify) |
| **Outbound NAT Traversal** | Yes (MQTTS Port 8883) | Yes (Cloudflare Tunnel QUIC/HTTP2) |
| **Disconnect / Offline Detection** | **Instant** via MQTT LWT | Heartbeat polling (30s window) |
| **Firmware Setup Effort** | Higher (MQTT-flex custom JSON templates) | **Minimal** (standard NETIO JSON API enabled) |
| **Display Kiosk Integration** | Requires separate Smart TV / Chromecast | **Built-in** (Pi drives TV via HDMI directly) |
| **Fleet Scale (100+ Venues)** | Excellent (standard IoT broker management) | Moderate (requires edge device management tool) |
| **BOM Cost per Venue** | **0 € additional** | ~80 € (Raspberry Pi + power supply + case) |
| **Latency for Activation** | ~150–300 ms | ~200–400 ms |

---

## Strategic Recommendation & Roadmap

### Phase 1 & 2 Pilot (Current State: 1–5 Pilot Venues)
**Winner: Local Gateway with Cloudflare Tunnel (or direct local subnet testing).**
- **Rationale:** Minimizes software complexity during rapid pilot iterations. The existing `NetioAdapter` JSON implementation is already completed, tested with 162 passing tests, and physically verified. If the venue has an HDMI TV, a single Raspberry Pi drives both `display.html` (Outlet 2) and runs `cloudflared`.

### Phase 3 Scaled Commercial Fleet (20+ Venues)
**Winner: Direct NETIO MQTT via Managed Broker (AWS IoT Core / EMQX Cloud).**
- **Rationale:** At scale, eliminating the physical edge gateway hardware per venue dramatically cuts deployment friction, installation time, and on-site maintenance visits.
- **Migration Path:**
  1. Set up an AWS IoT Core endpoint or EMQX serverless MQTT broker.
  2. Implement an HTTP-to-MQTT dispatcher in Netlify functions (`aws-iot-data.publish` or EMQX REST API).
  3. Pre-configure NETIO PowerBOX units with fleet MQTT templates before shipping to venues.
  4. Plug NETIO into venue Ethernet: zero on-site configuration required.
