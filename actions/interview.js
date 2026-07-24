"use server";

import { db } from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

const geminiApiKey = process.env.GEMINI_API_KEY;
const genAI = geminiApiKey ? new GoogleGenerativeAI(geminiApiKey) : null;
const model = genAI ? genAI.getGenerativeModel({ model: "gemini-2.0-flash" }) : null;

function buildFallbackQuiz(user) {
  const industry = user?.industry || "technology";
  const skills = user?.skills?.length ? user.skills.join(", ") : "relevant domain skills";

  return [
    {
      question: `How would you approach a debugging challenge in ${industry}?`,
      options: [
        "Reproduce the issue and isolate the failing component",
        "Change the code randomly until it works",
        "Ignore the error and deploy anyway",
        "Ask someone else to solve it"
      ],
      correctAnswer: "Reproduce the issue and isolate the failing component",
      explanation: "A systematic debugging approach is essential for identifying root causes and implementing reliable fixes."
    },
    {
      question: `Which skill is most valuable when working with ${skills}?`,
      options: [
        "Clear communication and collaboration",
        "Avoiding documentation",
        "Skipping testing",
        "Working without feedback"
      ],
      correctAnswer: "Clear communication and collaboration",
      explanation: "Strong collaboration and communication improve delivery quality and help teams solve problems effectively."
    }
  ];
}

export async function generateQuiz() {
    const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");
  
  const user = await db.user.findUnique({
    where: { clerkUserId: userId },
    select: {
      industry: true,
      skills: true,
    },
  });

  if (!user) throw new Error("User not found");

  const prompt = `
    Generate 10 technical interview questions for a ${
      user.industry
    } professional${
    user.skills?.length ? ` with expertise in ${user.skills.join(", ")}` : ""
  }.
    
    Each question should be multiple choice with 4 options.
    
    Return the response in this JSON format only, no additional text:
    {
      "questions": [
        {
          "question": "string",
          "options": ["string", "string", "string", "string"],
          "correctAnswer": "string",
          "explanation": "string"
        }
      ]
    }
  `;

  try {
    if (!model) {
      throw new Error("GEMINI_API_KEY is not configured.");
    }

    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();
    const cleanedText = text.replace(/```(?:json)?\n?/g, "").trim();
    const quiz = JSON.parse(cleanedText);

    return quiz.questions;
  } catch (error) {
    console.warn("Falling back to local interview questions:", error);
    return buildFallbackQuiz(user);
  }
}

export async function saveQuizResult(questions, answers, score) {
    const { userId } = await auth();
    if (!userId) throw new Error("Unauthorized");
  
    const user = await db.user.findUnique({
      where: { clerkUserId: userId },
    });
  
    if (!user) throw new Error("User not found");
  
    const questionResults = questions.map((q, index) => ({
      question: q.question,
      answer: q.correctAnswer,
      userAnswer: answers[index],
      isCorrect: q.correctAnswer === answers[index],
      explanation: q.explanation,
    }));
  
    // Get wrong answers
    const wrongAnswers = questionResults.filter((q) => !q.isCorrect);
  
    // Only generate improvement tips if there are wrong answers
    let improvementTip = null;
    if (wrongAnswers.length > 0) {
      const wrongQuestionsText = wrongAnswers
        .map(
          (q) =>
            `Question: "${q.question}"\nCorrect Answer: "${q.answer}"\nUser Answer: "${q.userAnswer}"`
        )
        .join("\n\n");
  
      const improvementPrompt = `
        The user got the following ${user.industry} technical interview questions wrong:
  
        ${wrongQuestionsText}
  
        Based on these mistakes, provide a concise, specific improvement tip.
        Focus on the knowledge gaps revealed by these wrong answers.
        Keep the response under 2 sentences and make it encouraging.
        Don't explicitly mention the mistakes, instead focus on what to learn/practice.
      `;
  
      try {
        if (!model) {
          throw new Error("GEMINI_API_KEY is not configured.");
        }

        const tipResult = await model.generateContent(improvementPrompt);
        improvementTip = tipResult.response.text().trim();
      } catch (error) {
        console.warn("Falling back without improvement tip:", error);
      }
    }
  
    try {
      const assessment = await db.assessment.create({
        data: {
          userId: user.id,
          quizScore: score,
          questions: questionResults,
          category: "Technical",
          improvementTip,
        },
      });
  
      return assessment;
    } catch (error) {
      console.error("Error saving quiz result:", error);
      throw new Error("Failed to save quiz result");
    }
  }
  
  export async function getAssessments() {
    const { userId } = await auth();
    if (!userId) throw new Error("Unauthorized");
  
    const user = await db.user.findUnique({
      where: { clerkUserId: userId },
    });
  
    if (!user) throw new Error("User not found");
  
    try {
      const assessments = await db.assessment.findMany({
        where: {
          userId: user.id,
        },
        orderBy: {
          createdAt: "asc",
        },
      });
  
      return assessments;
    } catch (error) {
      console.error("Error fetching assessments:", error);
      throw new Error("Failed to fetch assessments");
    }
  }