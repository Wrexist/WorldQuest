// Maestro runs on the CI host. Age the pending challenge server-side: the code
// the device still holds becomes stale for the same reason a real one would.
output.expired = json(http.get('http://127.0.0.1:8789/__proof/expire-challenge').body).expired
