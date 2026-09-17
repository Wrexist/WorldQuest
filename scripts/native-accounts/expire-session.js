// Maestro runs on the CI host. End every live session, so the next
// authenticated action meets SESSION_EXPIRED instead of a silent reset.
output.expired = json(http.get('http://127.0.0.1:8789/__proof/expire-session').body).expired
