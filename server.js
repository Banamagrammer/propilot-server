import { randomUUID } from 'crypto';
import express from 'express';
import ws from 'ws';

const port = 8080;
const app = express();

let helpless = [];

const createPlea = (plea) => ({
	...plea,
	id: randomUUID(),
	createdAt: new Date(),
	isActive: true,
});

const sanitizePlea = (entry) => {
	const { sessionId, url, isActive, ...sanitizedEntry } = entry;
	return sanitizedEntry;
};

const getActivePleas = () => helpless.filter((plea) => plea.isActive);

const getIndexOfSession = (sessionId) => helpless.findIndex((noob) => noob.sessionId === sessionId);

app.use(express.json());

const wsServer = new ws.Server({ noServer: true });

const getActiveClients = () =>
	Array.from(wsServer.clients).filter((client) => client.readyState === ws.OPEN);

const sendMsg = (socket, topic, data) => {
	const msg = JSON.stringify({
		topic,
		...data,
	});

	socket.send(msg);
};

const broadcastMsg = (topic, data) => {
	for (const client of getActiveClients()) {
		sendMsg(client, topic, data);
	}
};

const sendInitialMsg = (socket) => {
	// TODO: Remove get route handler from server
	// TODO: Replace client get request with websocket handler
	sendMsg(socket, 'list', { pleas: getActivePleas().map(sanitizePlea) });
};

const handleSessionMsg = (socket, { id }) => {
	const plea = helpless.find((noob) => noob.id === id && noob.isActive);
	if (plea === undefined) {
		sendMsg(socket, 'sessionNotFound', { id });
	} else {
		sendMsg(socket, 'sessionInfo', plea);
	}
};

const handlers = {
	sessionRequested: handleSessionMsg,
};

const receiveMsg = (socket) => (msg) => {
	console.log(`Received: ${msg}`);

	const { topic, data } = JSON.parse(msg);
	handlers[topic](socket, data);
};

wsServer.on('connection', (socket) => {
	socket.on('message', receiveMsg(socket));

	sendInitialMsg(socket);
});

const server = app.listen(port);
server.on('upgrade', (request, socket, head) => {
	wsServer.handleUpgrade(request, socket, head, (socket) => {
		wsServer.emit('connection', socket, request);
	});
});

// TODO: Remove me
app.get('/halllp', (_, res) => {
	res.json(helpless).status(200).end();
});

app.put('/halllp', (req, res) => {
	const index = getIndexOfSession(req.body.sessionId);
	if (index === -1) {
		const entry = createPlea(req.body);
		helpless.push(entry);
		broadcastMsg('added', sanitizePlea(entry));
		res.status(201).end();
	} else {
		helpless[index] === req.body;
		broadcastMsg('updated', req.body);
		res.status(204).end();
	}
});

app.delete('/halllp/:sessionId', (req, res) => {
	const { sessionId } = req.params;
	const index = getIndexOfSession(sessionId);
	if (index === -1) {
		res.status(404).end();
	} else {
		const id = helpless[index].id;
		// const [{ id }] = helpless.splice(index, 1);
		broadcastMsg('removed', { id });
		res.status(204).end();
	}
});

console.log(`Server listening on port ${port}`);
