export function shouldSubmitComposer(input: {
  key: string;
  shiftKey: boolean;
  isComposing: boolean;
  canSubmit: boolean;
}): boolean {
  return (
    input.key === 'Enter' &&
    !input.shiftKey &&
    !input.isComposing &&
    input.canSubmit
  );
}
