const express = require('express');
const cors = require('cors');
const { Kafka } = require('kafkajs');

const app = express();
app.use(cors());

const kafka = new Kafka({
  clientId: 'sse-hub',
  brokers: ['kafka:29092']
});
const consumer = kafka.consumer({ groupId: 'frontend-sse-group' });

let clients = [];

app.get('/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    clients.push(res);

    req.on('close', () => {
        clients = clients.filter(client => client !== res);
    });
});

const run = async () => {
    // Retry connection loop for when Kafka is still starting up
    while(true) {
        try {
            await consumer.connect();
            console.log("Connected to Kafka!");
            break;
        } catch (error) {
            console.log("Waiting for Kafka to be ready...");
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
    }

    await consumer.subscribe({ topic: 'project-status-events', fromBeginning: false });
    await consumer.run({
        eachMessage: async ({ message }) => {
            const data = message.value.toString();
            clients.forEach(client => client.write(`data: ${data}\n\n`));
        },
    });
};

run().catch(console.error);

app.listen(3001, () => console.log('SSE Hub running on port 3001'));
// sse-hub/server.js
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});