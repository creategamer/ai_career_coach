import { serve } from "inngest/next";

import { inngest } from "@/lib/inngest/client";
import { generateIndustryInsights, helloWorld } from "@/lib/inngest/function";

export const { GET, POST, PUT } = serve({
  client: inngest,
  // functions: [
  //   helloWorld, // <-- This is where you'll always add all your functions
  // ],
  functions: [generateIndustryInsights],
});