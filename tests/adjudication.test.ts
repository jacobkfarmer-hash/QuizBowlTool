import { expect, it, vi } from 'vitest';
import { api } from '../src/api/client';
import { adjudicate } from '../src/core/adjudication';
vi.mock('../src/api/client', () => ({ api: { check: vi.fn() } }));
it('keeps prompted surname context for a first-name clarification', async () => { vi.mocked(api.check).mockResolvedValueOnce({ directive: 'reject' }).mockResolvedValueOnce({ directive: 'accept' }); expect((await adjudicate('Johann Sebastian Bach', 'Johann Sebastian', ['Bach'])).directive).toBe('accept'); expect(api.check).toHaveBeenLastCalledWith('Johann Sebastian Bach', 'Johann Sebastian Bach'); });
it('does not contaminate an accepted complete answer with the old prompt', async () => { vi.mocked(api.check).mockClear().mockResolvedValueOnce({ directive: 'accept' }); expect((await adjudicate('retrovirus', 'retrovirus', ['HIV'])).directive).toBe('accept'); expect(api.check).toHaveBeenCalledOnce(); });
