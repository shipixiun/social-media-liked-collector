import assert from "node:assert/strict";
import test from "node:test";

import { findArtifactTool } from "../scripts/link-artifact-tool.mjs";

test("findArtifactTool returns the first existing Codex runtime candidate", async () => {
  const candidates = ["missing", "existing", "later"];
  const selected = await findArtifactTool(candidates, async (candidate) => {
    if (candidate === "existing") return;
    throw Object.assign(new Error("missing"), { code: "ENOENT" });
  });
  assert.equal(selected, "existing");
});

test("findArtifactTool throws a setup hint when no candidate exists", async () => {
  await assert.rejects(
    () =>
      findArtifactTool(["missing"], async () => {
        throw Object.assign(new Error("missing"), { code: "ENOENT" });
      }),
    /未找到 Codex 工作区的 @oai\/artifact-tool/,
  );
});
