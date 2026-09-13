/**
 * Short-lived in-memory giveaway drafts.
 *
 * Only used by the fallback flow, where the role picker comes after the modal.
 * Drafts are intentionally NOT persisted - an abandoned draft should simply
 * evaporate rather than linger in the database.
 */
const drafts = new Map();
const TTL_MS = 15 * 60 * 1000; // 15 minutes

let seq = 0;

export function saveDraft(userId, data) {
  const id = `d${Date.now().toString(36)}${(seq++).toString(36)}`;
  drafts.set(id, { id, userId, data: { ...data }, createdAt: Date.now() });
  sweep();
  return id;
}

/** Returns the draft data, but only for the user who created it. */
export function getDraft(id, userId) {
  const entry = drafts.get(id);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > TTL_MS) {
    drafts.delete(id);
    return null;
  }
  if (userId && entry.userId !== userId) return null;
  return entry.data;
}

export function updateDraft(id, patch) {
  const entry = drafts.get(id);
  if (!entry) return null;
  entry.data = { ...entry.data, ...patch };
  return entry.data;
}

export function deleteDraft(id) {
  return drafts.delete(id);
}

export function draftCount() {
  return drafts.size;
}

function sweep() {
  const now = Date.now();
  for (const [id, entry] of drafts) {
    if (now - entry.createdAt > TTL_MS) drafts.delete(id);
  }
}

/** Test hook. */
export function _clearDrafts() {
  drafts.clear();
}
