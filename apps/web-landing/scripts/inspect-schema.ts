import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function inspect() {
  // Check subscription_plans columns
  const { data: plans, error } = await supabase
    .from("subscription_plans")
    .select("*")
    .limit(1);

  console.log("Plans Sample:", plans?.[0]);
  console.log("Plans Error:", error);

  // Check businesses columns
  const { data: businesses } = await supabase
    .from("businesses")
    .select("*")
    .limit(1);

  console.log("Businesses Sample:", businesses?.[0]);
}

inspect();
