// Maestro runs on the CI host. Restart the 60-second resend floor so the flow
// does not depend on how quickly it reached the button.
output.restamped = json(http.get('http://127.0.0.1:8789/__proof/recent-send').body).restamped
