/**
 * The rule engine. A rule reads like a sentence:
 *   when <event> and <field> becomes <one of values>, then <action> to <recipients>.
 * Kept free of Kafka, email and databases so it can be tested on its own.
 */

/** Checks a rules file and returns it, or throws with a plain message saying what is wrong. */
export function validateRules(rules) {
	if (!Array.isArray(rules)) throw new Error('rules file must be a list');
	for (const r of rules) {
		const where = `rule "${r?.name ?? '?'}"`;
		if (!r?.name) throw new Error('every rule needs a name');
		if (!r.when?.event) throw new Error(`${where}: when.event is required`);
		if (r.when.field && !Array.isArray(r.when.becomes)) throw new Error(`${where}: when.becomes must be a list`);
		if (r.then?.action !== 'email') throw new Error(`${where}: the only action so far is "email"`);
		if (!['task.owner', 'project.managers'].includes(r.then.to)) {
			throw new Error(`${where}: then.to must be "task.owner" or "project.managers"`);
		}
	}
	return rules;
}

/** Returns the rules this event triggers. */
export function matchRules(rules, event) {
	return rules.filter((rule) => {
		const { when } = rule;
		if (when.event !== event.type) return false;
		if (!when.field) return true;
		// Only a real change counts: re-saving a task that is already Done does not fire again.
		const change = event.changes?.[when.field];
		return Boolean(change) && when.becomes.map(lower).includes(lower(change.to));
	});
}

/** Fills {{task.title}}-style placeholders. Unknown placeholders become empty text. */
export function render(template, data) {
	return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, path) => {
		const value = path.split('.').reduce((obj, key) => (obj == null ? undefined : obj[key]), data);
		return value == null ? '' : String(value);
	});
}

const lower = (v) => String(v ?? '').toLowerCase();
