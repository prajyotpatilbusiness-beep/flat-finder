# Security Policy

## Reporting a vulnerability

Please do not publish security vulnerabilities, exposed credentials, personal data, or exploit details in a public issue.

Use GitHub's private vulnerability reporting for this repository when it is enabled. If private reporting is not available, contact the repository owner privately through GitHub and ask for a secure reporting channel before sharing technical details.

## Secrets and sensitive information

- Never commit Supabase service-role or secret keys, Twilio credentials, Razorpay secret keys, passwords, access tokens, private keys, or production environment files.
- Store backend credentials only in the relevant provider's secret manager.
- Browser-visible Supabase publishable keys are public identifiers, not authorization barriers. Database Row Level Security and backend authorization must protect the data.
- If a credential is ever committed or exposed, revoke/rotate it immediately. Deleting it from the latest commit is not sufficient because Git history may retain it.

## Scope and limitations

HTML, CSS, JavaScript, public images, and other assets sent to a visitor's browser can be inspected or copied. Do not place server-side secrets or private data in frontend bundles. Report any path that allows unauthorised access to data or privileged server actions.
