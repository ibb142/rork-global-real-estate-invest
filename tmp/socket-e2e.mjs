import { io } from 'socket.io-client';

const socket = io('http://localhost:3123', {
  path: '/socket.io',
  transports: ['websocket', 'polling'],
  timeout: 8000,
});

const results = { welcome: false, joined: false, userBroadcast: false, assistantBroadcast: false, roomState: false };
const timer = setTimeout(() => finish('TIMEOUT after 30s'), 30000);

function finish(note) {
  clearTimeout(timer);
  console.log(JSON.stringify({ results, note }, null, 1));
  socket.disconnect();
  process.exit(0);
}

socket.on('chat:welcome', (p) => {
  results.welcome = true;
  console.log('welcome:', JSON.stringify(p));
  socket.emit('room:join', { roomId: 'audit-realtime-room', username: 'AuditBot' });
});

socket.on('room:joined', (p) => {
  results.joined = true;
  console.log('joined:', JSON.stringify(p));
  socket.emit('chat:send', { roomId: 'audit-realtime-room', username: 'AuditBot', text: 'Realtime audit message OMEGA-42' }, (ack) => {
    console.log('ack:', JSON.stringify(ack));
  });
});

socket.on('room:state', (p) => {
  results.roomState = true;
  console.log('room:state:', JSON.stringify(p));
});

socket.on('chat:message', (m) => {
  console.log('chat:message:', m.source, '|', m.id, '|', String(m.text).slice(0, 60));
  if (m.source === 'user') results.userBroadcast = true;
  if (m.source === 'assistant') {
    results.assistantBroadcast = true;
    finish('COMPLETE — full realtime round trip');
  }
});

socket.on('chat:error', (e) => console.log('chat:error:', JSON.stringify(e)));
socket.on('connect_error', (e) => console.log('connect_error:', e.message));
