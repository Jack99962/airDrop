import assert from 'node:assert/strict';
import WebSocket from 'ws';

const base = process.env.TEST_URL || 'http://localhost:3000';
const clients = [];
async function connect() {
    const socket = new WebSocket(base.replace(/^http/, 'ws') + '/server?webrtc_supported=true');
    clients.push(socket);
    const messages = [];
    socket.on('message', data => {
        const message = JSON.parse(data);
        if (message.type === 'ping') socket.send(JSON.stringify({type: 'pong'}));
        else messages.push(message);
    });
    const wait = async type => {
        const deadline = Date.now() + 5000;
        while (Date.now() < deadline) {
            const index = messages.findIndex(m => m.type === type);
            if (index !== -1) return messages.splice(index, 1)[0];
            await new Promise(resolve => setTimeout(resolve, 20));
        }
        throw new Error(`Timeout waiting for ${type}`);
    };
    const config = await wait('ws-config');
    assert.equal(config.wsConfig.forceWs, true);
    const identity = await wait('display-name');
    return {send: message => socket.send(JSON.stringify(message)), wait, id: identity.peerId};
}
try {
    assert.equal((await fetch(base)).status, 200);
    assert.equal((await fetch(base + '/config')).status, 200);
    const a = await connect(), b = await connect();
    a.send({type: 'join-ip-room'});
    await a.wait('peers');
    b.send({type: 'join-ip-room'});
    assert.ok((await b.wait('peers')).peers.some(peer => peer.id === a.id));
    a.send({type: 'text', to: b.id, roomType: 'ip', text: 'LAN relay test'});
    const text = await b.wait('text');
    assert.equal(text.text, 'LAN relay test');
    assert.equal(text.sender.id, a.id);
    a.send({type: 'pair-device-initiate'});
    const pairing = await a.wait('pair-device-initiated');
    b.send({type: 'pair-device-join', pairKey: pairing.pairKey});
    assert.equal((await b.wait('pair-device-joined')).roomSecret, pairing.roomSecret);
    a.send({type: 'create-public-room'});
    const room = await a.wait('public-room-created');
    b.send({type: 'join-public-room', publicRoomId: room.roomId});
    a.send({type: 'ws-chunk', to: b.id, roomType: 'public-id', roomId: room.roomId, chunk: 'aGVsbG8='});
    assert.equal((await b.wait('ws-chunk')).chunk, 'aGVsbG8=');
    b.send({type: 'leave-public-room'});
    await b.wait('public-room-left');
    console.log('PASS: HTTP, LAN discovery, text relay, device pairing, public rooms, file chunk relay');
} finally {
    for (const client of clients) client.close();
}
