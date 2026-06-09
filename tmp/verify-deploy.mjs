const RKEY = "rnd_1H0XCquMZQTRyAnHgbEv8dVWYPVs";
const OWNER = "b8d6f01528fe515ead5390d3c408ea79b2b34c3f39eefebc004efdc02734284b";
const SID = "srv-d7t9ivreo5us73ftose0";
const DEP = "dep-d8ip74nlk1mc738edu40";
const API = "https://api.ivxholding.com";

async function j(url, opts) {
  const r = await fetch(url, opts);
  let body = null;
  try { body = await r.json(); } catch { body = await r.text().catch(() => null); }
  return { status: r.status, body };
}

async function pollDeploy() {
  for (let i = 0; i < 12; i++) {
    const r = await j(`https://api.render.com/v1/services/${SID}/deploys/${DEP}`, {
      headers: { Authorization: `Bearer ${RKEY}`, Accept: "application/json" },
    });
    const status = r.body?.status ?? "?";
    console.log(`deploy poll ${i + 1}: ${status}`);
    if (["live", "build_failed", "update_failed", "canceled", "deactivated"].includes(status)) return status;
    await new Promise((res) => setTimeout(res, 8000));
  }
  return "timeout";
}

(async () => {
  const final = await pollDeploy();
  console.log("FINAL DEPLOY STATUS:", final);

  const health = await j(`${API}/health`);
  console.log("HEALTH commit:", health.body?.commitShort, "| marker:", health.body?.deploymentMarker, "| boot:", health.body?.bootTime);

  // owner-gated route checks (no-token vs owner token)
  const routes = [
    "/api/ivx/capabilities",
    "/api/ivx/readiness",
    "/api/ivx/continuous-improvement/safe-fixes",
    "/api/ivx/scheduler",
  ];
  for (const path of routes) {
    const noTok = await j(`${API}${path}`);
    const withTok = await j(`${API}${path}`, { headers: { Authorization: `Bearer ${OWNER}` } });
    console.log(`${path} -> no-token ${noTok.status} | owner ${withTok.status}`);
  }

  // run autonomous lifecycle live (the real "do the work" proof)
  const run = await j(`${API}/api/ivx/autonomous-mode/run`, {
    method: "POST",
    headers: { Authorization: `Bearer ${OWNER}`, "Content-Type": "application/json" },
    body: JSON.stringify({ task: "Verify autonomous lifecycle end-to-end and return proof" }),
  });
  console.log("AUTONOMOUS RUN status:", run.status,
    "| finalStatus:", run.body?.report?.finalStatus ?? run.body?.finalStatus,
    "| classification:", run.body?.report?.classification ?? run.body?.classification,
    "| traceId:", run.body?.report?.executionTraceId ?? run.body?.executionTraceId);
})();
