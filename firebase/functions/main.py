"""DrawColor Licensing - Firebase Cloud Functions (Python 3.11+)

This module implements the server-side licensing logic:
- /validate: Validates license status (trial, active, expired, machine_limit)
- /deactivate-machine: Removes a machine from a user's registered machines
- /purchase-webhook: Activates paid license via payment platform webhooks
"""

import hashlib
import hmac
import json
import math
import os
from datetime import datetime, timedelta, timezone

from firebase_admin import auth, firestore, initialize_app
from firebase_functions import https_fn

from models import create_machine_entry, create_user_document, serialize_machine_entry
from validators import (
    extract_hostname_from_machine_id,
    validate_deactivate_request,
    validate_validate_request,
)

# Initialize Firebase Admin SDK
initialize_app()


@https_fn.on_request()
def validate(req: https_fn.Request) -> https_fn.Response:
    """Validate a user's license status.

    Accepts POST with JSON body: { token: string, machineId: string }

    Flow:
    1. Validate input (token and machineId presence/format)
    2. Verify Firebase ID token
    3. Look up user document in Firestore by UID
    4. If user not found (first login), create new user document
    5. If paid: return "active" (full machine logic in task 2.5)
    6. If unpaid: calculate trial status from server-side trialStart

    Returns:
        HTTP 200 with {status: "trial", daysLeft: N} if within 14-day trial.
        HTTP 200 with {status: "expired"} if trial has ended.
        HTTP 200 with {status: "active"} if user has paid.
        HTTP 400 for missing/invalid machineId.
        HTTP 401 for invalid/expired tokens.
        HTTP 405 for non-POST methods.
        HTTP 500 for internal errors.
    """
    # Only accept POST
    if req.method != "POST":
        return https_fn.Response(
            json.dumps({"error": "Method not allowed"}),
            status=405,
            headers={"Content-Type": "application/json"},
        )

    # Parse JSON body
    try:
        data = req.get_json(silent=True)
    except Exception:
        data = None

    # Validate input fields
    is_valid, error_message, status_code = validate_validate_request(data)
    if not is_valid:
        return https_fn.Response(
            json.dumps({"error": error_message}),
            status=status_code,
            headers={"Content-Type": "application/json"},
        )

    token = data["token"]
    machine_id = data["machineId"]

    # Verify Firebase ID token
    try:
        decoded_token = auth.verify_id_token(token)
    except (auth.InvalidIdTokenError, auth.ExpiredIdTokenError,
            auth.RevokedIdTokenError, auth.CertificateFetchError,
            auth.UserDisabledError, ValueError):
        return https_fn.Response(
            json.dumps({"error": "Invalid or expired token"}),
            status=401,
            headers={"Content-Type": "application/json"},
        )

    uid = decoded_token["uid"]
    email = decoded_token.get("email", "")

    # Look up user document in Firestore
    db = firestore.client()
    user_ref = db.collection("users").document(uid)

    try:
        user_doc = user_ref.get()
    except Exception:
        return https_fn.Response(
            json.dumps({"error": "Internal server error"}),
            status=500,
            headers={"Content-Type": "application/json"},
        )

    # If user not found on first login, create document
    if not user_doc.exists:
        new_user_data = create_user_document(email)
        try:
            user_ref.set(new_user_data)
        except Exception:
            return https_fn.Response(
                json.dumps({"error": "Internal server error"}),
                status=500,
                headers={"Content-Type": "application/json"},
            )
        # Re-read document to get resolved server timestamps
        try:
            user_doc = user_ref.get()
        except Exception:
            return https_fn.Response(
                json.dumps({"error": "Internal server error"}),
                status=500,
                headers={"Content-Type": "application/json"},
            )

    # Extract user data from Firestore document
    user_data = user_doc.to_dict()

    # Determine license status based on paid field and trial period
    if user_data.get("paid", False):
        # Paid user — full machine control logic
        machines = user_data.get("machines", [])
        hostname_part = extract_hostname_from_machine_id(machine_id)
        now = datetime.now(timezone.utc)

        # Check if requesting machineId is already in machines list
        machine_index = None
        for i, m in enumerate(machines):
            if m.get("id") == machine_id:
                machine_index = i
                break

        if machine_index is not None:
            # Machine already registered — update lastSeen
            machines[machine_index]["lastSeen"] = now
            try:
                user_ref.update({"machines": machines})
            except Exception:
                return https_fn.Response(
                    json.dumps({"error": "Internal server error"}),
                    status=500,
                    headers={"Content-Type": "application/json"},
                )
            return https_fn.Response(
                json.dumps({"status": "active"}),
                status=200,
                headers={"Content-Type": "application/json"},
            )

        if len(machines) < 2:
            # Machine not present but under limit — add new machine entry
            new_machine = {
                "id": machine_id,
                "name": hostname_part,
                "lastSeen": now,
            }
            machines.append(new_machine)
            try:
                user_ref.update({"machines": machines})
            except Exception:
                return https_fn.Response(
                    json.dumps({"error": "Internal server error"}),
                    status=500,
                    headers={"Content-Type": "application/json"},
                )
            return https_fn.Response(
                json.dumps({"status": "active"}),
                status=200,
                headers={"Content-Type": "application/json"},
            )

        # Machine not present and already at limit (2 machines)
        serialized_machines = [serialize_machine_entry(m) for m in machines]
        return https_fn.Response(
            json.dumps({"status": "machine_limit", "machines": serialized_machines}),
            status=200,
            headers={"Content-Type": "application/json"},
        )

    # Unpaid user — calculate trial status using server-side trialStart only
    trial_start = user_data.get("trialStart")
    if trial_start is None:
        # Shouldn't happen, but treat as expired if trialStart is missing
        return https_fn.Response(
            json.dumps({"status": "expired"}),
            status=200,
            headers={"Content-Type": "application/json"},
        )

    # Convert Firestore timestamp to datetime if needed
    if hasattr(trial_start, "timestamp"):
        # Firestore DatetimeWithNanoseconds — already datetime-like
        trial_start_dt = trial_start.replace(tzinfo=timezone.utc) if trial_start.tzinfo is None else trial_start
    else:
        # Fallback: treat as expired if we can't parse
        return https_fn.Response(
            json.dumps({"status": "expired"}),
            status=200,
            headers={"Content-Type": "application/json"},
        )

    now = datetime.now(timezone.utc)
    trial_end = trial_start_dt + timedelta(days=14)

    if now < trial_end:
        # Within trial period — register/update machine (requirement 4.5)
        machines = user_data.get("machines", [])
        hostname_part = extract_hostname_from_machine_id(machine_id)

        machine_index = None
        for i, m in enumerate(machines):
            if m.get("id") == machine_id:
                machine_index = i
                break

        if machine_index is not None:
            # Machine already registered — update lastSeen
            machines[machine_index]["lastSeen"] = now
        elif len(machines) < 2:
            # Machine not present but under limit — add new entry
            new_machine = {
                "id": machine_id,
                "name": hostname_part,
                "lastSeen": now,
            }
            machines.append(new_machine)
        # Note: if machine not present and at limit during trial,
        # we still return trial status but don't add the machine

        try:
            user_ref.update({"machines": machines})
        except Exception:
            # Non-critical: machine registration failure shouldn't block trial access
            pass

        # Calculate days remaining
        remaining = trial_end - now
        days_left = max(1, math.ceil(remaining.total_seconds() / 86400))
        return https_fn.Response(
            json.dumps({"status": "trial", "daysLeft": days_left}),
            status=200,
            headers={"Content-Type": "application/json"},
        )
    else:
        # Trial expired
        return https_fn.Response(
            json.dumps({"status": "expired"}),
            status=200,
            headers={"Content-Type": "application/json"},
        )


@https_fn.on_request()
def deactivate_machine(req: https_fn.Request) -> https_fn.Response:
    """Deactivate (remove) a machine from a user's registered machines list.

    Accepts POST with JSON body: { token: string, machineId: string }

    Flow:
    1. Validate input (token and machineId presence/format)
    2. Verify Firebase ID token
    3. Look up user document in Firestore by UID
    4. Find machine by machineId in machines array
    5. If found: remove it and update Firestore document
    6. If not found: return HTTP 404

    Returns:
        HTTP 200 with {success: true, message: "Machine deactivated"} on success.
        HTTP 400 for missing/invalid machineId.
        HTTP 401 for invalid/expired tokens.
        HTTP 404 if machineId not found in user's machines list.
        HTTP 405 for non-POST methods.
        HTTP 500 for internal errors.
    """
    # Only accept POST
    if req.method != "POST":
        return https_fn.Response(
            json.dumps({"error": "Method not allowed"}),
            status=405,
            headers={"Content-Type": "application/json"},
        )

    # Parse JSON body
    try:
        data = req.get_json(silent=True)
    except Exception:
        data = None

    # Validate input fields
    is_valid, error_message, status_code = validate_deactivate_request(data)
    if not is_valid:
        return https_fn.Response(
            json.dumps({"error": error_message}),
            status=status_code,
            headers={"Content-Type": "application/json"},
        )

    token = data["token"]
    machine_id = data["machineId"]

    # Verify Firebase ID token
    try:
        decoded_token = auth.verify_id_token(token)
    except (auth.InvalidIdTokenError, auth.ExpiredIdTokenError,
            auth.RevokedIdTokenError, auth.CertificateFetchError,
            auth.UserDisabledError, ValueError):
        return https_fn.Response(
            json.dumps({"error": "Invalid or expired token"}),
            status=401,
            headers={"Content-Type": "application/json"},
        )

    uid = decoded_token["uid"]

    # Look up user document in Firestore
    db = firestore.client()
    user_ref = db.collection("users").document(uid)

    try:
        user_doc = user_ref.get()
    except Exception:
        return https_fn.Response(
            json.dumps({"error": "Internal server error"}),
            status=500,
            headers={"Content-Type": "application/json"},
        )

    if not user_doc.exists:
        return https_fn.Response(
            json.dumps({"error": "Machine not found"}),
            status=404,
            headers={"Content-Type": "application/json"},
        )

    user_data = user_doc.to_dict()
    machines = user_data.get("machines", [])

    # Find machine by machineId in machines array
    machine_index = None
    for i, machine in enumerate(machines):
        if machine.get("id") == machine_id:
            machine_index = i
            break

    if machine_index is None:
        # Machine not found in user's list
        return https_fn.Response(
            json.dumps({"error": "Machine not found"}),
            status=404,
            headers={"Content-Type": "application/json"},
        )

    # Remove machine entry from array and save document
    machines.pop(machine_index)
    try:
        user_ref.update({"machines": machines})
    except Exception:
        return https_fn.Response(
            json.dumps({"error": "Internal server error"}),
            status=500,
            headers={"Content-Type": "application/json"},
        )

    return https_fn.Response(
        json.dumps({"success": True, "message": "Machine deactivated"}),
        status=200,
        headers={"Content-Type": "application/json"},
    )


@https_fn.on_request()
def purchase_webhook(req: https_fn.Request) -> https_fn.Response:
    """Activate a paid license via payment platform webhook.

    Supports two modes:
    1. Stripe: Uses Stripe-Signature header for webhook verification
    2. Generic (Gumroad/Hotmart): Uses HMAC-SHA256 signature in JSON body

    Stripe sends raw body + Stripe-Signature header.
    Generic platforms send JSON with email + signature + platform fields.

    Returns:
        HTTP 200 with {success: true, message: "License activated"} on success.
        HTTP 403 with {error: "Invalid signature"} for bad signatures.
        HTTP 405 for non-POST methods.
        HTTP 500 for internal errors.
    """
    # Only accept POST
    if req.method != "POST":
        return https_fn.Response(
            json.dumps({"error": "Method not allowed"}),
            status=405,
            headers={"Content-Type": "application/json"},
        )

    # Detect Stripe webhook by presence of Stripe-Signature header
    stripe_signature = req.headers.get("Stripe-Signature", "")

    if stripe_signature:
        return _handle_stripe_webhook(req, stripe_signature)
    else:
        return _handle_generic_webhook(req)


def _handle_stripe_webhook(req: https_fn.Request, stripe_signature: str) -> https_fn.Response:
    """Handle Stripe webhook with native signature verification."""
    import time

    stripe_secret = os.environ.get("STRIPE_WEBHOOK_SECRET", "")
    if not stripe_secret:
        return https_fn.Response(
            json.dumps({"error": "Stripe webhook secret not configured"}),
            status=500,
            headers={"Content-Type": "application/json"},
        )

    # Get raw body for signature verification
    raw_body = req.get_data(as_text=True)

    # Verify Stripe signature (v1 scheme)
    try:
        # Parse the signature header
        elements = dict(
            item.split("=", 1) for item in stripe_signature.split(",")
            if "=" in item
        )
        timestamp = elements.get("t", "")
        signature = elements.get("v1", "")

        if not timestamp or not signature:
            return https_fn.Response(
                json.dumps({"error": "Invalid signature"}),
                status=403,
                headers={"Content-Type": "application/json"},
            )

        # Check timestamp tolerance (5 minutes)
        if abs(time.time() - int(timestamp)) > 300:
            return https_fn.Response(
                json.dumps({"error": "Invalid signature"}),
                status=403,
                headers={"Content-Type": "application/json"},
            )

        # Compute expected signature
        signed_payload = timestamp + "." + raw_body
        expected = hmac.new(
            stripe_secret.encode("utf-8"),
            signed_payload.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()

        if not hmac.compare_digest(expected, signature):
            return https_fn.Response(
                json.dumps({"error": "Invalid signature"}),
                status=403,
                headers={"Content-Type": "application/json"},
            )

    except (ValueError, KeyError):
        return https_fn.Response(
            json.dumps({"error": "Invalid signature"}),
            status=403,
            headers={"Content-Type": "application/json"},
        )

    # Signature valid — parse the event
    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        return https_fn.Response(
            json.dumps({"error": "Invalid JSON"}),
            status=400,
            headers={"Content-Type": "application/json"},
        )

    # Handle checkout.session.completed event
    event_type = event.get("type", "")
    if event_type != "checkout.session.completed":
        # Acknowledge but ignore other events
        return https_fn.Response(
            json.dumps({"received": True}),
            status=200,
            headers={"Content-Type": "application/json"},
        )

    # Extract customer email from the checkout session
    session_data = event.get("data", {}).get("object", {})
    email = session_data.get("customer_email") or session_data.get("customer_details", {}).get("email", "")

    if not email:
        return https_fn.Response(
            json.dumps({"error": "No email in checkout session"}),
            status=400,
            headers={"Content-Type": "application/json"},
        )

    # Activate license
    return _activate_license(email)


def _handle_generic_webhook(req: https_fn.Request) -> https_fn.Response:
    """Handle generic webhook (Gumroad/Hotmart) with HMAC-SHA256 verification."""
    try:
        data = req.get_json(silent=True)
    except Exception:
        data = None

    if data is None:
        return https_fn.Response(
            json.dumps({"error": "Request body is required"}),
            status=400,
            headers={"Content-Type": "application/json"},
        )

    email = data.get("email", "")
    signature = data.get("signature", "")

    if not email or not isinstance(email, str):
        return https_fn.Response(
            json.dumps({"error": "email is required"}),
            status=400,
            headers={"Content-Type": "application/json"},
        )

    if not signature or not isinstance(signature, str):
        return https_fn.Response(
            json.dumps({"error": "signature is required"}),
            status=400,
            headers={"Content-Type": "application/json"},
        )

    # Validate HMAC-SHA256 signature
    webhook_secret = os.environ.get("WEBHOOK_SECRET", "")
    expected_signature = hmac.new(
        webhook_secret.encode("utf-8"),
        email.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(expected_signature, signature):
        return https_fn.Response(
            json.dumps({"error": "Invalid signature"}),
            status=403,
            headers={"Content-Type": "application/json"},
        )

    return _activate_license(email)


def _activate_license(email: str) -> https_fn.Response:
    """Activate a license for the given email in Firestore."""
    db = firestore.client()

    try:
        users_ref = db.collection("users")
        query = users_ref.where("email", "==", email).limit(1)
        results = list(query.stream())

        if results:
            user_doc_ref = results[0].reference
            user_doc_ref.update({"paid": True})
        else:
            new_user_data = create_user_document(email)
            new_user_data["paid"] = True
            users_ref.add(new_user_data)

    except Exception:
        return https_fn.Response(
            json.dumps({"error": "Internal server error"}),
            status=500,
            headers={"Content-Type": "application/json"},
        )

    return https_fn.Response(
        json.dumps({"success": True, "message": "License activated"}),
        status=200,
        headers={"Content-Type": "application/json"},
    )
