/*import express from 'express';
import {
getDashboard,
} from '../controllers/progressController.js';
import protect from '../middleware/auth.js';

const router = express.Router();

router.use(protect);

router.get('/dashboard', getDashboard);

export default router;
*/
import express from 'express';
import { getDashboard } from '../controllers/progressController.js';
// FIX: Curly braces add kiye hain kyunki ye named export hota hai usually
import  protect  from '../middleware/auth.js'; 

const router = express.Router();

// Sabhi routes par auth lagana
router.use(protect);

router.get('/dashboard', getDashboard);

export default router;