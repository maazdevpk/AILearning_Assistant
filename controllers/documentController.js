import Document from '../models/Document.js';
import Flashcard from '../models/Flashcard.js';
import Quiz from '../models/Quiz.js';
import fs from 'fs/promises';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';

// --- NEW SDK IMPORT ---
import { GoogleGenAI } from "@google/genai";

// --- Local Path Setup ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper function imports
import { extractTextFromPDF } from '../utils/pdfParser.js';
import { chunkText } from '../utils/textChunker.js';

// ❌ OLD: Yahan se hata diya (Ye crash kar raha tha)
// const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// @desc Upload PDF document
export const uploadDocument = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'Please upload a PDF file' });

    const { title } = req.body;
    if (!title) {
      await fs.unlink(req.file.path).catch(() => {});
      return res.status(400).json({ success: false, error: 'Please provide a title' });
    }

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const fullUrl = `${baseUrl}/uploads/documents/${req.file.filename}`;

    const document = await Document.create({
      userId: req.user._id,
      title,
      fileName: req.file.filename,
      filePath: fullUrl,
      fileSize: req.file.size,
      status: 'processing',
    });

    processPDF(document._id, req.file.path).catch(error => console.error('PDF Processing Error:', error));

    res.status(201).json({ success: true, data: document, message: 'Document uploaded successfully' });

  } catch (error) {
    if (req.file) await fs.unlink(req.file.path).catch(() => {});
    next(error);
  }
};

const processPDF = async (documentId, filePath) => {
  try {
    const { text } = await extractTextFromPDF(filePath);
    const chunks = chunkText(text, 500, 50);

    await Document.findByIdAndUpdate(documentId, {
      extractedText: text,
      chunks: chunks,
      status: 'ready',
    });
    console.log(`Document ${documentId} processed successfully`);
  } catch (error) {
    console.error(`Error processing document ${documentId}: `, error);
    await Document.findByIdAndUpdate(documentId, { status: 'failed' });
  }
};

// @desc Get all documents
export const getDocuments = async (req, res, next) => {
  try {
    const documents = await Document.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(req.user._id) } },
      { $lookup: { from: 'flashcards', localField: '_id', foreignField: 'documentId', as: 'flashcards' } },
      { $lookup: { from: 'quizzes', localField: '_id', foreignField: 'documentId', as: 'quizzes' } },
      { $addFields: { flashcardCount: { $size: '$flashcards' }, quizCount: { $size: '$quizzes' } } },
      { $project: { extractedText: 0, chunks: 0, flashcards: 0, quizzes: 0 } },
      { $sort: { createdAt: -1 } }
    ]);
    res.status(200).json({ success: true, count: documents.length, data: documents });
  } catch (error) {
    next(error);
  }
};

// @desc Get Single Document
export const getDocument = async (req, res, next) => {
  try {
    const document = await Document.findOne({ _id: req.params.id, userId: req.user._id });
    if (!document) return res.status(404).json({ success: false, error: 'Document not found' });

    const flashcardCount = await Flashcard.countDocuments({ documentId: document._id });
    const quizCount = await Quiz.countDocuments({ documentId: document._id });

    document.lastAccessed = Date.now();
    await document.save();

    const documentData = document.toObject();
    documentData.flashcardCount = flashcardCount;
    documentData.quizCount = quizCount;

    res.status(200).json({ success: true, data: documentData });
  } catch (error) {
    next(error);
  }
};

// @desc Delete document
export const deleteDocument = async (req, res, next) => {
  try {
    const document = await Document.findOne({ _id: req.params.id, userId: req.user._id });
    if (!document) return res.status(404).json({ success: false, error: 'Document not found' });

    const localFilePath = path.join(__dirname, '../uploads/documents', document.fileName);
    try { await fs.unlink(localFilePath); } catch (err) { console.log("File not found on disk, deleting DB entry anyway..."); }

    await document.deleteOne();
    res.status(200).json({ success: true, message: 'Document deleted successfully' });
  } catch (error) {
    next(error);
  }
};

// --- NEW FUNCTION: Generate Flashcards ---
export const generateFlashcards = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { topic, count } = req.body; 
    const numberOfCards = count || 5;

    // ✅ FIX: Client ko yahan initialize kiya jab function call hoga
    // Is waqt tak .env load ho chuka hota hai
    const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const document = await Document.findById(id);
    if (!document) return res.status(404).json({ message: "Document not found" });

    if (!document.extractedText) return res.status(400).json({ message: "Document text not ready yet." });

    const prompt = `
      You are an expert tutor. Create exactly ${numberOfCards} flashcards based on the following text.
      
      Topic Focus: "${topic || "Key Concepts & Summary"}"
      
      IMPORTANT FORMATTING RULES:
      1. Return ONLY a raw JSON array.
      2. Do not use Markdown code blocks (no \`\`\`json).
      3. Each object MUST strictly use the keys "question" and "answer".
      4. Questions should be concise, Answers should be clear.
      
      Text Content:
      "${document.extractedText.substring(0, 4000)}" 
    `;

    // API Call
    const response = await client.models.generateContent({
      model: 'gemini-1.5-flash',
      contents: prompt,
    });

    let text = response.text(); 
    text = text.replace(/```json/g, "").replace(/```/g, "").trim();
    
    let generatedCards;
    try {
        generatedCards = JSON.parse(text);
    } catch (e) {
        return res.status(500).json({ message: "AI generated invalid JSON" });
    }

    const formattedCards = generatedCards.map(card => ({
        question: card.question || card.front || "No Question",
        answer: card.answer || card.back || "No Answer",
        difficulty: "medium"
    }));

    const newFlashcardSet = await Flashcard.create({
      userId: req.user._id,
      documentId: id,
      title: topic ? `${topic} (${formattedCards.length})` : `Generated Set (${formattedCards.length})`,
      cards: formattedCards 
    });

    res.status(200).json(newFlashcardSet);

  } catch (error) {
    console.error("Generate Error:", error);
    res.status(500).json({ message: "Failed to generate flashcards", error: error.message });
  }
};