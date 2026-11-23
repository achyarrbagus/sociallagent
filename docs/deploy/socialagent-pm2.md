# SocialAgent PM2 deployment

The `SocialAgent PM2 deployment` GitHub Actions workflow builds on Linux and
runs manually with `workflow_dispatch`. Run the existing CI on the same commit
and review its result before dispatching deployment. The workflow has not been
qualified against an actual server until its first successful end-to-end run.

## Server prerequisites

Use a dedicated SSH deployment account, Bun 1.4.4, Node 24, PM2, tar and curl.
Give the account ownership of `~/sociallagent` and arrange PM2 startup for this
account. Use a separate application port; never reuse another service's port.
Create `~/sociallagent/shared/production.env` with mode 600. Configure the
production database URL, authentication and signing secrets, public URL,
managed AI, SaaS sandbox and storage as appropriate. See `docs/deploy/saas.md`
and `docs/deploy/environment-variables.md`. Do not commit or print credentials.
Provision a managed sandbox before enabling SaaS mode. Do not expose the service
publicly until HTTPS and DNS are configured. Back up and verify the database
before schema migrations; rollback of application code does not undo migrations.

## GitHub configuration

Create an environment named `production`. Add these environment secrets:

- `SOCIALAGENT_SSH_HOST`: server hostname or address.
- `SOCIALAGENT_SSH_USER`: dedicated deployment username.
- `SOCIALAGENT_SSH_KEY`: private SSH key for that user.
- `SOCIALAGENT_SSH_KNOWN_HOSTS`: verified server host key in OpenSSH known_hosts format.

Optionally set environment variable `SOCIALAGENT_SSH_PORT` (default 22).
Verify the host key through a trusted independent channel before storing it.
Do not put the database URL or provider keys into workflow secrets: the server
reads them from its protected environment file. The workflow does not create an
SSH key, install server software, configure DNS or HTTPS, or run migrations.

Choose the reviewed branch and run the workflow in GitHub Actions. It uploads an
archive to the deployment account, extracts into a SHA-named release, and starts
PM2 process `sociallagent`. It checks the local health endpoint before saving
PM2 state. On failure it attempts to restore the prior code release; inspect
both PM2 and database state before retrying. Existing release directories are
never overwritten. Remove old releases only after confirming they are no longer
needed for rollback and are not in use.
