/**
 * Automations service: reads task events from Kafka and runs the rules in rules.json.
 *
 * Each (event, rule) pair runs at most once: it is recorded in automation_runs before the email
 * goes out, so a repeated Kafka delivery is skipped. If sending fails the record is removed and
 * Kafka redelivers the event. automation_runs doubles as the history of what fired and why.
 */
import { readFileSync } from 'node:fs';
import nodemailer from 'nodemailer';
import pg from 'pg';
import { config } from '../config.js';
import { kafka, onShutdown } from '../kafka.js';
import { findRecipients } from './recipients.js';
import { matchRules, render, validateRules } from './rules.js';

const CREATE_RUNS_SQL = `
CREATE TABLE IF NOT EXISTS automation_runs (
	event_id    UUID        NOT NULL,
	rule_name   TEXT        NOT NULL,
	task_id     UUID        NOT NULL,
	recipients  TEXT[]      NOT NULL DEFAULT '{}',
	ran_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
	PRIMARY KEY (event_id, rule_name)
)`;

export async function handleEvent(event, { rules, db, send }) {
	for (const rule of matchRules(rules, event)) {
		const claimed = await db.query(
			`INSERT INTO automation_runs (event_id, rule_name, task_id) VALUES ($1, $2, $3)
			 ON CONFLICT DO NOTHING RETURNING event_id`,
			[event.event_id, rule.name, event.task.id]
		);
		if (!claimed.rowCount) continue; // already handled on an earlier delivery

		try {
			const recipients = await findRecipients(db, rule.then.to, event);
			const change = event.changes?.[rule.when.field] ?? {};
			for (const recipient of recipients) {
				const data = { task: event.task, change, recipient };
				await send({
					to: recipient.email,
					subject: render(rule.then.subject ?? rule.name, data),
					text: render(rule.then.body ?? '', data)
				});
			}
			await db.query('UPDATE automation_runs SET recipients = $3 WHERE event_id = $1 AND rule_name = $2', [
				event.event_id,
				rule.name,
				recipients.map((r) => r.email)
			]);
			console.log(`automations: "${rule.name}" on task ${event.task.id} -> ${recipients.length} recipient(s)`);
		} catch (err) {
			await db.query('DELETE FROM automation_runs WHERE event_id = $1 AND rule_name = $2', [event.event_id, rule.name]);
			throw err;
		}
	}
}

async function main() {
	const rules = validateRules(JSON.parse(readFileSync(config.rulesFile, 'utf8')));
	const db = new pg.Pool({ connectionString: config.databaseUrl, max: 4 });
	await db.query(CREATE_RUNS_SQL);

	const mailer = nodemailer.createTransport(config.smtpUrl);
	const send = (mail) => mailer.sendMail({ from: config.mailFrom, ...mail });

	const consumer = kafka('automations').consumer({ groupId: 'automations' });
	await consumer.connect();
	await consumer.subscribe({ topic: config.topic, fromBeginning: false });
	onShutdown(async () => {
		await consumer.disconnect();
		await db.end();
	});
	console.log(`automations: ${rules.length} rule(s) loaded, listening on ${config.topic}`);

	await consumer.run({
		eachMessage: async ({ message }) => {
			let event;
			try {
				event = JSON.parse(message.value.toString());
			} catch {
				console.warn('automations: skipping a message that is not JSON');
				return;
			}
			await handleEvent(event, { rules, db, send });
		}
	});
}

if (import.meta.url === `file://${process.argv[1]}`) main();
