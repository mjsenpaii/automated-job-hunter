/** Shared styles for the /import-job flow (kept as a string for the page <style> tag). */
export const IMPORT_STYLES = `
  .import-page {
    max-width: 44rem;
    margin: 0 auto;
  }
  .import-header h1 {
    font-size: 1.5rem;
    font-weight: 600;
    margin-bottom: 0.35rem;
  }
  .import-header p {
    color: var(--text-secondary);
    margin-bottom: 1.5rem;
    font-size: 0.95rem;
  }
  .panel {
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 10px;
    padding: 1.25rem 1.35rem;
    margin-bottom: 1.25rem;
  }
  .panel-head h2, .result-panel h2 {
    font-size: 1.15rem;
    margin-bottom: 0.25rem;
  }
  .meta { color: var(--text-muted); font-size: 0.85rem; margin-bottom: 1rem; }
  .eyebrow {
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-size: 0.7rem;
    color: var(--text-muted);
    margin-bottom: 0.35rem;
  }
  .field { margin-bottom: 0.9rem; }
  .field label {
    display: block;
    font-size: 0.85rem;
    font-weight: 500;
    color: var(--text-secondary);
    margin-bottom: 0.35rem;
  }
  .req { color: var(--status-rejected); }
  .field input, .field textarea, .field select,
  .url-row input {
    width: 100%;
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: 6px;
    padding: 0.65rem 0.75rem;
    color: var(--text-primary);
    font: inherit;
  }
  .field input:focus-visible, .field textarea:focus-visible, .field select:focus-visible,
  .url-row input:focus-visible, .btn:focus-visible {
    outline: 2px solid var(--accent-primary);
    outline-offset: 2px;
  }
  .field input.invalid, .field textarea.invalid, .field select.invalid {
    border-color: var(--status-rejected);
  }
  .field-error { color: var(--status-rejected); font-size: 0.8rem; margin-top: 0.25rem; }
  .field-hint { color: var(--text-muted); font-size: 0.75rem; margin-top: 0.25rem; }
  .url-row { display: flex; gap: 0.5rem; }
  .url-row input { flex: 1; }
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
  .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0.75rem; }
  @media (max-width: 720px) {
    .grid-2, .grid-3 { grid-template-columns: 1fr; }
    .url-row { flex-direction: column; }
  }
  fieldset {
    border: none;
    margin: 0 0 1.25rem;
    padding: 0;
  }
  legend {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin-bottom: 0.75rem;
  }
  .form-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid var(--border-color);
  }
  .btn {
    min-height: 2.5rem;
    padding: 0.55rem 1rem;
    border-radius: 6px;
    font-weight: 500;
    cursor: pointer;
    border: 1px solid transparent;
    text-decoration: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-primary {
    background: var(--accent-primary);
    color: white;
  }
  .btn-primary:hover:not(:disabled) { background: var(--accent-hover); }
  .btn-outline {
    background: transparent;
    color: var(--text-primary);
    border-color: var(--border-light);
  }
  .btn-outline:hover:not(:disabled) { background: rgba(255,255,255,0.04); }
  .banner {
    border-radius: 8px;
    padding: 0.85rem 1rem;
    margin-bottom: 1rem;
    font-size: 0.9rem;
  }
  .banner p { margin: 0.35rem 0 0; color: inherit; }
  .banner-error {
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.35);
    color: #fca5a5;
  }
  .banner-warn {
    background: rgba(245, 158, 11, 0.1);
    border: 1px solid rgba(245, 158, 11, 0.35);
    color: #fcd34d;
  }
  .banner-info {
    background: rgba(59, 130, 246, 0.1);
    border: 1px solid rgba(59, 130, 246, 0.3);
    color: #93c5fd;
  }
  .warnings {
    margin: 0 0 1rem;
    padding-left: 1.1rem;
    color: var(--text-secondary);
    font-size: 0.85rem;
  }
  .hint { margin-top: 1rem; font-size: 0.85rem; }
  .result-head {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    align-items: flex-start;
    margin-bottom: 1rem;
  }
  .score-box {
    text-align: right;
    min-width: 7rem;
    padding: 0.75rem 1rem;
    border: 1px solid var(--border-color);
    border-radius: 8px;
  }
  .score-value { font-size: 1.75rem; font-weight: 700; color: var(--accent-primary); }
  .score-label { color: var(--text-muted); }
  .rec { font-size: 0.75rem; text-transform: capitalize; color: var(--text-secondary); margin-top: 0.25rem; }
  .not-eval { color: var(--text-muted); font-size: 0.9rem; }
  .reason-list { margin: 0.5rem 0 0; padding-left: 1.1rem; }
  .decision { color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 1rem; }
  .decision p { margin-bottom: 0.5rem; }
  .sr-status {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    border: 0;
  }
  .scan-form .btn-primary { width: 100%; margin-top: 0.5rem; }
`;
