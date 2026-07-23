import { describe, it, expect } from 'vitest';
import { validateStateTransition, getNextActions, getApplicationTimeline } from '../src/application-tracker';
import { ApplicationAction } from '../src/types';

describe('application-tracker', () => {
  it('validates state transitions', () => {
    expect(validateStateTransition('DRAFT', 'DOCUMENTS_READY')).toBe(true);
    expect(validateStateTransition('DRAFT', 'SUBMITTED')).toBe(false);
    expect(validateStateTransition('USER_APPROVED', 'SUBMITTED')).toBe(true);
    expect(validateStateTransition('REVIEWED', 'WITHDRAWN')).toBe(true);
  });

  it('gets next actions', () => {
    expect(getNextActions('DRAFT')).toContain('DOCUMENTS_READY');
    expect(getNextActions('SUBMITTED')).toEqual(['WITHDRAWN']);
    expect(getNextActions('WITHDRAWN')).toEqual([]);
  });

  it('formats timeline correctly', () => {
    const actions: ApplicationAction[] = [
      { action: 'CREATE', performed_by: 'SYSTEM', timestamp: '2023-01-01T10:00:00Z', details: 'Created' },
      { action: 'GENERATE_DOCS', performed_by: 'SYSTEM', timestamp: '2023-01-01T10:05:00Z', details: 'Generated docs' }
    ];
    
    const timeline = getApplicationTimeline(actions);
    expect(timeline).toContain('CREATE - Created');
    expect(timeline).toContain('GENERATE_DOCS - Generated docs');
  });
});
