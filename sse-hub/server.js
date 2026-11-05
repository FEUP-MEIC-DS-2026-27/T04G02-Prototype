const express = require('express');
const cors = require('cors');
const { Kafka } = require('kafkajs');

const PORT = Number(process.env.PORT || 8010);
const KAFKA_BROKERS = (process.env.KAFKA_BROKERS || 'project-status-kafka:29092').split(',');
const CORS_ORIGINS = (process.env.CORS_ORIGINS || 'http://localhost:3000,http://localhost:3003,http://localhost:3005').split(',');

const app = express();
app.use(cors({ origin: CORS_ORIGINS }));

const kafka = new Kafka({
  clientId: 'sse-hub',
  brokers: KAFKA_BROKERS
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

app.listen(PORT, () => console.log(`SSE Hub running on port ${PORT}`));
