import Signaling from '../server/signaling.js';
import Peer from '../server/peer.js';

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        if (url.pathname === '/config') {
            return Response.json({signalingServer: false, buttons: {}}, {
                headers: {'Cache-Control': 'no-store'}
            });
        }
        if ((url.pathname === '/server' || url.pathname.startsWith('/server/'))) {
            if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
                return new Response('WebSocket upgrade required', {status: 426});
            }
            // A single hub preserves global pairing codes and cross-network rooms.
            return env.SIGNALING.get(env.SIGNALING.idFromName('global-v1')).fetch(request);
        }
        return env.ASSETS.fetch(request);
    }
};

export class SignalingHub {
    constructor(ctx, env) {
        this.conf = {
            wsFallback: env.WS_FALLBACK !== 'false',
            forceWs: env.FORCE_WS !== 'false',
            rtcConfig: env.RTC_CONFIG ? JSON.parse(env.RTC_CONFIG) : {iceServers: []},
            debugMode: false
        };
        this.signaling = new Signaling(this.conf);
    }

    async fetch(request) {
        const [client, server] = Object.values(new WebSocketPair());
        server.accept();
        const socket = {
            get readyState() { return server.readyState; },
            send(data) { server.send(data); },
            terminate() { if (server.readyState === 1) server.close(1000, 'Disconnected'); },
            on(event, listener) {
                if (event === 'message') server.addEventListener('message', e => {
                    if (typeof e.data !== 'string' || e.data.length > 1024 * 1024) {
                        server.close(1009, 'Message too large');
                        return;
                    }
                    try { listener(e.data); }
                    catch { server.close(1008, 'Invalid message'); }
                });
            }
        };
        const headers = Object.fromEntries(request.headers);
        // Production: Cloudflare sets this header. Local clients share a LAN room.
        const address = headers['cf-connecting-ip'] || '127.0.0.1';
        delete headers['x-forwarded-for'];
        headers['cf-connecting-ip'] = address;
        const peer = new Peer(socket, {
            url: request.url, headers,
            socket: {remoteAddress: address}, connection: {remoteAddress: address}
        }, this.conf);
        server.addEventListener('close', () => this.signaling._disconnect(peer));
        server.addEventListener('error', () => this.signaling._disconnect(peer));
        this.signaling._onConnection(peer);
        return new Response(null, {status: 101, webSocket: client});
    }
}
