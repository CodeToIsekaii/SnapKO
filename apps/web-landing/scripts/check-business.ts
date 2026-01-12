import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "path";

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing Supabase environment variables");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkBusiness() {
  const businessId = "3c7ff01f-167c-403c-9dc3-a986202779db";

  console.log(`Checking business: ${businessId}`);

  // 1. Get Business Details
  const { data: business, error: bizError } = await supabase
    .from("businesses")
    .select("*")
    .eq("id", businessId)
    .single();

  if (bizError) {
    console.error("Error fetching business:", bizError);
  } else {
    console.log("Business Data:", business);
  }

  // 2. Get Subscription History
  const { data: history, error: histError } = await supabase
    .from("subscription_history")
    .select("*")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false });

  if (histError) {
    console.error("Error fetching history:", histError);
  } else {
    console.log("Subscription History:", history);
  }

  // 3. Get All Plans
  const { data: plans, error: plansError } = await supabase
    .from("subscription_plans")
    .select("*");

  if (plansError) {
    console.error("Error fetching plans:", plansError);
  } else {
    console.log(
      "Available Plans:",
      plans.map((p) => ({
        id: p.id,
        name: p.name,
        price: p.price,
        tier: p.target_tier,
      }))
    );
  }
}

checkBusiness();
