import fs from "fs/promises";
import pdf from "pdf-parse/lib/pdf-parse.js";

/**
 * Extract text from PDF file (Optimized for Serverless/Vercel)
 * @param {string} filePath - Path to PDF file
 * @returns {Promise<{text: string, numPages: number, info: any}>}
 */
export const extractTextFromPDF = async (filePath) => {
  try {
    const dataBuffer = await fs.readFile(filePath);

    // --- CRITICAL FIX FOR VERCEL (Canvas Bypass) ---
    // Ye function PDF ko image ki tarah render karne ke bajaye
    // direct text strings extract karta hai. Is se 'canvas' error nahi aata.
    function render_page(pageData) {
      // Options to clean up text
      let render_options = {
        normalizeWhitespace: true,
        disableCombineTextItems: false
      }

      return pageData.getTextContent(render_options)
        .then(function(textContent) {
          let lastY, text = '';
          for (let item of textContent.items) {
            // Simple logic to handle line breaks based on Y-position
            if (lastY == item.transform[5] || !lastY){
              text += item.str;
            } else {
              text += '\n' + item.str;
            }
            lastY = item.transform[5];
          }
          return text;
        });
    }

    // Options object mein custom renderer pass kar rahe hain
    const options = {
      pagerender: render_page
    };

    // Standard call
    const data = await pdf(dataBuffer, options);

    return {
      text: data.text,
      numPages: data.numpages,
      info: data.info,
    };

  } catch (error) {
    console.error("PDF parsing error:", error);
    // Error detail bhi throw karein taake logs mein nazar aaye
    throw new Error(`Failed to extract text from PDF: ${error.message}`);
  }
};
