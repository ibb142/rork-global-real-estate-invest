const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  const authHeader = event.headers.authorization || event.headers.Authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({ error: "Missing or invalid Authorization header" }),
    };
  }

  const userToken = authHeader.replace("Bearer ", "");

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error("[generate-upload-token] Missing SUPABASE env vars");
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Server misconfigured — missing Supabase credentials" }),
    };
  }

  let userId;
  try {
    const verifyRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${userToken}`,
        apikey: SUPABASE_SERVICE_KEY,
      },
    });

    if (!verifyRes.ok) {
      const errText = await verifyRes.text();
      console.error("[generate-upload-token] Auth verify failed:", verifyRes.status, errText);
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: "Invalid or expired token" }),
      };
    }

    const userData = await verifyRes.json();
    userId = userData.id;

    if (!userId) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: "Could not resolve user ID from token" }),
      };
    }
  } catch (err) {
    console.error("[generate-upload-token] Auth error:", err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Authentication verification failed" }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: "Invalid JSON body" }),
    };
  }

  const bucket = body.bucket || "private-uploads";
  const expiresIn = Math.min(Math.max(body.expires || 60, 10), 3600);

  let filePath = body.path;
  if (!filePath) {
    const ext = body.extension || "jpg";
    const ts = Date.now();
    filePath = `${userId}/${ts}.${ext}`;
  }

  if (!filePath.startsWith(`${userId}/`)) {
    return {
      statusCode: 403,
      headers,
      body: JSON.stringify({
        error: "Forbidden — path must start with your user ID",
      }),
    };
  }

  try {
    const signRes = await fetch(
      `${SUPABASE_URL}/storage/v1/object/upload/sign/${bucket}/${filePath}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
          apikey: SUPABASE_SERVICE_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ expiresIn }),
      }
    );

    if (!signRes.ok) {
      const errText = await signRes.text();
      console.error("[generate-upload-token] Sign failed:", signRes.status, errText);
      return {
        statusCode: signRes.status,
        headers,
        body: JSON.stringify({
          error: "Failed to generate signed upload URL",
          detail: errText,
        }),
      };
    }

    const signData = await signRes.json();

    const signedUploadUrl = signData.url
      ? `${SUPABASE_URL}/storage/v1${signData.url}`
      : signData.signedURL || signData.signed_url || null;

    if (!signedUploadUrl) {
      console.error("[generate-upload-token] No URL in sign response:", JSON.stringify(signData));
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: "Unexpected response from storage sign API" }),
      };
    }

    console.log(`[generate-upload-token] Signed URL generated for ${bucket}/${filePath} (user: ${userId})`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        signed_upload_url: signedUploadUrl,
        path: filePath,
        expires_in: expiresIn,
      }),
    };
  } catch (err) {
    console.error("[generate-upload-token] Storage error:", err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Internal error generating upload token" }),
    };
  }
};
