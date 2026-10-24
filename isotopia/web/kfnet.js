// Isotopia's online link, used from Python in the browser (pygbag).
// Python calls these functions with plain text and polls for what happened; PeerJS does the connecting.
(function () {
  const PREFIX = 'isotopia-table-';
  const queue = [];
  const push = e => queue.push(e);
  const opts = () => Object.assign({ debug: 0 }, window.KF_PEER || {});
  let peer = null, conns = {}, next = 1, toHost = null;

  window.kfnet = {
    poll() { const out = JSON.stringify(queue); queue.length = 0; return out; },

    // become the table: friends connect to "isotopia-table-<code>"
    host(code) {
      peer = new window.Peer(PREFIX + code.toLowerCase(), opts());
      peer.on('open', () => push({ e: 'ready' }));
      peer.on('error', err => push({ e: 'error', kind: String((err && err.type) || ''), msg: String((err && err.message) || err) }));
      peer.on('disconnected', () => { try { peer.reconnect(); } catch (x) { /* gone for good */ } });
      peer.on('connection', conn => {
        const cid = 'c' + next++;
        conns[cid] = conn;
        conn.on('open', () => push({ e: 'join', cid }));
        conn.on('data', d => push({ e: 'msg', cid, data: String(d) }));
        const gone = () => { if (conns[cid]) { delete conns[cid]; push({ e: 'leave', cid }); } };
        conn.on('close', gone);
        conn.on('error', gone);
      });
      return 1;
    },

    // sit at a friend's table
    join(code) {
      peer = new window.Peer(opts());
      peer.on('open', () => {
        toHost = peer.connect(PREFIX + code.toLowerCase(), { reliable: true, serialization: 'raw' });
        toHost.on('open', () => push({ e: 'open' }));
        toHost.on('data', d => push({ e: 'msg', data: String(d) }));
        toHost.on('close', () => push({ e: 'close' }));
        toHost.on('error', () => push({ e: 'close' }));
      });
      peer.on('error', err => push({ e: 'error', kind: String((err && err.type) || ''), msg: String((err && err.message) || err) }));
      return 1;
    },

    // cid '' means "to the host"
    send(cid, text) {
      const c = cid ? conns[cid] : toHost;
      if (c && c.open) { c.send(text); return 1; }
      return 0;
    },
    drop(cid) { const c = conns[cid]; if (c) c.close(); return 1; },
    close() { if (peer) peer.destroy(); peer = null; conns = {}; toHost = null; queue.length = 0; return 1; },

    link(code) { return location.origin + location.pathname + '#' + code; },
    hash() { return location.hash || ''; },
    setHash(code) { history.replaceState(null, '', location.pathname + (code ? '#' + code : '')); return 1; },
    copy(text) { try { navigator.clipboard.writeText(text).catch(() => {}); return 1; } catch (e) { return 0; } },
    share(text) { try { if (navigator.share) { navigator.share({ title: 'Isotopia', text: 'Join my Isotopia table!', url: text }).catch(() => {}); return 1; } } catch (e) { /* not supported */ } return 0; },
    canShare() { return navigator.share ? 1 : 0; },
    // per-tab memory (survives a reload) and long-term memory (survives closing the browser)
    save(key, value, lasting) { try { const s = lasting ? localStorage : sessionStorage; if (value === '') s.removeItem(key); else s.setItem(key, value); } catch (e) { /* private mode */ } return 1; },
    // Python in the browser starts its random numbers the same way every time; this gives it a real seed
    seed() { const a = new Uint32Array(2); crypto.getRandomValues(a); return String(a[0] * 4294967296 + a[1]); },
    // for automated tests only: the game tells the page where its buttons are
    testing() { return window.KF_TEST ? 1 : 0; },
    publish(state) { window.kf_state = state; return 1; },
    load(key, lasting) { try { return (lasting ? localStorage : sessionStorage).getItem(key) || ''; } catch (e) { return ''; } },
  };
})();
