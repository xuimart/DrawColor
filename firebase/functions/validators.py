"""Input validation helpers for DrawColor Cloud Functions.

Validates incoming request data before processing:
- Token presence and basic format
- Machine ID format (hostname|username pattern)
"""

import re

# Machine fingerprint pattern: hostname|username
# Both parts must be non-empty strings containing word characters, dots, or hyphens.
_MACHINE_ID_PATTERN = re.compile(r"^[a-zA-Z0-9._\-]+\|[a-zA-Z0-9._\-]+$")

# Maximum reasonable length for a machineId
_MACHINE_ID_MAX_LENGTH = 256


def validate_token(token: str | None) -> tuple[bool, str]:
    """Validate that a token is present and non-empty.

    This is a format-level check only. Actual token verification
    is done via firebase_admin.auth.verify_id_token().

    Args:
        token: The Firebase ID token string from the request.

    Returns:
        Tuple of (is_valid, error_message). error_message is empty if valid.
    """
    if token is None:
        return False, "Token is required"
    if not isinstance(token, str):
        return False, "Token must be a string"
    if len(token.strip()) == 0:
        return False, "Token cannot be empty"
    return True, ""


def validate_machine_id(machine_id: str | None) -> tuple[bool, str]:
    """Validate the machineId format.

    Expected format: "hostname|username" where both parts are non-empty
    and contain only word characters, dots, or hyphens.

    Args:
        machine_id: The machine fingerprint string from the request.

    Returns:
        Tuple of (is_valid, error_message). error_message is empty if valid.
    """
    if machine_id is None:
        return False, "machineId is required"
    if not isinstance(machine_id, str):
        return False, "machineId must be a string"
    if len(machine_id.strip()) == 0:
        return False, "machineId cannot be empty"
    if len(machine_id) > _MACHINE_ID_MAX_LENGTH:
        return False, "machineId exceeds maximum length"
    if not _MACHINE_ID_PATTERN.match(machine_id):
        return False, "machineId must be in format 'hostname|username'"
    return True, ""


def validate_validate_request(data: dict | None) -> tuple[bool, str, int]:
    """Validate the /validate request payload.

    Checks for presence of token and machineId fields with correct format.

    Args:
        data: The parsed JSON body of the request.

    Returns:
        Tuple of (is_valid, error_message, http_status_code).
        http_status_code is 0 if valid.
    """
    if data is None:
        return False, "Request body is required", 400

    token = data.get("token")
    token_valid, token_error = validate_token(token)
    if not token_valid:
        return False, token_error, 401

    machine_id = data.get("machineId")
    mid_valid, mid_error = validate_machine_id(machine_id)
    if not mid_valid:
        return False, mid_error, 400

    return True, "", 0


def validate_deactivate_request(data: dict | None) -> tuple[bool, str, int]:
    """Validate the /deactivate-machine request payload.

    Checks for presence of token and machineId fields.

    Args:
        data: The parsed JSON body of the request.

    Returns:
        Tuple of (is_valid, error_message, http_status_code).
        http_status_code is 0 if valid.
    """
    if data is None:
        return False, "Request body is required", 400

    token = data.get("token")
    token_valid, token_error = validate_token(token)
    if not token_valid:
        return False, token_error, 401

    machine_id = data.get("machineId")
    mid_valid, mid_error = validate_machine_id(machine_id)
    if not mid_valid:
        return False, mid_error, 400

    return True, "", 0


def extract_hostname_from_machine_id(machine_id: str) -> str:
    """Extract the hostname (display name) from a machine fingerprint.

    Args:
        machine_id: A validated machine ID in 'hostname|username' format.

    Returns:
        The hostname portion of the fingerprint.
    """
    parts = machine_id.split("|", 1)
    return parts[0] if parts else machine_id
