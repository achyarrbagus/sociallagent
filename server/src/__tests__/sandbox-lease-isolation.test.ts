import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import {
  agents,
  companies,
  createDb,
  environmentLeases,
  environments,
  executionWorkspaces,
  heartbeatRuns,
  issues,
  plugins,
  projects,
} from "@paperclipai/db";
import { environmentRuntimeService } from "../services/environment-runtime.ts";
import { logger } from "../middleware/logger.js";
import type { PluginWorkerManager } from "../services/plugin-worker-manager.ts";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";

// Tenant isolation for sandbox leases. In SaaS mode every run gets its own
// provider sandbox and that sandbox is destroyed at release, so no later run
// (of any company) can attach to it. In every mode a reusable lease row is
// resumed only for the company that owns it.

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

describeEmbeddedPostgres("sandbox lease isolation", () => {
  let db!: ReturnType<typeof createDb>;
  let stopDb: (() => Promise<void>) | null = null;

  beforeAll(async () => {
    const started = await startEmbeddedPostgresTestDatabase("sandbox-lease-isolation");
    stopDb = started.stop;
    db = createDb(started.connectionString);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  afterAll(async () => {
    await db?.$client.end({ timeout: 1 });
    await stopDb?.();
  });

  /** A fake plugin sandbox provider that records every lifecycle call. */
  function createRecordingSandboxWorker(pluginId: string, options: { supportsDestroy?: boolean } = {}) {
    let allocation = 0;
    const calls: Array<{ method: string; params: Record<string, any> }> = [];
    const manager = {
      isRunning: vi.fn((id: string) => id === pluginId),
      getWorker: vi.fn(() => ({
        supportedMethods: [
          "environmentAcquireLease",
          "environmentResumeLease",
          "environmentReleaseLease",
          ...(options.supportsDestroy === false ? [] : ["environmentDestroyLease"]),
        ],
      })),
      call: vi.fn(async (_id: string, method: string, params: Record<string, any>) => {
        calls.push({ method, params });
        if (method === "environmentAcquireLease") {
          const providerLeaseId = `sandbox-${++allocation}`;
          return {
            providerLeaseId,
            metadata: { provider: "fake-plugin", image: "fake:test", timeoutMs: 1234, reuseLease: true, remoteCwd: "/workspace" },
          };
        }
        if (method === "environmentResumeLease") {
          return {
            providerLeaseId: params.providerLeaseId,
            metadata: { provider: "fake-plugin", image: "fake:test", timeoutMs: 1234, reuseLease: true, remoteCwd: "/workspace" },
          };
        }
        if (method === "environmentReleaseLease") return { providerLeaseId: params.providerLeaseId, state: "stopped" };
        if (method === "environmentDestroyLease") return { providerLeaseId: params.providerLeaseId, state: "destroyed" };
        throw new Error(`Unexpected plugin method: ${method}`);
      }),
    };
    const methodCalls = (method: string) => calls.filter((entry) => entry.method === method);
    return { manager: manager as unknown as PluginWorkerManager, calls, methodCalls };
  }

  /** One instance-level sandbox environment backed by a reuse-capable plugin provider. */
  async function seedSharedSandboxEnvironment() {
    const pluginId = randomUUID();
    const environmentId = randomUUID();
    const config = { provider: "fake-plugin", image: "fake:test", timeoutMs: 1234, reuseLease: true };
    await db.insert(plugins).values({
      id: pluginId,
      pluginKey: `acme.reusable-sandbox-${pluginId.slice(0, 8)}`,
      packageName: "@acme/reusable-sandbox-provider",
      version: "1.0.0",
      apiVersion: 1,
      categories: ["automation"],
      manifestJson: {
        id: `acme.reusable-sandbox-${pluginId.slice(0, 8)}`,
        apiVersion: 1,
        version: "1.0.0",
        displayName: "Reusable Sandbox Provider",
        description: "Test provider with reusable lease support",
        author: "Paperclip",
        categories: ["automation"],
        capabilities: ["environment.drivers.register"],
        entrypoints: { worker: "dist/worker.js" },
        environmentDrivers: [{
          driverKey: "fake-plugin",
          kind: "sandbox_provider",
          displayName: "Fake Plugin",
          supportsReusableLeases: true,
          configSchema: {
            type: "object",
            properties: { image: { type: "string" }, timeoutMs: { type: "number" }, reuseLease: { type: "boolean" } },
          },
        }],
      },
      status: "ready",
      installOrder: 1,
      updatedAt: new Date(),
    } as any);
    const [environment] = await db.insert(environments).values({
      id: environmentId,
      name: `managed-sandbox-${environmentId.slice(0, 8)}`,
      driver: "sandbox",
      status: "active",
      config,
    }).returning();
    return { pluginId, environment: environment! };
  }

  /** A company with one agent, one running heartbeat run, and one execution workspace. */
  async function seedTenant() {
    const companyId = randomUUID();
    const agentId = randomUUID();
    const projectId = randomUUID();
    const executionWorkspaceId = randomUUID();
    await db.insert(companies).values({ id: companyId, name: `Tenant ${companyId.slice(0, 6)}`, issuePrefix: `T${companyId.slice(0, 7)}` });
    await db.insert(agents).values({ id: agentId, companyId, name: "Coder", role: "engineer", status: "active", adapterType: "codex_local" });
    await db.insert(projects).values({ id: projectId, companyId, name: "Project", status: "active" });
    await db.insert(executionWorkspaces).values({
      id: executionWorkspaceId,
      companyId,
      projectId,
      mode: "shared_workspace",
      strategyType: "project_primary",
      name: "Workspace",
      status: "active",
      providerType: "local_fs",
    });
    const newRun = async () => {
      const runId = randomUUID();
      await db.insert(heartbeatRuns).values({ id: runId, companyId, agentId, invocationSource: "manual", status: "running" });
      return runId;
    };
    return { companyId, agentId, executionWorkspaceId, newRun };
  }

  function acquireFor(
    runtime: ReturnType<typeof environmentRuntimeService>,
    environment: typeof environments.$inferSelect,
    tenant: Awaited<ReturnType<typeof seedTenant>>,
    runId: string,
  ) {
    return runtime.acquireRunLease({
      companyId: tenant.companyId,
      environment: environment as never,
      issueId: null,
      agentId: tenant.agentId,
      heartbeatRunId: runId,
      persistedExecutionWorkspace: { id: tenant.executionWorkspaceId, mode: "shared_workspace" },
    });
  }

  it("acquires distinct provider sandboxes for concurrent runs of two companies", async () => {
    vi.stubEnv("SOCIALAGENT_SAAS_MODE", "true");
    const { pluginId, environment } = await seedSharedSandboxEnvironment();
    const worker = createRecordingSandboxWorker(pluginId);
    const runtime = environmentRuntimeService(db, { pluginWorkerManager: worker.manager });
    const tenantA = await seedTenant();
    const tenantB = await seedTenant();
    const [runA, runB] = [await tenantA.newRun(), await tenantB.newRun()];

    const [leaseA, leaseB] = await Promise.all([
      acquireFor(runtime, environment, tenantA, runA),
      acquireFor(runtime, environment, tenantB, runB),
    ]);

    expect(worker.methodCalls("environmentAcquireLease")).toHaveLength(2);
    expect(worker.methodCalls("environmentResumeLease")).toHaveLength(0);
    expect(leaseA.lease.providerLeaseId).toBeTruthy();
    expect(leaseB.lease.providerLeaseId).toBeTruthy();
    expect(leaseA.lease.providerLeaseId).not.toBe(leaseB.lease.providerLeaseId);
    expect(leaseA.lease.companyId).toBe(tenantA.companyId);
    expect(leaseB.lease.companyId).toBe(tenantB.companyId);
    expect(leaseA.lease.leasePolicy).toBe("ephemeral");
    expect(leaseB.lease.leasePolicy).toBe("ephemeral");
  });

  it("destroys a released SaaS lease instead of retaining it for reuse", async () => {
    vi.stubEnv("SOCIALAGENT_SAAS_MODE", "true");
    const { pluginId, environment } = await seedSharedSandboxEnvironment();
    const worker = createRecordingSandboxWorker(pluginId);
    const runtime = environmentRuntimeService(db, { pluginWorkerManager: worker.manager });
    const tenantA = await seedTenant();
    const tenantB = await seedTenant();
    const runA = await tenantA.newRun();

    const first = await acquireFor(runtime, environment, tenantA, runA);
    await runtime.releaseRunLeases(runA, "released");

    const destroyed = worker.methodCalls("environmentDestroyLease");
    expect(destroyed).toHaveLength(1);
    expect(destroyed[0]!.params.providerLeaseId).toBe(first.lease.providerLeaseId);
    expect(worker.methodCalls("environmentReleaseLease")).toHaveLength(0);
    const [releasedRow] = await db.select().from(environmentLeases).where(eq(environmentLeases.id, first.lease.id));
    expect(releasedRow!.status).not.toBe("retained");
    expect(releasedRow!.status).not.toBe("active");

    const runB = await tenantB.newRun();
    const second = await acquireFor(runtime, environment, tenantB, runB);
    expect(worker.methodCalls("environmentAcquireLease")).toHaveLength(2);
    expect(worker.methodCalls("environmentResumeLease")).toHaveLength(0);
    expect(second.lease.providerLeaseId).not.toBe(first.lease.providerLeaseId);
    expect(second.lease.companyId).toBe(tenantB.companyId);
  });

  it("forces the ephemeral policy in SaaS mode when the environment asks to retain", async () => {
    vi.stubEnv("SOCIALAGENT_SAAS_MODE", "true");
    const { pluginId, environment } = await seedSharedSandboxEnvironment();
    expect((environment.config as Record<string, unknown>).reuseLease).toBe(true);
    const worker = createRecordingSandboxWorker(pluginId);
    const runtime = environmentRuntimeService(db, { pluginWorkerManager: worker.manager });
    const tenant = await seedTenant();

    const firstRun = await tenant.newRun();
    const first = await acquireFor(runtime, environment, tenant, firstRun);
    expect(first.lease.leasePolicy).toBe("ephemeral");
    expect(first.lease.metadata?.reusableSandboxLease).toBeUndefined();
    await runtime.releaseRunLeases(firstRun, "released");

    // Even the same company's next run in the same workspace gets a new sandbox.
    const secondRun = await tenant.newRun();
    const second = await acquireFor(runtime, environment, tenant, secondRun);
    expect(second.lease.leasePolicy).toBe("ephemeral");
    expect(second.lease.providerLeaseId).not.toBe(first.lease.providerLeaseId);
    expect(worker.methodCalls("environmentResumeLease")).toHaveLength(0);
  });

  it("marks and warns when a SaaS sandbox lease falls back from destroy to release", async () => {
    vi.stubEnv("SOCIALAGENT_SAAS_MODE", "true");
    const warn = vi.spyOn(logger, "warn");
    const { pluginId, environment } = await seedSharedSandboxEnvironment();
    const worker = createRecordingSandboxWorker(pluginId, { supportsDestroy: false });
    const runtime = environmentRuntimeService(db, { pluginWorkerManager: worker.manager });
    const tenant = await seedTenant();
    const runId = await tenant.newRun();

    const acquired = await acquireFor(runtime, environment, tenant, runId);
    await runtime.releaseRunLeases(runId, "released");

    expect(worker.methodCalls("environmentDestroyLease")).toHaveLength(0);
    expect(worker.methodCalls("environmentReleaseLease")).toHaveLength(1);
    const [row] = await db.select().from(environmentLeases).where(eq(environmentLeases.id, acquired.lease.id));
    expect(row!.metadata).toMatchObject({ saasDestroyFallback: "release" });
    const fallbackWarnings = warn.mock.calls.filter(([, message]) => typeof message === "string" && message.includes("destroy"));
    expect(fallbackWarnings).toHaveLength(1);
    expect(fallbackWarnings[0]![0]).toMatchObject({ leaseId: acquired.lease.id, companyId: tenant.companyId });
    warn.mockRestore();
  });

  it("forces the ephemeral policy in SaaS mode for a warm plugin-driver environment", async () => {
    vi.stubEnv("SOCIALAGENT_SAAS_MODE", "true");
    const pluginId = randomUUID();
    const tenant = await seedTenant();
    const issueId = randomUUID();
    await db.insert(issues).values({ id: issueId, companyId: tenant.companyId, title: "Warm task", status: "in_progress", assigneeAgentId: tenant.agentId });
    await db.insert(plugins).values({
      id: pluginId,
      pluginKey: pluginId,
      packageName: "fixture-warm",
      version: "1.0.0",
      status: "ready",
      manifestJson: { capabilities: ["environment.drivers.register"], environmentDrivers: [{ driverKey: "tasks", supportsTasks: true, warmTaskVersion: 1 }] } as never,
    });
    const [environment] = await db.insert(environments).values({
      id: randomUUID(),
      name: `warm-${pluginId.slice(0, 8)}`,
      driver: "plugin",
      status: "active",
      config: { pluginKey: pluginId, driverKey: "tasks", driverConfig: {}, runnerLifecycleMode: "warm", runnerIdleTimeoutMs: 300000 },
    }).returning();
    const worker = createRecordingSandboxWorker(pluginId);
    const runtime = environmentRuntimeService(db, { pluginWorkerManager: worker.manager });
    const runId = await tenant.newRun();

    const acquired = await runtime.acquireRunLease({
      companyId: tenant.companyId,
      environment: environment as never,
      issueId,
      agentId: tenant.agentId,
      heartbeatRunId: runId,
      persistedExecutionWorkspace: null,
      adapterType: "paperclip_runner",
    });

    expect(acquired.lease.leasePolicy).toBe("ephemeral");
    expect(acquired.lease.metadata?.runnerTaskLifecyclePolicy).toMatchObject({ mode: "per_turn" });

    await runtime.releaseRunLeases(runId, "released");
    expect(worker.methodCalls("environmentDestroyLease")).toHaveLength(1);
    expect(worker.methodCalls("environmentReleaseLease")).toHaveLength(0);
  });

  it("marks the lease when a SaaS plugin-driver release cannot destroy", async () => {
    vi.stubEnv("SOCIALAGENT_SAAS_MODE", "true");
    const pluginId = randomUUID();
    const tenant = await seedTenant();
    const issueId = randomUUID();
    await db.insert(issues).values({ id: issueId, companyId: tenant.companyId, title: "Warm task", status: "in_progress", assigneeAgentId: tenant.agentId });
    await db.insert(plugins).values({
      id: pluginId,
      pluginKey: pluginId,
      packageName: "fixture-warm",
      version: "1.0.0",
      status: "ready",
      manifestJson: { capabilities: ["environment.drivers.register"], environmentDrivers: [{ driverKey: "tasks", supportsTasks: true, warmTaskVersion: 1 }] } as never,
    });
    const [environment] = await db.insert(environments).values({
      id: randomUUID(),
      name: `warm-${pluginId.slice(0, 8)}`,
      driver: "plugin",
      status: "active",
      config: { pluginKey: pluginId, driverKey: "tasks", driverConfig: {}, runnerLifecycleMode: "warm", runnerIdleTimeoutMs: 300000 },
    }).returning();
    const worker = createRecordingSandboxWorker(pluginId, { supportsDestroy: false });
    const runtime = environmentRuntimeService(db, { pluginWorkerManager: worker.manager });
    const runId = await tenant.newRun();

    const acquired = await runtime.acquireRunLease({
      companyId: tenant.companyId,
      environment: environment as never,
      issueId,
      agentId: tenant.agentId,
      heartbeatRunId: runId,
      persistedExecutionWorkspace: null,
      adapterType: "paperclip_runner",
    });

    expect(acquired.lease.leasePolicy).toBe("ephemeral");
    expect(acquired.lease.metadata?.runnerTaskLifecyclePolicy).toMatchObject({ mode: "per_turn" });

    await runtime.releaseRunLeases(runId, "released");
    expect(worker.methodCalls("environmentDestroyLease")).toHaveLength(0);
    expect(worker.methodCalls("environmentReleaseLease")).toHaveLength(1);
    const [row] = await db.select().from(environmentLeases).where(eq(environmentLeases.id, acquired.lease.id));
    expect(row!.metadata).toMatchObject({ saasDestroyFallback: "release", pluginLeaseCleanupMethod: "release" });
  });

  it("never resumes a reusable lease owned by another company, even outside SaaS mode", async () => {
    vi.stubEnv("SOCIALAGENT_SAAS_MODE", "false");
    const { pluginId, environment } = await seedSharedSandboxEnvironment();
    const worker = createRecordingSandboxWorker(pluginId);
    const runtime = environmentRuntimeService(db, { pluginWorkerManager: worker.manager });
    const tenantA = await seedTenant();
    const tenantB = await seedTenant();

    // Company A leaves a genuine reusable lease behind.
    const firstRun = await tenantA.newRun();
    const first = await acquireFor(runtime, environment, tenantA, firstRun);
    expect(first.lease.leasePolicy).toBe("reuse_by_environment");
    await runtime.releaseRunLeases(firstRun, "released");

    // The row now claims to belong to company B while every other scope field
    // still matches company A's next run.
    await db.update(environmentLeases)
      .set({ companyId: tenantB.companyId })
      .where(eq(environmentLeases.id, first.lease.id));

    const secondRun = await tenantA.newRun();
    const second = await acquireFor(runtime, environment, tenantA, secondRun);

    expect(worker.methodCalls("environmentResumeLease")).toHaveLength(0);
    expect(worker.methodCalls("environmentDestroyLease")).toHaveLength(0);
    expect(worker.methodCalls("environmentAcquireLease")).toHaveLength(2);
    expect(second.lease.providerLeaseId).not.toBe(first.lease.providerLeaseId);
    expect(second.lease.companyId).toBe(tenantA.companyId);
    const [foreignRow] = await db.select().from(environmentLeases).where(eq(environmentLeases.id, first.lease.id));
    expect(foreignRow).toMatchObject({ companyId: tenantB.companyId, status: "released" });
  });

  it("still resumes a company's own reusable lease outside SaaS mode", async () => {
    vi.stubEnv("SOCIALAGENT_SAAS_MODE", "false");
    const { pluginId, environment } = await seedSharedSandboxEnvironment();
    const worker = createRecordingSandboxWorker(pluginId);
    const runtime = environmentRuntimeService(db, { pluginWorkerManager: worker.manager });
    const tenant = await seedTenant();

    const firstRun = await tenant.newRun();
    const first = await acquireFor(runtime, environment, tenant, firstRun);
    await runtime.releaseRunLeases(firstRun, "released");
    const secondRun = await tenant.newRun();
    const second = await acquireFor(runtime, environment, tenant, secondRun);

    expect(worker.methodCalls("environmentResumeLease")).toHaveLength(1);
    expect(second.lease.providerLeaseId).toBe(first.lease.providerLeaseId);
  });
});
