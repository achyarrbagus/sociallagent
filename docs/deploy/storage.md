---
title: Storage
summary: Local disk vs S3-compatible storage
---

Paperclip stores uploaded files (issue attachments, images) using a configurable storage provider.

## Local Disk (Default)

Files are stored at:

```
~/.paperclip/instances/default/data/storage
```

No configuration required. Suitable for local development and single-machine deployments.

## S3-Compatible Storage

For production or multi-node deployments, use S3-compatible object storage (AWS S3, MinIO, Cloudflare R2, etc.).

Configure via CLI:

```sh
pnpm paperclipai configure --section storage
```

## Supabase Storage (S3 provider)

Supabase Storage speaks the S3 protocol, so it uses the `s3` provider. The bucket
must be private: the server is the only client and browsers never receive
Supabase keys. Create S3 access keys in the Supabase dashboard
(Storage > S3 Connection) and set:

```sh
PAPERCLIP_STORAGE_PROVIDER=s3
PAPERCLIP_STORAGE_S3_ENDPOINT=https://<project-ref>.supabase.co/storage/v1/s3
PAPERCLIP_STORAGE_S3_REGION=<project region>
PAPERCLIP_STORAGE_S3_BUCKET=<private bucket name>
PAPERCLIP_STORAGE_S3_FORCE_PATH_STYLE=true
PAPERCLIP_STORAGE_S3_ACCESS_KEY_ID=<access key id>
PAPERCLIP_STORAGE_S3_SECRET_ACCESS_KEY=<secret access key>
```

When both keys are set they are used instead of the default AWS credential
chain, so no `AWS_*` variables are needed in the server environment. Setting
only one of the two fails at startup. Credentials are read from the environment
only, never from the config file. All `PAPERCLIP_STORAGE_*` variables are
stripped from agent child processes. `AWS_*` variables are stripped too in
SaaS mode (see [SaaS Mode](/deploy/saas)).

Objects are keyed `<companyId>/...`; this layout is unchanged.

In SaaS mode videos are capped at `SOCIALAGENT_VIDEO_MAX_BYTES` (default
`104857600`, 100 MB). The Supabase project's per-file upload limit
(Storage settings) must be at least this value, or large uploads fail at
Supabase.

Verify the connection (put, head, get, delete of one object under a throwaway
`smoke-<uuid>` company prefix; prints `ok` on success, never prints credentials):

```sh
bun run storage:smoke
```

## Configuration

| Provider | Best For |
|----------|----------|
| `local_disk` | Local development, single-machine deployments |
| `s3` | Production, multi-node, cloud deployments |

Storage configuration is stored in the instance config file:

```
~/.paperclip/instances/default/config.json
```
