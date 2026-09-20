// Maestro runs on the CI host. Arm the one-shot device-cleanup failure, so the
// deletion that follows stops after the server has already erased the account.
output.armed = json(http.get('http://127.0.0.1:8789/__proof/arm-cleanup-failure').body).armed
