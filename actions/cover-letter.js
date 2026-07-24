"use server";

import { db } from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

const geminiApiKey = process.env.GEMINI_API_KEY;

const genAI = geminiApiKey ? new GoogleGenerativeAI(geminiApiKey) : null;
const model = genAI ? genAI.getGenerativeModel({ model: "gemini-2.0-flash" }) : null;

function buildFallbackCoverLetter({ data, user }) {
  const fullName = user?.name || "Your Name";
  const companyName = data?.companyName || "the company";
  const jobTitle = data?.jobTitle || "the role";
  const industry = user?.industry || "your field";
  const experience = user?.experience ? `${user.experience} years` : "relevant experience";
  const skills = user?.skills?.length ? user.skills.join(", ") : "relevant professional skills";
  const bio = user?.bio || "I bring a strong background and a commitment to delivering results.";

  return `Dear Hiring Manager,

I am excited to apply for the ${jobTitle} position at ${companyName}. With ${experience} in ${industry} and experience in ${skills}, I am confident in my ability to contribute meaningfully to your team.

${bio}

I am especially drawn to ${companyName} because of the opportunity to contribute to your work and grow in a dynamic environment. I would welcome the opportunity to discuss how my background, skills, and enthusiasm can support your team’s goals.

Sincerely,
${fullName}`;
}

export async function generateCoverLetter(data) {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const user = await db.user.findUnique({
    where: { clerkUserId: userId },
  });

  if (!user) throw new Error("User not found");

  const prompt = `
    Write a professional cover letter for a ${data.jobTitle} position at ${
    data.companyName
  }.
    
    About the candidate:
    - Industry: ${user.industry}
    - Years of Experience: ${user.experience}
    - Skills: ${user.skills?.join(", ")}
    - Professional Background: ${user.bio}
    
    Job Description:
    ${data.jobDescription}
    
    Requirements:
    1. Use a professional, enthusiastic tone
    2. Highlight relevant skills and experience
    3. Show understanding of the company's needs
    4. Keep it concise (max 400 words)
    5. Use proper business letter formatting in markdown
    6. Include specific examples of achievements
    7. Relate candidate's background to job requirements
    
    Format the letter in markdown.
  `;

  let content = buildFallbackCoverLetter({ data, user });

  try {
    if (!model) {
      throw new Error("GEMINI_API_KEY is not configured.");
    }

    const result = await model.generateContent(prompt);
    content = result.response.text().trim();
  } catch (error) {
    console.warn("Falling back to a template cover letter:", error);
  }

  try {
    const coverLetter = await db.coverLetter.create({
      data: {
        content,
        jobDescription: data.jobDescription,
        companyName: data.companyName,
        jobTitle: data.jobTitle,
        status: "completed",
        userId: user.id,
      },
    });

    return coverLetter;
  } catch (error) {
    console.error("Error generating cover letter:", error);

    if (error?.status === 429 || error?.message?.includes("429") || error?.message?.includes("quota")) {
      throw new Error("The Gemini API quota has been exceeded. Please try again in a moment.");
    }

    if (error?.message?.includes("API key")) {
      throw new Error("The Gemini API key is invalid or not configured.");
    }

    throw new Error(error.message || "Failed to generate cover letter");
  }
}

export async function getCoverLetters() {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const user = await db.user.findUnique({
    where: { clerkUserId: userId },
  });

  if (!user) throw new Error("User not found");

  return await db.coverLetter.findMany({
    where: {
      userId: user.id,
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}

export async function getCoverLetter(id) {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const user = await db.user.findUnique({
    where: { clerkUserId: userId },
  });

  if (!user) throw new Error("User not found");

  return await db.coverLetter.findUnique({
    where: {
      id,
      userId: user.id,
    },
  });
}

export async function deleteCoverLetter(id) {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const user = await db.user.findUnique({
    where: { clerkUserId: userId },
  });

  if (!user) throw new Error("User not found");

  return await db.coverLetter.delete({
    where: {
      id,
      userId: user.id,
    },
  });
}