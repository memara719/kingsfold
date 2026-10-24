// A stand-in for claude.ai's shared room, for tests. Tabs in one browser talk over a BroadcastChannel.
// It keeps the parts Kingsfold relies on: peers come and go, presence, named rooms, and the 4 KiB message limit.
(() => {
  const me = Math.random().toString(36).slice(2, 10);
  let uid = sessionStorage.getItem('mock-uid');
  if (!uid) { uid = 'u-' + Math.random().toString(36).slice(2, 8); sessionStorage.setItem('mock-uid', uid); }
  const bc = new BroadcastChannel('kf-mock-room');
  const sender = peer => ({ peer, by: peer === me ? uid : null, isMe: peer === me, sameTab: peer === me, kind: 'viewer', guest: false });

  function makeRoom(name) {
    const peers = new Map([[me, { presence: {}, by: uid, updatedAt: Date.now() }]]);
    const topics = {}, watchers = new Set();
    let open = true;
    const list = () => [...peers.entries()].map(([peer, v]) => ({ ...sender(peer), by: v.by, presence: v.presence, updatedAt: v.updatedAt }));
    const notify = (joined = [], left = []) => { const ps = list(); watchers.forEach(fn => fn({ peers: ps, joined, left, updated: [] })); };
    bc.addEventListener('message', ev => {
      const d = ev.data;
      if (!open || d.room !== name) return;
      if (d.type === 'hello' || d.type === 'presence') {
        const fresh = !peers.has(d.peer);
        peers.set(d.peer, { presence: d.presence || {}, by: d.by, updatedAt: Date.now() });
        if (d.type === 'hello') bc.postMessage({ room: name, type: 'presence', peer: me, by: uid, presence: peers.get(me).presence });
        notify(fresh ? list().filter(p => p.peer === d.peer) : []);
      }
      if (d.type === 'bye' && peers.has(d.peer)) { const p = list().find(x => x.peer === d.peer); peers.delete(d.peer); notify([], [p]); }
      if (d.type === 'emit') (topics[d.topic] || []).forEach(fn => fn({ ...sender(d.peer), by: d.by, topic: d.topic, data: JSON.parse(d.json) }));
    });
    bc.postMessage({ room: name, type: 'hello', peer: me, by: uid, presence: {} });
    window.addEventListener('pagehide', () => bc.postMessage({ room: name, type: 'bye', peer: me }));
    return {
      name,
      emit(topic, data) {
        const json = JSON.stringify(data);
        if (new TextEncoder().encode(json).length > 4096) return Promise.reject({ code: 'invalid_argument', message: 'message over 4 KiB: ' + json.length });
        bc.postMessage({ room: name, type: 'emit', topic, json, peer: me, by: uid });
        setTimeout(() => (topics[topic] || []).forEach(fn => fn({ ...sender(me), topic, data: JSON.parse(json) })), 0);
        return Promise.resolve();
      },
      on(topic, fn) { (topics[topic] = topics[topic] || []).push(fn); return () => { topics[topic] = topics[topic].filter(f => f !== fn); }; },
      presence(patch) {
        const cur = { ...peers.get(me).presence };
        for (const k in patch) { if (patch[k] === null) delete cur[k]; else cur[k] = patch[k]; }
        peers.set(me, { presence: cur, by: uid, updatedAt: Date.now() });
        bc.postMessage({ room: name, type: 'presence', peer: me, by: uid, presence: cur });
        notify();
        return Promise.resolve();
      },
      peers: list,
      onPeers(fn) { watchers.add(fn); setTimeout(() => fn({ peers: list(), joined: list(), left: [], updated: [] }), 0); return () => watchers.delete(fn); },
      connected: () => true,
      onConnection(fn) { setTimeout(() => fn(true), 0); return () => {}; },
      leave() { open = false; bc.postMessage({ room: name, type: 'bye', peer: me }); return Promise.resolve(); },
    };
  }
  const lobby = makeRoom('lobby');
  lobby.join = async n => makeRoom(n);
  window.claude = { use: async n => (n === 'room' ? lobby : n === 'user' ? { id: async () => uid } : null) };
})();
