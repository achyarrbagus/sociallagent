import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { agencyBrands, agencyClients, agencySocialAccounts, companies, createDb } from "@paperclipai/db";
import { connectSocialAccountSchema } from "@paperclipai/shared";
import { secretService } from "../secrets.js";
import { socialAccountsService } from "./accounts.js";
import { getEmbeddedPostgresTestSupport, startEmbeddedPostgresTestDatabase } from "../../__tests__/helpers/embedded-postgres.js";

const support = await getEmbeddedPostgresTestSupport();
const suite = support.supported ? describe : describe.skip;
suite("agency social account credentials", () => {
  let db: ReturnType<typeof createDb>;
  let database: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>>;
  let sequence = 0;

  beforeAll(async () => {
    database = await startEmbeddedPostgresTestDatabase("paperclip-agency-social-account-");
    db = createDb(database.connectionString);
  }, 60_000);
  afterAll(async () => { await database?.cleanup(); });

  it("verifies and encrypts Facebook credentials, returns metadata only, and removes the secret on disconnect", async () => {
    const [company] = await db.insert(companies).values({ name: "Agency", issuePrefix: `AS${++sequence}` }).returning();
    const [client] = await db.insert(agencyClients).values({ companyId: company!.id, name: "Client" }).returning();
    const [brand] = await db.insert(agencyBrands).values({ companyId: company!.id, clientId: client!.id, name: "Brand" }).returning();
    const credentials = { pageId: "123456789012345", pageAccessToken: "opaque-facebook-page-token" };
    const fetchImpl = vi.fn(async () => Response.json({ id: credentials.pageId, name: "Verified Page" }));
    const service = socialAccountsService(db, fetchImpl);
    const actor = { actorType: "user" as const, actorId: "owner" };

    const connected = await service.connect(company!.id, brand!.id, "facebook", credentials, "owner", actor);
    expect(connected).toMatchObject({ platform: "facebook", displayName: "Verified Page", externalAccountId: credentials.pageId, status: "active" });
    expect(JSON.stringify(connected)).not.toContain(credentials.pageAccessToken);
    expect(fetchImpl).toHaveBeenCalledOnce();

    const [stored] = await db.select().from(agencySocialAccounts).where(and(
      eq(agencySocialAccounts.companyId, company!.id),
      eq(agencySocialAccounts.id, connected.id),
    ));
    expect(stored!.credentialsSecretId).toBeTruthy();
    const secretId = stored!.credentialsSecretId!;
    const savedValue = await secretService(db).resolveSecretValue(company!.id, secretId, "latest");
    expect(JSON.parse(savedValue)).toEqual(credentials);
    expect(await service.list(company!.id, brand!.id)).toEqual([connected]);

    const disconnected = await service.disconnect(company!.id, connected.id, actor);
    expect(disconnected).toMatchObject({ id: connected.id, status: "revoked" });
    expect(disconnected).not.toHaveProperty("credentialsSecretId");
    expect(await secretService(db).getById(secretId)).toBeNull();

    const providerFetch = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.startsWith("https://graph.instagram.com/")) return Response.json({ user_id: "17841400000000000", username: "coffee_creator" });
      if (url.startsWith("https://api.x.com/")) return Response.json({ data: { id: "x-user-42", username: "coffee" } });
      return Response.json({ sub: "li-member-42", name: "Coffee Member" });
    });
    const connectedProviders = socialAccountsService(db, providerFetch);
    const instagramCredentials = { accessToken: "opaque-instagram-user-token" };
    expect(connectSocialAccountSchema.safeParse({ brandId: brand!.id, platform: "instagram", credentials: instagramCredentials }).success).toBe(true);
    const instagramAccount = await connectedProviders.connect(company!.id, brand!.id, "instagram", instagramCredentials, "owner", actor);
    expect(instagramAccount).toMatchObject({ platform: "instagram", externalAccountId: "17841400000000000", displayName: "@coffee_creator" });
    expect(JSON.stringify(instagramAccount)).not.toContain(instagramCredentials.accessToken);
    const instagramSecretId = (await db.select().from(agencySocialAccounts).where(eq(agencySocialAccounts.id, instagramAccount.id)))[0]!.credentialsSecretId!;
    expect(JSON.parse(await secretService(db).resolveSecretValue(company!.id, instagramSecretId, "latest"))).toEqual({ ...instagramCredentials, instagramAccountId: "17841400000000000" });

    const xCredentials = { accessToken: "opaque-x-user-token" };
    expect(connectSocialAccountSchema.safeParse({ brandId: brand!.id, platform: "x", credentials: xCredentials }).success).toBe(true);
    const xAccount = await connectedProviders.connect(company!.id, brand!.id, "x", xCredentials, "owner", actor);
    const linkedinCredentials = { accessToken: "opaque-linkedin-token", authorUrn: "urn:li:person:li-member-42" };
    expect(connectSocialAccountSchema.safeParse({ brandId: brand!.id, platform: "linkedin", credentials: linkedinCredentials }).success).toBe(true);
    const linkedinAccount = await connectedProviders.connect(company!.id, brand!.id, "linkedin", linkedinCredentials, "owner", actor);
    expect(xAccount).toMatchObject({ platform: "x", externalAccountId: "x-user-42", displayName: "@coffee" });
    expect(linkedinAccount).toMatchObject({ platform: "linkedin", externalAccountId: "li-member-42", displayName: "Coffee Member" });
    expect(JSON.stringify([xAccount, linkedinAccount])).not.toContain("opaque-");
    expect(providerFetch).toHaveBeenCalledTimes(3);

    const tiktokFetch = vi.fn(async (input: string | URL | Request) => {
      if (String(input).endsWith("/oauth/token/")) {
        return Response.json({ access_token: "tiktok-access", refresh_token: "tiktok-refresh-rotated", open_id: "tiktok-open-42", scope: "video.publish", expires_in: 7200, refresh_expires_in: 15_552_000 });
      }
      return Response.json({ data: { creator_username: "coffee", creator_nickname: "Coffee Creator", privacy_level_options: ["SELF_ONLY"] }, error: { code: "ok" } });
    });
    const tiktokCredentials = { clientKey: "tiktok-client-key", clientSecret: "opaque-tiktok-secret", refreshToken: "opaque-tiktok-refresh" };
    expect(connectSocialAccountSchema.safeParse({ brandId: brand!.id, platform: "tiktok", credentials: tiktokCredentials }).success).toBe(true);
    const tiktokAccount = await socialAccountsService(db, tiktokFetch).connect(company!.id, brand!.id, "tiktok", tiktokCredentials, "owner", actor);
    expect(tiktokAccount).toMatchObject({ platform: "tiktok", externalAccountId: "tiktok-open-42", displayName: "Coffee Creator", status: "active" });
    expect(tiktokAccount.tokenExpiresAt).toBeTruthy();
    expect(JSON.stringify(tiktokAccount)).not.toContain("tiktok-access");
    const tiktokSecretId = (await db.select().from(agencySocialAccounts).where(eq(agencySocialAccounts.id, tiktokAccount.id)))[0]!.credentialsSecretId!;
    expect(JSON.parse(await secretService(db).resolveSecretValue(company!.id, tiktokSecretId, "latest"))).toMatchObject({
      clientKey: tiktokCredentials.clientKey,
      clientSecret: tiktokCredentials.clientSecret,
      accessToken: "tiktok-access",
      refreshToken: "tiktok-refresh-rotated",
      creatorUsername: "coffee",
    });
  });
});
