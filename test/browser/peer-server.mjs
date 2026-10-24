// A local PeerJS matchmaking server for tests, in place of the free public one the website uses.
import { createRequire } from 'node:module';
import http from 'node:http';
const { ExpressPeerServer } = createRequire(import.meta.url)('peer');
const express = createRequire(createRequire(import.meta.url).resolve('peer'))('express');
const app = express();
const server = http.createServer(app);
app.use('/', ExpressPeerServer(server, { path: '/', allow_discovery: false }));
server.listen(Number(process.env.PORT || 9000), '127.0.0.1', () => console.log('peer server on', server.address().port));
