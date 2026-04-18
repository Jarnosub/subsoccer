import { _supabase } from './config.js';

export class SocketService {
    constructor(tableId) {
        this.tableId = tableId;
        this.channelId = `lounge_${tableId}`;
        this.channel = null;
        this.listeners = new Map();
        this.isConnected = false;
        this.sendQueue = [];
    }

    connect() {
        if (this.channel) return;
        
        console.log(`[SocketService] Initializing connection to ${this.channelId}...`);
        this.channel = _supabase.channel(this.channelId, { config: { broadcast: { self: true, ack: true } } });

        // Listen to all broadcast events for this channel
        this.channel.on('broadcast', { event: '*' }, (response) => {
            const eventName = response.event;
            
            // Dispatch a global event so the TV can reset its inactivity timers
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new Event('arcade_activity'));
            }
            
            if (this.listeners.has(eventName)) {
                this.listeners.get(eventName)(response.payload);
            }
        });

        this.channel.subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                this.isConnected = true;
                console.log(`[SocketService] Successfully connected to ${this.channelId}`);
                while (this.sendQueue.length > 0) {
                    const msg = this.sendQueue.shift();
                    this.send(msg.eventName, msg.payload);
                }
            }
        });
    }

    on(eventName, callback) {
        this.listeners.set(eventName, callback);
    }

    send(eventName, payload = {}) {
        if (!this.isConnected || !this.channel) {
            console.warn(`[SocketService] Queuing event ${eventName}. Channel not connected.`);
            this.sendQueue.push({ eventName, payload });
            return;
        }
        this.channel.send({
            type: 'broadcast',
            event: eventName,
            payload: payload
        });
    }
}

// Export a singleton instance for Table 04
export const arcadeSocket = new SocketService('table-04');
