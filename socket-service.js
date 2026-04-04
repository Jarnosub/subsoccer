import { _supabase } from './config.js';

export class SocketService {
    constructor(tableId) {
        this.tableId = tableId;
        this.channelId = `lounge_${tableId}`;
        this.channel = null;
        this.listeners = new Map();
        this.isConnected = false;
    }

    connect() {
        if (this.channel) return;
        
        console.log(`[SocketService] Initializing connection to ${this.channelId}...`);
        this.channel = _supabase.channel(this.channelId);

        // Listen to all broadcast events for this channel
        this.channel.on('broadcast', { event: '*' }, (response) => {
            const eventName = response.event;
            if (this.listeners.has(eventName)) {
                this.listeners.get(eventName)(response.payload);
            }
        });

        this.channel.subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                this.isConnected = true;
                console.log(`[SocketService] Successfully connected to ${this.channelId}`);
            }
        });
    }

    on(eventName, callback) {
        this.listeners.set(eventName, callback);
    }

    send(eventName, payload = {}) {
        if (!this.channel) {
            console.warn(`[SocketService] Cannot send event ${eventName}. Channel not connected.`);
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
