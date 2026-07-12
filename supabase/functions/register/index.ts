import { serve } from "https://deno.land/std@0.203.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import bcrypt from "https://esm.sh/bcryptjs@2.4.3";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { username, password, phone, email, full_name } = await req.json();

    if (!username || !password || !phone) {
      return new Response(
        JSON.stringify({ error: "Username, password, and phone are required." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (password.length < 6) {
      return new Response(
        JSON.stringify({ error: "Password must be at least 6 characters." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: existingUsername } = await supabaseAdmin
      .from("ekiti_users")
      .select("id")
      .eq("username", username)
      .maybeSingle();

    if (existingUsername) {
      return new Response(
        JSON.stringify({ error: "Username is already taken." }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: existingPhone } = await supabaseAdmin
      .from("ekiti_users")
      .select("id")
      .eq("phone", phone)
      .maybeSingle();

    if (existingPhone) {
      return new Response(
        JSON.stringify({ error: "Phone number is already registered." }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const { data: newUser, error: insertError } = await supabaseAdmin
      .from("ekiti_users")
      .insert({
        username,
        password: passwordHash,
        phone: phone.trim(),
        email: email ?? null,
        full_name: full_name ?? null,
        role: "citizen",
        lga: null,
        department_id: null,
      })
      .select("id, username, phone, email, full_name, role, lga, department_id, created_at")
      .single();

    if (insertError) {
      return new Response(
        JSON.stringify({ error: insertError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ message: "Registration successful.", user: newUser }),
      { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Unexpected error", details: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});