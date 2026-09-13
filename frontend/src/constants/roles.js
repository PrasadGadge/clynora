/**
 * The four roles enforced server-side (app/auth.py ROLES / app/rules/workflow.py).
 * These are no longer display-only labels — the role returned at login
 * determines which workflow transitions the backend will accept from this
 * user (see TRANSITION_ROLES in backend/app/rules/workflow.py).
 */
export const ROLES = [
  { id: "referring_clinician", label: "Referring Clinician" },
  { id: "receiving_clinician", label: "Receiving Clinician" },
  { id: "coordinator", label: "Coordinator" },
  { id: "admin", label: "Admin" },
];

export const ROLE_LABEL = ROLES.reduce((acc, r) => ({ ...acc, [r.id]: r.label }), {});

export const isValidRole = (id) => Boolean(id) && id in ROLE_LABEL;
