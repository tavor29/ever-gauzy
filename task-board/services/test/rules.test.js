import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { matchRules, render, validateRules } from '../src/automations/rules.js';
import { taskEvent } from './fixtures.js';

const rules = validateRules(JSON.parse(readFileSync(new URL('../rules.json', import.meta.url))));

test('status becoming Done fires the owner rule only', () => {
	assert.deepEqual(matchRules(rules, taskEvent()).map((r) => r.name), ['Tell the owner when a task is done']);
});

test('saving a task that was already Done does not fire', () => {
	assert.equal(matchRules(rules, taskEvent({ changes: { title: { from: 'a', to: 'b' } } })).length, 0);
});

test('values match regardless of case', () => {
	assert.equal(matchRules(rules, taskEvent({ changes: { status: { from: 'open', to: 'BLOCKED' } } })).length, 1);
});

test('created events do not match update rules', () => {
	assert.equal(matchRules(rules, taskEvent({ type: 'task.created' })).length, 0);
});

test('placeholders are filled and unknown ones left empty', () => {
	assert.equal(render('{{task.title}} by {{ recipient.name }}{{nope.x}}', { task: { title: 'A' }, recipient: { name: 'Dana' } }), 'A by Dana');
});

test('a broken rules file says what is wrong', () => {
	assert.throws(() => validateRules([{ name: 'x', when: { event: 'task.updated' }, then: { action: 'sms', to: 'task.owner' } }]), /only action/);
});
