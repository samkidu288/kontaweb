import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  
  const io = new SocketIOServer(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    },
    transports: ['websocket', 'polling']
  });

  const PORT = 3000;
  const CALL_ROOM = 'two-person-direct-call';

  // Menyimpan socket ID untuk kedua sisi
  let leftPeerSocketId: string | null = null;
  let rightPeerSocketId: string | null = null;

  const broadcastStatus = () => {
    io.emit('peer-status', {
      leftOnline: !!leftPeerSocketId,
      rightOnline: !!rightPeerSocketId,
      bothOnline: !!(leftPeerSocketId && rightPeerSocketId)
    });
  };

  io.on('connection', (socket) => {
    console.log(`[Socket] User connected: ${socket.id}`);

    // Register sebagai 'left' atau 'right'
    socket.on('register-peer', ({ role }: { role: 'left' | 'right' }) => {
      socket.join(CALL_ROOM);
      (socket as any).peerRole = role;

      if (role === 'left') {
        leftPeerSocketId = socket.id;
        console.log(`[Socket] Left Peer terdaftar: ${socket.id}`);
      } else if (role === 'right') {
        rightPeerSocketId = socket.id;
        console.log(`[Socket] Right Peer terdaftar: ${socket.id}`);
      }

      broadcastStatus();

      // Jika kedua peer sudah ada, instruksikan 'left' untuk membuat offer
      if (leftPeerSocketId && rightPeerSocketId) {
        console.log('[Socket] Kedua peer sudah siap! Memulai handshake WebRTC...');
        io.to(leftPeerSocketId).emit('start-handshake', { role: 'caller' });
      }
    });

    // Relay Offer dari caller ke receiver
    socket.on('offer', (data: { offer: RTCSessionDescriptionInit }) => {
      console.log('[Socket] Meneruskan Offer...');
      socket.to(CALL_ROOM).emit('offer', data);
    });

    // Relay Answer dari receiver ke caller
    socket.on('answer', (data: { answer: RTCSessionDescriptionInit }) => {
      console.log('[Socket] Meneruskan Answer...');
      socket.to(CALL_ROOM).emit('answer', data);
    });

    // Relay ICE Candidate
    socket.on('ice-candidate', (data: { candidate: RTCIceCandidateInit }) => {
      socket.to(CALL_ROOM).emit('ice-candidate', data);
    });

    // Manual leave / end
    socket.on('leave-call', () => {
      if (socket.id === leftPeerSocketId) leftPeerSocketId = null;
      if (socket.id === rightPeerSocketId) rightPeerSocketId = null;
      socket.leave(CALL_ROOM);
      socket.to(CALL_ROOM).emit('peer-disconnected');
      broadcastStatus();
    });

    socket.on('disconnect', () => {
      console.log(`[Socket] Disconnect: ${socket.id}`);
      if (socket.id === leftPeerSocketId) {
        leftPeerSocketId = null;
        console.log('[Socket] Left Peer offline');
      }
      if (socket.id === rightPeerSocketId) {
        rightPeerSocketId = null;
        console.log('[Socket] Right Peer offline');
      }
      socket.to(CALL_ROOM).emit('peer-disconnected');
      broadcastStatus();
    });
  });

  // Health API
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      leftOnline: !!leftPeerSocketId,
      rightOnline: !!rightPeerSocketId,
      time: new Date().toISOString()
    });
  });

  // Vite development middleware or production static
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Web Video Call server berjalan di http://0.0.0.0:${PORT}`);
  });
}

startServer();
