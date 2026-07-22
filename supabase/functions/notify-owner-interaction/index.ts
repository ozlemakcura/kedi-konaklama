import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const reactions: Record<string, string> = {
  heart: "❤️",
  love: "😍",
  aww: "🥹",
  like: "👍",
};

function encodeTarget(value: string): string {
  return encodeURIComponent(String(value || ""));
}

function interactionMessage(target: string, type: string, value = ""): string {
  if (type === "reaction") return `[[care:${encodeTarget(target)}]][[reaction:${value}]]`;
  return `[[care:${encodeTarget(target)}]][[reply]]${value}`;
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const notifyFromEmail = Deno.env.get("NOTIFY_FROM_EMAIL") || "Pati Evi <onboarding@resend.dev>";
  const notifyToOverride = Deno.env.get("NOTIFY_TO_EMAIL") || "";

  if (!supabaseUrl || !serviceRoleKey || !resendApiKey) {
    return json({ error: "E-posta servisi yapılandırılmamış." }, 500);
  }

  let payload: {
    token?: string;
    target?: string;
    type?: "reaction" | "reply";
    value?: string;
  };

  try {
    payload = await request.json();
  } catch {
    return json({ error: "Geçersiz istek." }, 400);
  }

  const token = String(payload.token || "").trim();
  const target = String(payload.target || "").trim();
  const type = payload.type;
  const value = String(payload.value || "").trim();

  if (!token || !target || !type || !["reaction", "reply"].includes(type)) {
    return json({ error: "Eksik bildirim bilgisi." }, 400);
  }
  if (type === "reaction" && !reactions[value]) {
    return json({ error: "Geçersiz tepki." }, 400);
  }
  if (type === "reply" && (!value || value.length > 1200)) {
    return json({ error: "Yanıt metni geçersiz." }, 400);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: cat, error: catError } = await admin
    .from("cats")
    .select("id,user_id,name,owner_name")
    .eq("public_token", token)
    .maybeSingle();

  if (catError || !cat) return json({ error: "Sahip bağlantısı doğrulanamadı." }, 404);

  const expectedMessage = interactionMessage(target, type, value);
  const recentThreshold = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { data: ownerNote, error: noteError } = await admin
    .from("owner_notes")
    .select("id,owner_name,message,created_at")
    .eq("cat_id", cat.id)
    .eq("message", expectedMessage)
    .gte("created_at", recentThreshold)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (noteError || !ownerNote) {
    return json({ error: "Kaydedilmiş tepki veya yanıt bulunamadı." }, 404);
  }

  let recipient = notifyToOverride;
  if (!recipient) {
    const { data: userData, error: userError } = await admin.auth.admin.getUserById(cat.user_id);
    if (userError || !userData.user?.email) {
      return json({ error: "Bildirim e-posta adresi bulunamadı." }, 404);
    }
    recipient = userData.user.email;
  }

  const ownerName = ownerNote.owner_name || cat.owner_name || "Sahip";
  const emoji = type === "reaction" ? reactions[value] : "💬";
  const subject = type === "reaction"
    ? `${cat.name} için yeni tepki ${emoji}`
    : `${cat.name} için yeni yanıt 💬`;
  const detail = type === "reaction"
    ? `${escapeHtml(ownerName)}, günlük bakım notuna ${emoji} tepkisi verdi.`
    : `<strong>${escapeHtml(ownerName)}:</strong><br>${escapeHtml(value).replaceAll("\n", "<br>")}`;
  const adminUrl = "https://ozlemakcura.github.io/kedi-konaklama/";

  const emailResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${resendApiKey}`,
      "Idempotency-Key": `owner-interaction-${ownerNote.id}`,
    },
    body: JSON.stringify({
      from: notifyFromEmail,
      to: [recipient],
      subject,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#20183a">
          <div style="padding:22px;border-radius:18px;background:linear-gradient(135deg,#6d28d9,#db2777);color:white">
            <div style="font-size:30px">${emoji}</div>
            <h1 style="font-size:22px;margin:10px 0 4px">${escapeHtml(cat.name)} için yeni bildirim</h1>
            <p style="margin:0;opacity:.9">Kedi konaklama günlüğü</p>
          </div>
          <div style="padding:22px;border:1px solid #e8defc;border-radius:18px;margin-top:14px">
            <p style="font-size:16px;line-height:1.6">${detail}</p>
            <p style="color:#6b6480;font-size:13px">İlgili günlük not: ${escapeHtml(new Date(target).toLocaleString("tr-TR"))}</p>
            <a href="${adminUrl}" style="display:inline-block;margin-top:10px;padding:11px 16px;border-radius:12px;background:#6d28d9;color:white;text-decoration:none;font-weight:bold">Yönetim panelini aç</a>
          </div>
        </div>
      `,
    }),
  });

  const emailResult = await emailResponse.json().catch(() => ({}));
  if (!emailResponse.ok) {
    console.error("Resend error", emailResult);
    return json({ error: "E-posta gönderilemedi.", details: emailResult }, 502);
  }

  return json({ ok: true, emailId: emailResult.id });
});
