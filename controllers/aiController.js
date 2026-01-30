import Document from '../models/Document.js';
import Flashcard from '../models/Flashcard.js';
import Quiz from '../models/Quiz.js';
import ChatHistory from '../models/chatHistory.js'; 
import * as geminiService from '../utils/geminiService.js';
import { findRelevantChunks } from '../utils/textChunker.js';

// 1. Chat Function
export const chat = async (req, res, next) => {
  try {
    const { documentId, message } = req.body;
    if (!documentId || !message) return res.status(400).json({ success: false, error: 'Missing data' });

    const document = await Document.findOne({ _id: documentId, userId: req.user._id, status: 'ready' });
    if (!document) return res.status(404).json({ success: false, error: 'Document not found' });

    const relevantChunks = findRelevantChunks(document.chunks, message, 3);
    const answer = await geminiService.chatWithContext(message, relevantChunks);

    // Save to History
    let history = await ChatHistory.findOne({ userId: req.user._id, documentId: document._id });
    if (!history) history = await ChatHistory.create({ userId: req.user._id, documentId: document._id, messages: [] });

    history.messages.push(
        { role: 'user', content: message, timestamp: new Date() },
        { role: 'assistant', content: answer, timestamp: new Date() }
    );
    await history.save();

    res.status(200).json({ success: true, answer });
  } catch (error) { next(error); }
};

// 2. Get Chat History (Yeh missing tha jiski wajah se error aa raha tha)
export const getChatHistory = async (req, res, next) => {
    try {
        const { documentId } = req.params;
        const history = await ChatHistory.findOne({ userId: req.user._id, documentId });
        res.status(200).json({ success: true, data: history ? history.messages : [] });
    } catch (error) { next(error); }
};

// 3. Explain Concept
export const explainConcept = async (req, res, next) => {
  try {
    const { documentId, concept } = req.body;
    const document = await Document.findOne({ _id: documentId, userId: req.user._id });
    if (!document) return res.status(404).json({ success: false });

    const relevantChunks = findRelevantChunks(document.chunks, concept, 3);
    const context = relevantChunks.map(c => c.content).join('\n\n');
    
    const explanation = await geminiService.explainConcept(concept, context);
    res.status(200).json({ success: true, data: { explanation } });
  } catch (error) { next(error); }
};

// 4. Generate Summary
export const generateSummary = async (req, res, next) => {
  try {
    const { documentId } = req.body;
    const document = await Document.findOne({ _id: documentId, userId: req.user._id });
    if (!document) return res.status(404).json({ success: false });

    const summary = await geminiService.generateSummary(document.extractedText);
    res.status(200).json({ success: true, data: { summary } });
  } catch (error) { next(error); }
};

// 5. Generate Flashcards
export const generateFlashcards = async (req, res, next) => {
  try {
    const { documentId, count } = req.body;
    const document = await Document.findOne({ _id: documentId, userId: req.user._id });
    const cards = await geminiService.generateFlashcards(document.extractedText, count);
    
    const set = await Flashcard.create({
      userId: req.user._id,
      documentId: document._id,
      cards: cards
    });
    res.status(201).json({ success: true, data: set });
  } catch (error) { next(error); }
};

// 6. Generate Quiz
export const generateQuiz = async (req, res, next) => {
  try {
    const { documentId, numQuestions } = req.body;
    const document = await Document.findOne({ _id: documentId, userId: req.user._id });
    const questions = await geminiService.generateQuiz(document.extractedText, numQuestions);
    
    const quiz = await Quiz.create({
      userId: req.user._id,
      documentId: document._id,
      questions,
      totalQuestions: questions.length
    });
    res.status(201).json({ success: true, data: quiz });
  } catch (error) { next(error); }
};