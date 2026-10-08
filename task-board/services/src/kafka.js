import { Kafka, logLevel, Partitioners } from 'kafkajs';
import { config } from './config.js';

export function kafka(clientId) {
	return new Kafka({ clientId, brokers: config.kafkaBrokers, logLevel: logLevel.WARN });
}

/** Partitions by message key (the task id), so one task's events stay in order. */
export const partitioner = Partitioners.DefaultPartitioner;

/** Stops cleanly on Ctrl+C or `docker stop`. */
export function onShutdown(fn) {
	let stopping = false;
	for (const sig of ['SIGINT', 'SIGTERM']) {
		process.on(sig, async () => {
			if (stopping) return;
			stopping = true;
			try {
				await fn();
			} finally {
				process.exit(0);
			}
		});
	}
}
