import { buildTaskEvent, toPlainText } from './task-event';

const base = {
	id: 't1',
	tenantId: 'ten',
	organizationId: 'org',
	projectId: 'p1',
	title: 'Payments migration',
	description: '<p>Move to <b>new</b> provider</p>',
	status: 'in-progress',
	createdByUserId: 'u1'
};

describe('buildTaskEvent', () => {
	it('reports the status change on update', () => {
		const evt = buildTaskEvent('task.updated', { ...base, status: 'done' }, 'u2', base);
		expect(evt.changes).toEqual({ status: { from: 'in-progress', to: 'done' } });
		expect(evt.task.description).toBe('Move to new provider');
	});

	it('reports no changes when the previous row is unknown', () => {
		expect(buildTaskEvent('task.updated', base, null).changes).toEqual({});
	});

	it('reports a move to another project', () => {
		const evt = buildTaskEvent('task.updated', { ...base, projectId: 'p2' }, 'u2', base);
		expect(evt.changes['project_id']).toEqual({ from: 'p1', to: 'p2' });
		expect(evt.project_id).toBe('p2');
	});
});

describe('toPlainText', () => {
	it('strips tags and decodes entities', () => {
		expect(toPlainText('<p>A &amp; B</p><p>C</p>')).toBe('A & B\nC');
	});
});
