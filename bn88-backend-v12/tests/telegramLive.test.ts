import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { handleLiveStart, handleLiveQna, handleLivePoll } from "../src/routes/admin/telegramLive";

const testDbPath = path.join(__dirname, "tmp", "telegramLive.test.db");
const testDbUrl = `file:${testDbPath}`;
process.env.DATABASE_URL = testDbUrl;
process.env.SECRET_ENC_KEY_BN9 = process.env.SECRET_ENC_KEY_BN9 || "12345678901234567890123456789012";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt";

const prisma = new PrismaClient({ datasources: { db: { url: testDbUrl } } });

function resetDb() {
  fs.mkdirSync(path.dirname(testDbPath), { recursive: true });
  execSync("npx prisma db push --force-reset --skip-generate --schema prisma/schema.prisma", {
    env: { ...process.env, DATABASE_URL: testDbUrl },
    stdio: "inherit",
  });
}

function mockRes() {
  const res: any = {};
  res.statusCode = 200;
  res.status = (code: number) => {
    res.statusCode = code;
    return res;
  };
  res.jsonBody = null;
  res.json = (body: any) => {
    res.jsonBody = body;
    return res;
  };
  return res;
}

async function main() {
  resetDb();
  // stub fetch
  (globalThis as any).fetch = async () => ({ ok: true, text: async () => "" });

  // start live
  const startReq: any = { body: { channelId: "-1001", title: "Townhall" } };
  const startRes = mockRes();
  await handleLiveStart(startReq, startRes);
  assert.equal(startRes.statusCode, 200);
  const streamId = startRes.jsonBody.stream.id;

  // add question
  const qRes = mockRes();
  await handleLiveQna({ body: { liveStreamId: streamId, question: "When launch?" } }, qRes);
  assert.equal(qRes.statusCode, 200);
  const questions = await prisma.liveQuestion.findMany({ where: { liveStreamId: streamId } });
  assert.equal(questions.length, 1);

  // add poll
  const pRes = mockRes();
  await handleLivePoll({ body: { liveStreamId: streamId, question: "Vote", options: ["A", "B"] } }, pRes);
  assert.equal(pRes.statusCode, 200);
  const polls = await prisma.livePoll.findMany({ where: { liveStreamId: streamId } });
  assert.equal(polls.length, 1);

  console.log("telegram live tests passed", { streamId, questions: questions.length, polls: polls.length });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
