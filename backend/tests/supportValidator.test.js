'use strict';

/**
 * Support ticket request validation.
 */

const v = require('../src/validators/support.validator');

describe('support ticket validator', () => {
  it('accepts a valid ticket', () => {
    const out = v.create.parse({ subject: 'Cannot join a ride', body: 'It keeps failing.' });
    expect(out).toEqual({ subject: 'Cannot join a ride', body: 'It keeps failing.' });
  });

  it('trims subject and body', () => {
    const out = v.create.parse({ subject: '  Over 1999  ', body: '  \n details \n ' });
    expect(out.subject).toBe('Over 1999');
    expect(out.body).toBe('details');
  });

  it('rejects a too-short subject', () => {
    expect(() => v.create.parse({ subject: 'ab', body: 'ok' })).toThrow();
  });

  it('rejects a too-long subject', () => {
    const subject = 'x'.repeat(121);
    expect(() => v.create.parse({ subject, body: 'ok' })).toThrow();
  });

  it('rejects an empty body', () => {
    expect(() => v.create.parse({ subject: 'Fine subject', body: '   ' })).toThrow();
  });

  it('rejects smuggled fields like role', () => {
    expect(() => v.create.parse({ subject: 'Fine', body: 'ok', role: 'admin' })).toThrow();
  });

  it('rejects unknown query filters and bad ticket ids', () => {
    expect(() => v.ticketParam.parse({ ticketId: 'nope' })).toThrow();
    expect(() => v.listQuery.parse({ status: 'spam' })).toThrow();
    expect(v.listQuery.parse({ status: 'open' })).toEqual({ status: 'open' });
    expect(v.listQuery.parse({})).toEqual({});
  });

  it('keeps the resolution note optional and bounded', () => {
    expect(v.resolve.parse({})).toEqual({});
    expect(v.resolve.parse({ note: '  Fixed  ' })).toEqual({ note: 'Fixed' });
    expect(() => v.resolve.parse({ note: 'y'.repeat(1001) })).toThrow();
  });
});