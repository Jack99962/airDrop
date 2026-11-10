import {WebSocketServer} from "ws";
import Peer from "./peer.js";
import Signaling from "./signaling.js";

export default class PairDropWsServer extends Signaling {
    constructor(server, conf) {
        super(conf);
        this._wss = new WebSocketServer({server});
        this._wss.on('connection', (socket, request) => {
            const peer = new Peer(socket, request, conf);
            socket.on('close', () => this._disconnect(peer));
            this._onConnection(peer);
        });
    }
}
