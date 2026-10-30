import request from "supertest";
import { expect, it } from "vitest";
import { creditRoutes } from "../routes/credits.js";
import { describeEmbeddedPostgres, routeApp, seedCompanyWithBoardAccess, useEmbeddedPostgres } from "./helpers/route-test-harness.js";

describeEmbeddedPostgres("credit routes", () => {
  const ctx = useEmbeddedPostgres("credit-routes");
  it("restricts settings to instance admins and balances to the company", async () => {
    const first = await seedCompanyWithBoardAccess(ctx.db, "Credit organization");
    const other = await seedCompanyWithBoardAccess(ctx.db, "Other organization");
    const member = routeApp(ctx.db, first.actor, creditRoutes);
    expect((await request(member).get(`/api/companies/${first.companyId}/credits`)).status).toBe(200);
    expect((await request(member).get(`/api/companies/${other.companyId}/credits`)).status).toBe(403);
    expect((await request(member).put("/api/instance/settings/credits").send({ allowance: 1000, input: 1, cachedInput: 0.1, output: 5 })).status).toBe(403);
    const admin = routeApp(ctx.db, { ...first.actor, isInstanceAdmin: true }, creditRoutes);
    expect((await request(admin).put("/api/instance/settings/credits").send({ allowance: 1000, input: 1, cachedInput: 0.1, output: 5 })).status).toBe(200);
    expect((await request(admin).put(`/api/instance/companies/${first.companyId}/credits`).send({ allowance: 2500, input: 2, cachedInput: 0.2, output: 5 })).status).toBe(200);
    expect((await request(member).get(`/api/companies/${first.companyId}/credits`)).body.allowanceMicrounits).toBe("2500000000");
    expect((await request(member).get(`/api/instance/companies/${first.companyId}/credits`)).status).toBe(403);
    expect((await request(admin).get(`/api/instance/companies/${first.companyId}/credits`)).body.override).toBe(true);
    expect((await request(admin).delete(`/api/instance/companies/${first.companyId}/credits`)).status).toBe(204);
    expect((await request(member).get(`/api/companies/${first.companyId}/credits`)).body.allowanceMicrounits).toBe("1000000000");
  });
});
