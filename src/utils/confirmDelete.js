// Typed confirmation for destructive actions.
// A misclick can never destroy data: the user must type the word "delete"
// (case-insensitive) into the prompt before the action proceeds.
export function confirmTypedDelete(what) {
  const answer = window.prompt(`${what}\n\nThis cannot be undone. Type DELETE to confirm:`);
  return (answer || '').trim().toLowerCase() === 'delete';
}
