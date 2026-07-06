// Just enough of RFC 6455 to push JSON frames to browser clients over the
// upgrade handshake. Sub0 gives you /ws for free in production - this exists
// only so `npm start` needs nothing installed.
import crypto from "node:crypto";

const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

function accept(key) {
  return crypto.createHash("sha1").update(key + GUID).digest("base64");
}

// server->client text frame, never masked
function encode(text) {
  const payload = Buffer.from(text);
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.from([0x81, len]);
  } else if (len < 65536) {
    header = Buffer.from([0x81, 126, (len >> 8) & 0xff, len & 0xff]);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, payload]);
}

export function createWsHub(server, { path = "/ws" } = {}) {
  const clients = new Set();

  server.on("upgrade", (req, socket) => {
    const { pathname, searchParams } = new URL(req.url, "http://x");
    if (pathname !== path) return socket.destroy();

    const key = req.headers["sec-websocket-key"];
    socket.write(
      "HTTP/1.1 101 Switching Protocols\r\n" +
        "Upgrade: websocket\r\n" +
        "Connection: Upgrade\r\n" +
        `Sec-WebSocket-Accept: ${accept(key)}\r\n\r\n`
    );

    socket.uid = searchParams.get("uid") || null;
    clients.add(socket);

    // We only push to clients, but we still need to drain and honour close
    // frames (opcode 0x8) so sockets don't leak.
    socket.on("data", (buf) => {
      if (buf.length && (buf[0] & 0x0f) === 0x8) {
        clients.delete(socket);
        socket.end();
      }
    });
    socket.on("close", () => clients.delete(socket));
    socket.on("error", () => clients.delete(socket));
  });

  return {
    broadcast(action, data) {
      const frame = encode(JSON.stringify({ action, data }));
      for (const socket of clients) {
        if (socket.writable) socket.write(frame);
      }
    },
    get size() {
      return clients.size;
    },
  };
}
