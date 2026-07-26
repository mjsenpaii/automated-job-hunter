/**
 * Import-flow UI state machine helpers (pure — unit-testable).
 */

export type ImportUiState =
  | 'IDLE'
  | 'SCANNING'
  | 'PARTIAL_RESULT'
  | 'READY_TO_SCORE'
  | 'SCORING'
  | 'SCORED'
  | 'HARD_REJECTED'
  | 'INELIGIBLE'
  | 'DUPLICATE'
  | 'ERROR';

export function deriveReviewState(missingRequired: string[]): 'PARTIAL_RESULT' | 'READY_TO_SCORE' {
  return missingRequired.length > 0 ? 'PARTIAL_RESULT' : 'READY_TO_SCORE';
}

/** Maps API result status directly onto the UI state machine (including INELIGIBLE). */
export function deriveResultState(
  status: 'SCORED' | 'HARD_REJECTED' | 'INELIGIBLE' | 'DUPLICATE',
): 'SCORED' | 'HARD_REJECTED' | 'INELIGIBLE' | 'DUPLICATE' {
  return status;
}

/** True when Confirm & Score may be submitted. */
export function canConfirmAndScore(
  uiState: ImportUiState,
  missingRequired: string[],
  scoringInFlight: boolean,
): boolean {
  if (scoringInFlight) return false;
  if (uiState !== 'READY_TO_SCORE' && uiState !== 'PARTIAL_RESULT' && uiState !== 'ERROR') {
    return false;
  }
  return missingRequired.length === 0;
}

export function isValidHttpUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  try {
    const u = new URL(trimmed);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}
