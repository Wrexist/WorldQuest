// Maestro runs on the CI host. This endpoint delivers synthetic codes only.
output.code = json(http.get('http://127.0.0.1:8789/__proof/mailbox').body).code
