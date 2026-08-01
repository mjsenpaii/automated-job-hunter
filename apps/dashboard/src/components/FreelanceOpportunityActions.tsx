'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { FreelanceOpportunity } from '@job-app/ingestion/freelance/contracts';

export function FreelanceOpportunityActions({ opportunity }: { opportunity: FreelanceOpportunity }) {
  const router = useRouter();
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [sampleCreated, setSampleCreated] = useState(false);
  const [manualNote, setManualNote] = useState(opportunity.manualNote ?? '');
  const [sampleNote, setSampleNote] = useState('');
  const [concerns, setConcerns] = useState('');

  async function update(body: unknown) {
    setWorking(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/freelance-opportunities/${opportunity.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error('The local status could not be updated.');
      setMessage('Saved locally. No proposal, bid, message, or application was sent.');
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Safe local update failed.'); }
    finally { setWorking(false); }
  }

  return <section className="freelance-actions" aria-labelledby="freelance-actions-title">
    <div><p className="eyebrow">Local review actions</p><h2 id="freelance-actions-title">Decide what happens next</h2><p>These actions only update this local workspace.</p></div>
    <label className="freelance-manual-note">Manual note<textarea rows={3} value={manualNote} maxLength={500} onChange={(event) => setManualNote(event.target.value)} placeholder="Scope questions, client follow-up, or local application notes" /></label>
    <div className="freelance-action-row"><button className="button button-primary" type="button" disabled={working} onClick={() => void update({ action: 'SHORTLIST', note: manualNote.trim() || null })}>Shortlist</button><button className="button button-secondary" type="button" disabled={working} onClick={() => void update({ action: 'DISMISS', note: manualNote.trim() || null })}>Dismiss</button><button className="button button-secondary" type="button" disabled={working} onClick={() => void update({ action: 'MARK_APPLIED_MANUALLY', note: manualNote.trim() || null })}>Mark applied manually</button></div>
    {opportunity.readiness.classification === 'LEARNABLE_FAST_WITH_AI' && opportunity.preparation.state !== 'COMPLETED' && <details className="freelance-preparation"><summary>Mark Preparation Complete</summary><div><p>Confirm learning and practice truthfully. This does not contact the client.</p><label><input type="checkbox" checked={sampleCreated} onChange={(event) => setSampleCreated(event.target.checked)} />Sample project created</label><label>Sample link or local note<textarea value={sampleNote} onChange={(event) => setSampleNote(event.target.value)} rows={3} /></label><label>Remaining concerns<textarea value={concerns} onChange={(event) => setConcerns(event.target.value)} rows={3} /></label><button className="button button-primary" type="button" disabled={working} onClick={() => void update({ action: 'MARK_PREPARATION_COMPLETE', learningCompleted: true, sampleCreated, sampleLinkOrNote: sampleNote.trim() || null, remainingConcerns: concerns.trim() || null, readinessConfirmedManually: true })}>Confirm preparation locally</button></div></details>}
    {message && <p className="freelance-action-message" role="status">{message}</p>}
  </section>;
}
