import assert from "node:assert/strict";
import type { Request, Response, NextFunction } from "express";
import { requirePermission } from "../src/middleware/basicAuth";

function createRes() {
  const res: Partial<Response> & { statusCode?: number; body?: any } = {};
  res.status = function (code: number) {
    res.statusCode = code;
    return res as Response;
  } as Response["status"];
  res.json = function (payload: any) {
    res.body = payload;
    return res as Response;
  } as Response["json"];
  return res as Response & { statusCode?: number; body?: any };
}

async function runMiddleware(
  middleware: (req: Request, res: Response, next: NextFunction) => Promise<any> | void,
  req: Partial<Request>
) {
  const res = createRes();
  let nextCalled = false;
  await middleware(req as Request, res as Response, () => {
    nextCalled = true;
  });
  return { res, nextCalled };
}

async function testAdminRoleAllowsAll() {
  const mw = requirePermission(["manageBots"]);
  const { nextCalled, res } = await runMiddleware(mw, {
    admin: { id: "admin-1", email: "root@example.com", roles: ["Admin"] },
  });
  assert.equal(nextCalled, true, "Admin role should pass");
  assert.equal(res.statusCode ?? 200, 200);
}

async function testEditorAllowsCampaigns() {
  const mw = requirePermission(["manageCampaigns"]);
  const { nextCalled, res } = await runMiddleware(mw, {
    admin: { id: "editor-1", email: "editor@example.com", roles: ["Editor"] },
  });
  assert.equal(nextCalled, true, "Editor should pass for campaigns");
  assert.equal(res.statusCode ?? 200, 200);
}

async function testViewerDeniedForManage() {
  const mw = requirePermission(["manageCampaigns"]);
  const { nextCalled, res } = await runMiddleware(mw, {
    admin: { id: "viewer-1", email: "viewer@example.com", roles: ["Viewer"] },
  });
  assert.equal(nextCalled, false, "Viewer should not pass manageCampaigns");
  assert.equal(res.statusCode, 403);
  assert.equal(res.body?.message, "forbidden");
}

async function testUnauthorizedWithoutAdmin() {
  const mw = requirePermission(["manageBots"]);
  const { nextCalled, res } = await runMiddleware(mw, {});
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
}

async function run() {
  await testAdminRoleAllowsAll();
  await testEditorAllowsCampaigns();
  await testViewerDeniedForManage();
  await testUnauthorizedWithoutAdmin();
  console.log("rbac tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
