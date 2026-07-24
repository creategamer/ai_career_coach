"use server";

import { db } from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

const geminiApiKey = process.env.GEMINI_API_KEY;
const genAI = geminiApiKey ? new GoogleGenerativeAI(geminiApiKey) : null;
const model = genAI ? genAI.getGenerativeModel({ model: "gemini-2.0-flash" }) : null;

export const generateAIInsights = async (industry) => {
    const prompt = `
    Analyze the current state of the ${industry} industry and provide insights in ONLY the following JSON format without any additional notes or explanations:
    {
      "salaryRanges": [
        { "role": "string", "min": number, "max": number, "median": number, "location": "string" }
      ],
      "growthRate": number,
      "demandLevel": "High" | "Medium" | "Low",
      "topSkills": ["skill1", "skill2"],
      "marketOutlook": "Positive" | "Neutral" | "Negative",
      "keyTrends": ["trend1", "trend2"],
      "recommendedSkills": ["skill1", "skill2"]
    }
    
    IMPORTANT: Return ONLY the JSON. No additional text, notes, or markdown formatting.
    Include at least 5 common roles for salary ranges.
    Growth rate should be a percentage.
    Include at least 5 skills and trends.
  `;

    if (!model) {
      throw new Error("GEMINI_API_KEY is not configured.");
    }

    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();
    const cleanedText = text.replace(/```(?:json)?\n?/g, "").trim();

    return JSON.parse(cleanedText);
};

export async function getIndustryInsights() {
    const { userId } = await auth();
    if (!userId) throw new Error("Unauthorized");
  
    const user = await db.user.findUnique({
      where: { clerkUserId: userId },
      include: {
        industryInsight: true,
      },
    });
  
    if (!user) throw new Error("User not found");
  
    // If no insights exist, generate them
    if (!user.industryInsight) {
      let insights;

      try {
        insights = await generateAIInsights(user.industry);
      } catch (error) {
        console.warn("Falling back to default industry insights:", error);
        insights = {
          salaryRanges: [
            { role: "Software Engineer", min: 90000, max: 160000, median: 125000, location: "Remote" },
            { role: "Product Manager", min: 100000, max: 180000, median: 140000, location: "Remote" },
            { role: "Data Analyst", min: 70000, max: 130000, median: 100000, location: "Remote" },
            { role: "Designer", min: 75000, max: 140000, median: 110000, location: "Remote" },
            { role: "Operations Lead", min: 80000, max: 150000, median: 115000, location: "Remote" }
          ],
          growthRate: 8.5,
          demandLevel: "High",
          topSkills: ["Problem Solving", "Communication", "Adaptability", "Technical Expertise"],
          marketOutlook: "Positive",
          keyTrends: ["Remote collaboration", "Automation", "AI adoption"],
          recommendedSkills: ["Data literacy", "Cross-functional collaboration", "Continuous learning"]
        };
      }
  
      const industryInsight = await db.industryInsight.create({
        data: {
          industry: user.industry,
          ...insights,
          nextUpdate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });
  
      return industryInsight;
    }
  
    return user.industryInsight;
  }