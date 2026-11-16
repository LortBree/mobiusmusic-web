const MAX_BODY_BYTES = 32 * 1024;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function sanitizeId(value) {
  return String(value || "unknown")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 16) || "unknown";
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const rawText = await request.text();
    const byteLen = new TextEncoder().encode(rawText).byteLength;
    if (byteLen === 0) {
      return jsonResponse({ error: "Empty request body" }, 400);
    }
    if (byteLen > MAX_BODY_BYTES) {
      return jsonResponse({ error: "Payload exceeds 32 KB limit" }, 413);
    }

    const contentType = (request.headers.get("content-type") || "").toLowerCase();
    let report;
    let formEmail = "";
    let formSymptom = "";

    if (contentType.includes("application/x-www-form-urlencoded")) {
      const form = new URLSearchParams(rawText);
      formSymptom = form.get("symptom") || "";
      formEmail = form.get("email") || "";
      const dacJsonText = form.get("dac_json") || "";
      report = JSON.parse(dacJsonText);
    } else {
      const parsed = JSON.parse(rawText);
      if (parsed && typeof parsed.dac_json === "string") {
        formSymptom = parsed.symptom || "";
        formEmail = parsed.email || "";
        report = JSON.parse(parsed.dac_json);
      } else {
        report = parsed;
      }
    }

    const device = report?.device;
    const topology = report?.topology;
    if (!device || !device.vid || !device.pid || !topology) {
      return jsonResponse(
        { error: "Missing required fields: device.vid, device.pid, or topology" },
        400
      );
    }

    if (formSymptom || formEmail) {
      report.diagnostic = report.diagnostic || {};
      if (formSymptom) report.diagnostic.symptom = formSymptom;
      if (formEmail) report.diagnostic.reporter_email = formEmail;
    }

    if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
      return jsonResponse(
        { error: "Telegram relay is not configured on the server" },
        503
      );
    }

    const vid = sanitizeId(device.vid);
    const pid = sanitizeId(device.pid);
    const dacName = String(device.name || "Unknown USB DAC").slice(0, 80);
    const protocol = String(topology.protocol || "unknown");
    const symptom = String(report.diagnostic?.symptom || "unspecified");
    const fallback = String(report.diagnostic?.fallback_reason || "none");

    const captionLines = [
      `Mobius DAC Profile Dump`,
      `Device: ${dacName} (${vid}:${pid})`,
      `Protocol: ${protocol} | Alts: ${Array.isArray(topology.alt_profiles) ? topology.alt_profiles.length : 0}`,
      `Symptom: ${symptom}`,
      `Fallback: ${fallback}`,
    ];
    if (formEmail) {
      captionLines.push(`Contact: ${String(formEmail).slice(0, 80)}`);
    }

    const prettyJson = JSON.stringify(report, null, 2);
    const fileBlob = new Blob([prettyJson], { type: "application/json" });
    const formData = new FormData();
    formData.append("chat_id", env.TELEGRAM_CHAT_ID);
    formData.append("document", fileBlob, `mobius-dac-${vid}-${pid}.json`);
    formData.append("caption", captionLines.join("\n").slice(0, 1024));

    const tgResp = await fetch(
      `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendDocument`,
      { method: "POST", body: formData }
    );
    const tgJson = await tgResp.json();
    if (!tgResp.ok || !tgJson.ok) {
      return jsonResponse({ error: "Telegram delivery failed" }, 502);
    }

    return jsonResponse({
      success: true,
      device: `${vid}:${pid}`,
      message: "DAC profile dump submitted to Mobius Support.",
    });
  } catch (err) {
    return jsonResponse(
      { error: err instanceof SyntaxError ? "Invalid JSON payload" : "Server error" },
      err instanceof SyntaxError ? 400 : 500
    );
  }
}
