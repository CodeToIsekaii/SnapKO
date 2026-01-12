import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

function loadEnv(filePath: string) {
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf8");
      content.split(/\r?\n/).forEach((line) => {
        const cleanLine = line.trim();
        if (cleanLine && !cleanLine.startsWith("#")) {
          const parts = cleanLine.split("=");
          if (parts.length >= 2) {
            const key = parts[0].trim();
            const value = parts
              .slice(1)
              .join("=")
              .trim()
              .replace(/^['"]|['"]$/g, "");
            process.env[key] = value;
          }
        }
      });
    }
  } catch (e) {}
}

loadEnv(path.resolve(process.cwd(), ".env"));
loadEnv(path.resolve(process.cwd(), ".env.local"));

async function check() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.error("Missing env vars");
    return;
  }

  const supabase = createClient(url, key);

  const { data: user, error: userError } =
    await supabase.auth.admin.listUsers();
  const adminUser = user?.users.find((u) => u.email === "admin@snapko.vn");

  if (!adminUser) {
    console.log("Admin user NOT FOUND in auth.users");
    return;
  }

  console.log("Found Admin User ID:", adminUser.id);

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", adminUser.id)
    .single();

  if (profileError) {
    console.error("Profile fetch error:", profileError);
  } else {
    console.log("Admin Profile:", profile);
  }
}

check();
