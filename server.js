const crypto = require('crypto');
const express = require('express');
const ws = require('ws');

const port = 44300;
const app = express();

let helpless = [];

const userIds = {};

const createPlea = (plea) => ({
	...plea,
	id: crypto.randomUUID(),
	userId: crypto.randomUUID(),
	createdAt: new Date(),
	isActive: true,
});

const sanitizePlea = (entry) => {
	const { userId, sessionId, url, isActive, ...sanitizedEntry } = entry;
	return sanitizedEntry;
};

const sanitizeUserFromPlea = (entry) => {
	const { userId, ...sanitizedEntry } = entry;
	return sanitizedEntry;
};

const getActivePleas = () => helpless.filter((plea) => plea.isActive);

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
	sendMsg(socket, 'list', { pleas: getActivePleas().map(sanitizePlea) });
};

const handlePlea = (socket, data) => {
	const entry = createPlea(data);
	helpless.push(entry);

	userIds[socket] = entry.userId;

	sendMsg(socket, 'pleaAccepted', entry);
	broadcastMsg('added', sanitizePlea(entry));
};

const handleCancelPlea = (socket, { id, userId }) => {
	const index = helpless.findIndex((noob) => noob.id === id);

	if (index === -1) {
		sendMsg(socket, 'pleaNotFound', { id });
		return;
	}

	const plea = helpless[index];
	if (plea.userId !== userId) {
		sendMsg(socket, 'unauthorized', { id, userId });
	} else {
		helpless.splice(index, 1);
		delete userIds[socket];
		sendMsg(socket, 'pleaCanceled', { id });
		broadcastMsg('removed', { id });
	}
};

const handleSessionMsg = (socket, { id }) => {
	const plea = helpless.find((noob) => noob.id === id && noob.isActive);
	if (plea === undefined) {
		sendMsg(socket, 'pleaNotFound', { id });
	} else {
		sendMsg(socket, 'sessionInfo', sanitizeUserFromPlea(plea));
	}
};

const handleDisconnect = (socket) => () => {
	const userId = userIds[socket];
	if (userId === undefined) {
		return;
	}

	const index = helpless.findIndex((noob) => noob.userId === userId);
	const id = helpless[index].id;

	helpless.splice(index, 1);
	delete userIds[socket];

	broadcastMsg('removed', { id });
};

const handlers = {
	halllpPlease: handlePlea,
	neverMind: handleCancelPlea,
	sessionRequested: handleSessionMsg,
};

const receiveMsg = (socket) => (msg) => {
	console.log(`Received: ${msg}`);

	const { topic, data } = JSON.parse(msg);
	handlers[topic](socket, data);
};

wsServer.on('connection', (socket) => {
	socket.on('message', receiveMsg(socket));

	socket.on('close', handleDisconnect(socket));

	sendInitialMsg(socket);
});

const server = app.listen(port);
server.on('upgrade', (request, socket, head) => {
	wsServer.handleUpgrade(request, socket, head, (socket) => {
		wsServer.emit('connection', socket, request);
	});
});

app.get('/', (_, res) => {
	res.send('Ok');
});

console.log(`Server listening on port ${port}`);
