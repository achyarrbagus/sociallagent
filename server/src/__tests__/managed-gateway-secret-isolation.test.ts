import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterEach, expect, it, vi } from "vitest";
import { activityLog, agents, connectionGrants, heartbeatRuns, issues, toolConnections } from "@paperclipai/db";
import {
  MANAGED_GATEWAY_SECRET_PLACEHOLDER,
  managedGatewayService,
  readManagedGatewayConfig,
  scrubStoredManagedGatewayKeys,
} from "../services/managed-gateway.js";
import { secretService } from "../services/secrets.js";
import { companySkillService } from "../services/company-skills.js";
import { instanceSettingsService } from "../services/instance-settings.js";
import { prepareHeartbeatExecutionConfiguration } from "../services/heartbeat/execution-configuration.js";
import { describeEmbeddedPostgres, seedCompanyWithBoardAccess, useEmbeddedPostgres } from "./helpers/route-test-harness.js";

const MASTER_KEY = "sk-9router-master-key-secret-isolation";

describeEmbeddedPostgres("managed 9Router key never stored per company in SaaS mode", () => {
  const ctx = useEmbeddedPostgres("managed-gateway-secret-isolation");

  afterEach(() => vi.unstubAllEnvs());

  function enable(saas: boolean) {
    vi.stubEnv("SOCIALAGENT_9ROUTER_API_KEY", MASTER_KEY);
    vi.stubEnv("SOCIALAGENT_9ROUTER_BASE_URL", "http://localhost:20128/v1");
    vi.stubEnv("SOCIALAGENT_SAAS_MODE", saas ? "true" : "false");
  }

  async function managedCompany() {
    const seeded = await seedCompanyWithBoardAccess(ctx.db, "Secret isolation");
    await managedGatewayService(ctx.db, () => readManagedGatewayConfig()).ensure(seeded.companyId, seeded.userId, "codex_local");
    const [grant] = await ctx.db.select({ refs: connectionGrants.credentialSecretRefs })
      .from(connectionGrants)
      .innerJoin(toolConnections, eq(toolConnections.id, connectionGrants.connectionId))
      .where(and(eq(connectionGrants.companyId, seeded.companyId), eq(toolConnections.name, "9Router (Codex)")));
    const secretId = grant!.refs.find(ref => ref.configPath === "ai.credential")!.secretId;
    return { ...seeded, secretId };
  }

  const storedValue = (companyId: string, secretId: string) =>
    secretService(ctx.db).resolveSecretValue(companyId, secretId, "latest");

  /** Real run configuration preparation for an agent whose env binds `secretId`. */
  async function prepareWithBoundSecret(companyId: string, secretId: string) {
    const agentId = randomUUID(), issueId = randomUUID();
    const env = { STOLEN: { type: "secret_ref", secretId, version: "latest" } };
    const [agent] = await ctx.db.insert(agents).values({ id: agentId, companyId, name: "Tenant agent", adapterType: "codex_local", status: "idle",
      adapterConfig: { env } }).returning();
    await secretService(ctx.db).syncEnvBindingsForTarget(companyId, { targetType: "agent", targetId: agentId }, env);
    await ctx.db.insert(issues).values({ id: issueId, companyId, title: "Exfiltrate", status: "todo", assigneeAgentId: agentId, issueNumber: 1 });
    const [run] = await ctx.db.insert(heartbeatRuns).values({ companyId, agentId, issueId, scopeKind: "issue", status: "running", contextSnapshot: {} }).returning();
    return prepareHeartbeatExecutionConfiguration(ctx.db, {
      run: run!, agent: agent!,
      task: { issueId, context: { issueId }, responsibleUserId: null, acceptedPlanContinuationWake: false, acceptedPlanWakeRoutingDecision: null,
        taskProjectContext: null, routineEnvContext: { routineId: null, env: null, responsibleUserId: null } },
      config: { sourceWorkspaceConfig: { env }, aiBinding: undefined },
      policy: { trustPreset: { kind: "standard", preset: "standard", boundary: null, sourcePresets: {} }, useIsolatedTaskDirectory: false,
        explicitTaskDirectory: false, requestedExecutionWorkspaceMode: "shared_workspace" },
      environment: { selectedEnvironmentId: null, selectedEnvironmentForConfig: null,
        resolvedInstanceSettings: await instanceSettingsService(ctx.db).get(), persistedNativeExecutionInput: null },
      services: { secretsSvc: secretService(ctx.db), companySkills: companySkillService(ctx.db), appendRunEvent: vi.fn(), finalizeAiConnectionBusyDeferral: vi.fn() },
      onFailureSecretsResolved: () => {}, onManagedAiRuntimeAcquired: () => {}, onIdentityRedactorPrepared: () => {},
    } as Parameters<typeof prepareHeartbeatExecutionConfiguration>[1]);
  }

  it("stores only the placeholder in SaaS mode, so binding the managed secret yields no key", async () => {
    enable(true);
    const { companyId, secretId } = await managedCompany();
    expect(await storedValue(companyId, secretId)).toBe(MANAGED_GATEWAY_SECRET_PLACEHOLDER);
    const prepared = await prepareWithBoundSecret(companyId, secretId);
    expect(prepared.prepared).toBe(true);
    if (!prepared.prepared) return;
    expect((prepared.resolvedConfig.env as Record<string, unknown>).STOLEN).toBe(MANAGED_GATEWAY_SECRET_PLACEHOLDER);
    expect(JSON.stringify(prepared.resolvedConfig)).not.toContain(MASTER_KEY);
  });

  it("keeps storing the key outside SaaS mode", async () => {
    enable(false);
    const { companyId, secretId } = await managedCompany();
    expect(await storedValue(companyId, secretId)).toBe(MASTER_KEY);
  });

  it("scrubs a key stored before SaaS mode at startup", async () => {
    enable(false);
    const { companyId, secretId } = await managedCompany();
    expect(await storedValue(companyId, secretId)).toBe(MASTER_KEY);
    expect(await scrubStoredManagedGatewayKeys(ctx.db)).toBe(0);

    enable(true);
    expect(await scrubStoredManagedGatewayKeys(ctx.db)).toBeGreaterThanOrEqual(1);
    expect(await storedValue(companyId, secretId)).toBe(MANAGED_GATEWAY_SECRET_PLACEHOLDER);
    const logged = await ctx.db.select().from(activityLog).where(and(eq(activityLog.companyId, companyId), eq(activityLog.action, "managed_gateway.stored_key_scrubbed")));
    expect(logged).toHaveLength(1);
    expect(JSON.stringify(logged)).not.toContain(MASTER_KEY);
    // Idempotent: nothing left to replace.
    expect(await scrubStoredManagedGatewayKeys(ctx.db)).toBe(0);
  });

  it("refuses a run whose env binds a secret holding the master key", async () => {
    enable(true);
    const seeded = await seedCompanyWithBoardAccess(ctx.db, "Manual key");
    const secret = await secretService(ctx.db).create(seeded.companyId, { name: `copied-${randomUUID()}`, provider: "local_encrypted", value: MASTER_KEY }, { userId: seeded.userId });
    const error = await prepareWithBoundSecret(seeded.companyId, secret.id).then(() => null, (caught: unknown) => caught);
    expect(error).toMatchObject({ status: 422, details: { code: "managed_gateway_key_exposed" } });
    expect(String((error as Error).message)).not.toContain(MASTER_KEY);
  });

  it("does not refuse the same binding outside SaaS mode", async () => {
    enable(false);
    const seeded = await seedCompanyWithBoardAccess(ctx.db, "Manual key outside SaaS");
    const secret = await secretService(ctx.db).create(seeded.companyId, { name: `copied-${randomUUID()}`, provider: "local_encrypted", value: MASTER_KEY }, { userId: seeded.userId });
    const prepared = await prepareWithBoundSecret(seeded.companyId, secret.id);
    expect(prepared.prepared).toBe(true);
  });
});
