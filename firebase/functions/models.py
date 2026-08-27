"""Firestore data models for DrawColor licensing.

Defines the user document schema and helpers for creating/serializing
user documents in the Firestore `users` collection.

Schema (users/{uid}):
  - email: str
  - trialStart: Timestamp
  - paid: bool
  - machines: list of {id: str, name: str, lastSeen: Timestamp}
  - createdAt: Timestamp
"""

from datetime import datetime, timezone
from google.cloud.firestore_v1 import SERVER_TIMESTAMP


# --- Schema field constants ---

USER_FIELDS = ("email", "trialStart", "paid", "machines", "createdAt")
MACHINE_FIELDS = ("id", "name", "lastSeen")


# --- Document creation helpers ---


def create_user_document(email: str) -> dict:
    """Create a new user document with default values.

    Sets trialStart and createdAt to SERVER_TIMESTAMP (resolved server-side),
    paid to False, and machines to an empty list.

    Args:
        email: The user's email from Firebase Auth token.

    Returns:
        A dict ready to be written to Firestore.
    """
    return {
        "email": email,
        "trialStart": SERVER_TIMESTAMP,
        "paid": False,
        "machines": [],
        "createdAt": SERVER_TIMESTAMP,
    }


def create_machine_entry(machine_id: str, name: str) -> dict:
    """Create a machine entry for the machines array.

    Args:
        machine_id: The machine fingerprint (hostname|username).
        name: Human-readable name (typically the hostname part).

    Returns:
        A dict representing a machine entry with SERVER_TIMESTAMP for lastSeen.
    """
    return {
        "id": machine_id,
        "name": name,
        "lastSeen": SERVER_TIMESTAMP,
    }


# --- Timestamp serialization helpers ---


def timestamp_to_iso(timestamp) -> str | None:
    """Convert a Firestore Timestamp or datetime to ISO 8601 string.

    Args:
        timestamp: A Firestore Timestamp, datetime, or None.

    Returns:
        ISO 8601 string or None if input is None/invalid.
    """
    if timestamp is None:
        return None
    # Firestore timestamps have a .isoformat() after converting to datetime
    if hasattr(timestamp, "timestamp"):
        # It's a datetime-like object (Firestore DatetimeWithNanoseconds)
        return timestamp.isoformat()
    return None


def datetime_from_iso(iso_string: str) -> datetime | None:
    """Parse an ISO 8601 string into a timezone-aware datetime.

    Args:
        iso_string: An ISO 8601 formatted string.

    Returns:
        A timezone-aware datetime or None if parsing fails.
    """
    if not iso_string:
        return None
    try:
        dt = datetime.fromisoformat(iso_string)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except (ValueError, TypeError):
        return None


def serialize_machine_entry(machine: dict) -> dict:
    """Serialize a machine entry for JSON API responses.

    Converts the lastSeen Timestamp to ISO string format.

    Args:
        machine: A machine entry dict from Firestore.

    Returns:
        A dict with lastSeen as ISO string, suitable for JSON response.
    """
    return {
        "id": machine.get("id", ""),
        "name": machine.get("name", ""),
        "lastSeen": timestamp_to_iso(machine.get("lastSeen")),
    }


def serialize_user_for_response(user_doc: dict) -> dict:
    """Serialize a user document for debugging/admin responses.

    Args:
        user_doc: The raw Firestore document as a dict.

    Returns:
        A JSON-serializable dict with timestamps converted to ISO strings.
    """
    return {
        "email": user_doc.get("email", ""),
        "trialStart": timestamp_to_iso(user_doc.get("trialStart")),
        "paid": user_doc.get("paid", False),
        "machines": [
            serialize_machine_entry(m) for m in user_doc.get("machines", [])
        ],
        "createdAt": timestamp_to_iso(user_doc.get("createdAt")),
    }
