import Document from '../models/Document.js';
import Flashcard from '../models/Flashcard.js';
import Quiz from '../models/Quiz.js';

// @desc    Get user learning statistics
// @route   GET /api/progress/dashboard
// @access  Private
export const getDashboard = async (req, res, next) => {
  try {
    const userId = req.user._id;

    // --- 1. Get Counts (Cards, Stats) ---
    const totalDocuments = await Document.countDocuments({ userId });
    
    // Note: Hum Flashcard SETS count kar rahe hain
    const totalFlashcardSets = await Flashcard.countDocuments({ userId }); 
    const totalQuizzes = await Quiz.countDocuments({ userId });
    const completedQuizzes = await Quiz.countDocuments({ userId, completedAt: { $ne: null } });

    // Flashcards ke andar kitne cards hain, wo count karna
    const flashcardSets = await Flashcard.find({ userId });
    let totalFlashcards = 0;
    let reviewedFlashcards = 0;
    let starredFlashcards = 0;

    flashcardSets.forEach(set => {
      totalFlashcards += set.cards.length;
      reviewedFlashcards += set.cards.filter(c => c.reviewCount > 0).length;
      starredFlashcards += set.cards.filter(c => c.isStarred).length;
    });

    // Average Score Calculation
    const quizzes = await Quiz.find({ userId, completedAt: { $ne: null } });
    const averageScore = quizzes.length > 0
      ? Math.round(quizzes.reduce((sum, quiz) => sum + quiz.score, 0) / quizzes.length)
      : 0;

    // --- 2. Recent Activities (Real-time Logic) ---

    // Documents: 'lastAccessed' check karega taake jo file abhi kholi wo upar aaye
    const recentDocuments = await Document.find({ userId })
      .sort({ lastAccessed: -1, createdAt: -1 }) // Pehle accessed dekho, phir created
      .limit(5)
      .select('title fileName lastAccessed createdAt status');

    // Quizzes: Jo abhi banaya ya attempt kiya wo upar aaye
    const recentQuizzes = await Quiz.find({ userId })
      .sort({ createdAt: -1 }) 
      .limit(5)
      .populate('documentId', 'title')
      .select('documentId title createdAt completedAt score');

    // Study Streak (Placeholder - Future me Database se le sakte hain)
    const studyStreak = Math.floor(Math.random() * 7) + 1; 

    // --- 3. Final Response ---
    res.status(200).json({
      success: true,
      data: {
        overview: {
          totalDocuments,
          totalFlashcardSets,
          totalQuizzes,
          totalFlashcards, // Ye "10" ya "50" dikhayega (Total Cards)
          reviewedFlashcards,
          starredFlashcards,
          completedQuizzes,
          averageScore,
          studyStreak
        },
        // 👇 FIX: Name change kiya 'recentActivity' taake Frontend se match ho
        recentActivity: { 
          documents: recentDocuments,
          quizzes: recentQuizzes
        }
      }
    });

  } catch (error) {
    next(error);
  }
};