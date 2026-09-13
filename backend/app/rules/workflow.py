"""
ClinBridge — Referral Workflow State Machine

Server-side enforcement only. The frontend may also disable buttons for
UX, but that is never sufficient on its own — every transition must be
re-checked here regardless of what the client sends.

States:
    created -> reviewed -> approved -> sent -> acknowledged -> closed
    (any of reviewed/approved/sent) -> rejected
    rejected -> created   (reopened for revision)

"needs_revision" is intentionally not a separate state: a rejection sends
the referral back to "created" with an audit event recording why, which
keeps the state count small and the transition table easy to reason about.
"""

from typing import Optional

ALL_STATUSES = (
    "created",
    "reviewed",
    "approved",
    "sent",
    "acknowledged",
    "closed",
    "rejected",
)

# Map of current_status -> set of statuses it may legally move to.
ALLOWED_TRANSITIONS = {
    "created": {"reviewed", "rejected"},
    "reviewed": {"approved", "rejected", "created"},
    "approved": {"sent", "rejected"},
    "sent": {"acknowledged"},
    "acknowledged": {"closed"},
    "closed": set(),
    "rejected": {"created"},
}


class InvalidTransitionError(Exception):
    def __init__(self, current: str, target: str):
        self.current = current
        self.target = target
        super().__init__(f"Cannot transition referral from '{current}' to '{target}'")


def assert_valid_transition(current_status: str, target_status: str) -> None:
    if target_status not in ALL_STATUSES:
        raise InvalidTransitionError(current_status, target_status)
    if target_status not in ALLOWED_TRANSITIONS.get(current_status, set()):
        raise InvalidTransitionError(current_status, target_status)


# Which roles may perform which transition. Admin can always act (break-glass
# for demo/support purposes) — every other role is scoped to its real-world
# responsibility in the referral loop.
TRANSITION_ROLES = {
    ("created", "reviewed"): {"referring_clinician", "coordinator", "admin"},
    ("reviewed", "approved"): {"referring_clinician", "admin"},
    ("reviewed", "created"): {"referring_clinician", "admin"},
    ("approved", "sent"): {"referring_clinician", "coordinator", "admin"},
    ("sent", "acknowledged"): {"receiving_clinician", "coordinator", "admin"},
    ("acknowledged", "closed"): {"receiving_clinician", "coordinator", "admin"},
    ("created", "rejected"): {"referring_clinician", "receiving_clinician", "coordinator", "admin"},
    ("reviewed", "rejected"): {"referring_clinician", "receiving_clinician", "coordinator", "admin"},
    ("approved", "rejected"): {"referring_clinician", "receiving_clinician", "coordinator", "admin"},
    ("rejected", "created"): {"referring_clinician", "coordinator", "admin"},
}


def assert_role_permitted(current_status: str, target_status: str, role: str) -> None:
    allowed_roles = TRANSITION_ROLES.get((current_status, target_status))
    if allowed_roles is None:
        # Transition itself is invalid; let assert_valid_transition's message take precedence.
        return
    if role not in allowed_roles:
        raise PermissionError(
            f"Role '{role}' may not move a referral from '{current_status}' to '{target_status}'"
        )
