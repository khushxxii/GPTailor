const express = require('express');
const cors = require('cors');
const multer = require('multer');
const pdf = require('pdf-parse');
const OpenAI = require('openai');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Determine the correct base directory for serverless vs local
const isServerless = process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NETLIFY;
let baseDir;

if (isServerless) {
  // Check if PUBLIC_DIR was set by the function wrapper
  if (process.env.PUBLIC_DIR && fs.existsSync(process.env.PUBLIC_DIR)) {
    baseDir = process.env.PUBLIC_DIR;
  } else {
    // In Netlify serverless, try multiple possible locations
    const possiblePaths = [
      path.join(__dirname, 'public'),                    // Root public folder
      path.join(__dirname, 'netlify', 'functions', 'public'), // Copied by build script
      path.join(__dirname, '..', 'public'),              // Parent directory
      path.join(__dirname, '..', '..', 'public'),        // Two levels up
      path.join(process.cwd(), 'public'),                 // Working directory
      '/var/task/public',                                 // Netlify Lambda default
      '/var/task/src/public',                             // Netlify Lambda with src (common)
      '/var/task/netlify/functions/public',               // Netlify Lambda function path
    ];
    
    baseDir = path.join(__dirname, 'public'); // Default fallback
    let found = false;
    
    for (const possiblePath of possiblePaths) {
      const landingPath = path.join(possiblePath, 'landing.html');
      if (fs.existsSync(possiblePath) && fs.existsSync(landingPath)) {
        baseDir = possiblePath;
        found = true;
        console.log(`✅ Found public directory at: ${baseDir}`);
        break;
      }
    }
    
    if (!found) {
      console.error('❌ Could not find public directory. Tried paths:');
      possiblePaths.forEach(p => console.error(`   - ${p}`));
      console.error(`   __dirname: ${__dirname}`);
      console.error(`   process.cwd(): ${process.cwd()}`);
    }
  }
} else {
  // Local development
  baseDir = path.join(__dirname, 'public');
}

// Middleware
app.use(cors());
app.use(express.json());

// Routes - must be before static to override default index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(baseDir, 'landing.html'));
});

app.get('/tailor', (req, res) => {
  res.sendFile(path.join(baseDir, 'index.html'));
});

app.use(express.static(baseDir, { index: false }));

// Validate OpenAI API Key
if (!process.env.OPENAI_API_KEY) {
  console.warn('⚠️  WARNING: OPENAI_API_KEY is not set in .env file');
  console.warn('   The server will start but resume analysis will fail.');
}

// Initialize OpenAI
const openai = process.env.OPENAI_API_KEY ? new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
}) : null;

// Configure multer for file uploads (multiple files)
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
}).fields([
  { name: 'resume', maxCount: 1 },
  { name: 'jobPosting', maxCount: 1 }
]);

// Extract text from PDF buffer
async function extractTextFromPDF(buffer) {
  try {
    const data = await pdf(buffer);
    return data.text;
  } catch (error) {
    throw new Error('Failed to extract text from PDF: ' + error.message);
  }
}

// Analyze resume against job posting and generate score and feedback
async function analyzeResume(resumeText, jobPostingText) {
  if (!openai) {
    throw new Error('OpenAI API key is not configured. Please set OPENAI_API_KEY in your .env file.');
  }

  const prompt = `You are an expert resume reviewer and career advisor. Compare the following resume against the job posting and provide a comprehensive analysis in JSON format.

Job Posting:
${jobPostingText}

Resume:
${resumeText}

Analyze how well the resume matches the job requirements and provide specific, actionable feedback. Provide a JSON response with the following structure:
{
  "score": <number between 0-100>,
  "overall": <number matching score>,
  "topFixes": [
    {
      "title": "<issue title>",
      "count": <number of instances>,
      "description": "<brief description>",
      "premium": false
    }
  ],
  "completed": [
    {
      "title": "<strength title>",
      "score": <number>
    }
  ],
  "issues": [
    {
      "title": "<issue title>",
      "description": "<detailed description>",
      "fixButton": "<button label>",
      "category": "<category>"
    }
  ],
  "feedback": "<overall feedback paragraph>",
  "tips": "<additional tips>"
}

Focus on comparing the resume to the job posting:
- How well skills match the job requirements
- Missing keywords from the job posting
- Experience alignment with job requirements
- Quantifying impact (add numbers/metrics relevant to the job)
- Tailoring bullet points to match job responsibilities
- Missing qualifications or certifications mentioned in the job
- ATS keyword optimization for this specific job
- Formatting and structure issues

Score the resume based on how well it matches THIS SPECIFIC JOB:
- Job-relevant content and skills match (40%)
- Keyword alignment with job posting (25%)
- Experience relevance to job requirements (20%)
- Quantified achievements relevant to the role (15%)

Return ONLY valid JSON, no markdown formatting.`;

  try {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4',
      messages: [
        {
          role: 'system',
          content: 'You are an expert resume reviewer. Always respond with valid JSON only, no markdown or code blocks.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 2000
    });

    const responseText = completion.choices[0].message.content.trim();
    
    // Remove markdown code blocks if present
    let jsonText = responseText;
    if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```json\n?/, '').replace(/^```\n?/, '').replace(/\n?```$/, '');
    }
    
    try {
      const analysis = JSON.parse(jsonText);
      return analysis;
    } catch (parseError) {
      console.error('JSON Parse Error:', parseError);
      console.error('Response text:', jsonText.substring(0, 500));
      throw new Error('Failed to parse AI response. The AI may not have returned valid JSON.');
    }
  } catch (error) {
    console.error('OpenAI API Error:', error);
    if (error.status === 401) {
      throw new Error('Invalid OpenAI API key. Please check your .env file.');
    } else if (error.status === 429) {
      throw new Error('OpenAI API rate limit exceeded. Please try again later.');
    } else if (error.status === 500) {
      throw new Error('OpenAI API server error. Please try again later.');
    }
    throw new Error('Failed to analyze resume: ' + (error.message || 'Unknown error'));
  }
}


// Upload and analyze resume against job posting
app.post('/api/analyze', upload, async (req, res) => {
  try {
    let resumeText = '';
    let jobPostingText = '';

    // Handle resume input
    if (req.files && req.files.resume && req.files.resume[0]) {
      // Extract text from PDF
      resumeText = await extractTextFromPDF(req.files.resume[0].buffer);
    } else if (req.body.resumeText) {
      // Use text from request body
      resumeText = req.body.resumeText;
    } else {
      return res.status(400).json({ error: 'No resume provided. Please upload a file or provide text.' });
    }

    // Handle job posting input
    if (req.files && req.files.jobPosting && req.files.jobPosting[0]) {
      // Extract text from PDF
      jobPostingText = await extractTextFromPDF(req.files.jobPosting[0].buffer);
    } else if (req.body.jobPostingText) {
      // Use text from request body
      jobPostingText = req.body.jobPostingText;
    } else {
      return res.status(400).json({ error: 'No job posting provided. Please upload a file or provide text.' });
    }

    // Text length limits
    const MAX_RESUME_LENGTH = 20000; // ~3-4 pages
    const MAX_JOB_POSTING_LENGTH = 10000; // ~2 pages

    if (!resumeText || resumeText.trim().length < 50) {
      return res.status(400).json({ error: 'Resume text is too short. Please provide a valid resume (minimum 50 characters).' });
    }

    if (resumeText.length > MAX_RESUME_LENGTH) {
      return res.status(400).json({ 
        error: `Resume text is too long. Maximum ${MAX_RESUME_LENGTH.toLocaleString()} characters allowed. Your text has ${resumeText.length.toLocaleString()} characters. Please shorten your text and try again.` 
      });
    }

    if (!jobPostingText || jobPostingText.trim().length < 50) {
      return res.status(400).json({ error: 'Job posting text is too short. Please provide a valid job description (minimum 50 characters).' });
    }

    if (jobPostingText.length > MAX_JOB_POSTING_LENGTH) {
      return res.status(400).json({ 
        error: `Job posting text is too long. Maximum ${MAX_JOB_POSTING_LENGTH.toLocaleString()} characters allowed. Your text has ${jobPostingText.length.toLocaleString()} characters. Please shorten your text and try again.` 
      });
    }

    // Detect if content is swapped (resume in job posting field or vice versa)
    function detectContentType(text) {
      if (!text || typeof text !== 'string') return 'unknown';
      
      const lowerText = text.toLowerCase();
      
      // Strong resume indicators (more specific, less likely in job postings)
      const strongResumeIndicators = [
        /\b(resume|cv|curriculum vitae)\b/i,
        /^\s*[A-Z][a-z]+\s+[A-Z][a-z]+/m, // Name pattern at start (e.g., "John Doe")
        /\b(objective|summary|profile)\s*:?\s*$/im, // Resume sections
        /\b(references\s*(available|upon\s*request)|references\s*:)/i,
        /\b(professional\s*summary|executive\s*summary)/i,
        /\b(work\s*experience|employment\s*history|professional\s*experience)\s*:?/i,
        /\b(phone|email|address|contact)\s*:?\s*[^\n]{5,}/i, // Contact info with actual content
      ];
      
      // Moderate resume indicators (can appear in both, but more common in resumes)
      const moderateResumeIndicators = [
        /\b(certifications|awards|honors|publications)\s*:?/i,
        /\b(education\s*background|academic\s*background)/i,
        /\b(technical\s*skills|core\s*competencies)\s*:?/i,
      ];
      
      // Strong job posting indicators (very specific to job postings)
      const strongJobIndicators = [
        /\b(job\s*(posting|description|ad|listing|opening)|position\s*description|role\s*description)\b/i,
        /\b(we\s*are\s*(looking|seeking|hiring|recruiting)|we\s*have\s*an?\s*opening)/i,
        /\b(apply\s*(now|today|online)|submit\s*your\s*(application|resume)|send\s*resume)/i,
        /\b(qualifications?\s*(required|needed)|requirements?\s*(for|of))/i,
        /\b(responsibilities?\s*(include|are)|key\s*duties|essential\s*functions)/i,
        /\b(salary\s*(range|package)|compensation\s*package|competitive\s*salary)/i,
        /\b(benefits\s*(package|include|offered)|employee\s*benefits)/i,
        /\b(about\s*(the\s*company|us)|company\s*overview|who\s*we\s*are)/i,
        /\b(job\s*title|position\s*title|role\s*title)\s*:?/i,
        /\b(reporting\s*to|manager|supervisor)/i,
        /\b(team|department|division)/i,
        /\b(immediate\s*start|start\s*date|available\s*immediately)/i,
        /\b(remote|hybrid|onsite|work\s*from\s*home)/i,
        /\b(hourly\s*rate|per\s*hour|\$\s*\d+|\d+\s*per\s*hour)/i,
      ];
      
      // Moderate job posting indicators
      const moderateJobIndicators = [
        /\b(location\s*:?\s*[^\n]+|work\s*location|office\s*location)/i,
        /\b(employment\s*type|job\s*type|full\s*time|part\s*time|contract)/i,
        /\b(equal\s*opportunity|eoe|diversity|inclusion)/i,
        /\b(must\s*have|required\s*skills|preferred\s*qualifications)/i,
        /\b(years?\s*of\s*experience|minimum\s*experience)/i,
        /\b(bachelor|master|phd|degree)\s*(required|preferred)/i,
        /\b(candidate|applicant|we\s*want|looking\s*for)/i,
        /\b(join\s*our|become\s*part|work\s*with\s*us)/i,
      ];
      
      let resumeScore = 0;
      let jobScore = 0;
      
      // Strong indicators count more
      strongResumeIndicators.forEach(pattern => {
        if (pattern.test(text)) resumeScore += 2;
      });
      
      moderateResumeIndicators.forEach(pattern => {
        if (pattern.test(text)) resumeScore += 1;
      });
      
      strongJobIndicators.forEach(pattern => {
        if (pattern.test(text)) jobScore += 2;
      });
      
      moderateJobIndicators.forEach(pattern => {
        if (pattern.test(text)) jobScore += 1;
      });
      
      // Require a clear winner with minimum threshold
      // Lower threshold to 1 for job postings since they can be more varied
      if (resumeScore > jobScore && resumeScore >= 2) return 'resume';
      if (jobScore > resumeScore && jobScore >= 1) return 'job'; // Lower threshold for job detection
      // If scores are equal or both low, check if one is clearly higher
      if (jobScore >= 1 && jobScore > resumeScore) return 'job';
      if (resumeScore >= 2 && resumeScore > jobScore) return 'resume';
      
      // If we have ANY job indicators but no strong resume indicators, likely a job posting
      if (jobScore >= 1 && resumeScore < 2) return 'job';
      // If we have strong resume indicators, it's a resume
      if (resumeScore >= 2) return 'resume';
      
      return 'unknown';
    }

    // Check for swapped content
    const resumeContentType = detectContentType(resumeText);
    const jobContentType = detectContentType(jobPostingText);
    
    // Debug logging
    console.log('Content type detection:', {
      resume: resumeContentType,
      job: jobContentType,
      resumeLength: resumeText.length,
      jobLength: jobPostingText.length,
      resumePreview: resumeText.substring(0, 200),
      jobPreview: jobPostingText.substring(0, 200)
    });
    
    // Check if resume field has job posting content
    if (resumeContentType === 'job') {
      // If job field also has job content, both are wrong - prioritize resume field error
      if (jobContentType === 'job') {
        return res.status(400).json({ 
          error: 'SWAPPED_CONTENT',
          message: 'The content in "Your Resume" field appears to be a job posting, not a resume. Please make sure you uploaded/pasted your resume in the correct field.'
        });
      }
      return res.status(400).json({ 
        error: 'SWAPPED_CONTENT',
        message: 'The content in "Your Resume" field appears to be a job posting, not a resume. Please make sure you uploaded/pasted your resume in the correct field.'
      });
    }
    
    // Check if job posting field has resume content
    if (jobContentType === 'resume') {
      // If resume field also has resume content, both are wrong - prioritize job field error
      if (resumeContentType === 'resume') {
        return res.status(400).json({ 
          error: 'SWAPPED_CONTENT',
          message: 'The content in "Job Posting" field appears to be a resume, not a job posting. Please make sure you uploaded/pasted the job description in the correct field.'
        });
      }
      return res.status(400).json({ 
        error: 'SWAPPED_CONTENT',
        message: 'The content in "Job Posting" field appears to be a resume, not a job posting. Please make sure you uploaded/pasted the job description in the correct field.'
      });
    }
    
    // Additional check: if both are 'unknown' but content is very similar, likely both are job postings
    // (user uploaded same job posting in both fields)
    if (resumeContentType === 'unknown' && jobContentType === 'unknown') {
      // Helper function to calculate text similarity
      function calculateSimilarity(text1, text2) {
        if (!text1 || !text2) return 0;
        const words1 = text1.toLowerCase().split(/\s+/);
        const words2 = text2.toLowerCase().split(/\s+/);
        const set1 = new Set(words1);
        const set2 = new Set(words2);
        const intersection = new Set([...set1].filter(x => set2.has(x)));
        const union = new Set([...set1, ...set2]);
        return intersection.size / union.size;
      }
      
      // Check if content is very similar (likely same document)
      const similarity = calculateSimilarity(resumeText.substring(0, 500), jobPostingText.substring(0, 500));
      if (similarity > 0.8) {
        // Content is very similar - check if it looks like a job posting
        const combinedText = resumeText + ' ' + jobPostingText;
        const combinedType = detectContentType(combinedText);
        if (combinedType === 'job') {
          return res.status(400).json({ 
            error: 'SWAPPED_CONTENT',
            message: 'The content in "Your Resume" field appears to be a job posting, not a resume. Please make sure you uploaded/pasted your resume in the correct field.'
          });
        }
      }
    }

    // Analyze resume against job posting
    const analysis = await analyzeResume(resumeText, jobPostingText);

    // Increment resume counter
    incrementResumeCounter();

    res.json({
      success: true,
      analysis,
      resumeText: resumeText.substring(0, 5000), // Return first 5000 chars for display
      jobPostingText: jobPostingText.substring(0, 2000) // Return first 2000 chars for reference
    });
  } catch (error) {
    console.error('Analysis error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to analyze resume. Please try again.' 
    });
  }
});

// Fetch content from URL
app.post('/api/fetch-url', async (req, res) => {
  try {
    const { url } = req.body;

    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'Valid URL is required.' });
    }

    // Ensure URL has protocol
    let fetchUrl = url.trim();
    if (!fetchUrl.startsWith('http://') && !fetchUrl.startsWith('https://')) {
      fetchUrl = 'https://' + fetchUrl;
    }

    // Use Node's built-in fetch (Node 18+) or fallback to http/https
    let html;
    
    try {
      // Try using global fetch (Node 18+)
      if (typeof fetch !== 'undefined') {
        const response = await fetch(fetchUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
          }
        });

        if (!response.ok) {
          // Check for authentication/access issues
          if (response.status === 401 || response.status === 403) {
            return res.status(400).json({ 
              error: 'ACCESS_REQUIRED',
              message: 'This URL requires login or special access. Please use one of these alternatives:\n\n1. Copy the job description text from the page and paste it using "Paste Text"\n2. Save the page as a PDF and upload it using "Upload"'
            });
          }
          if (response.status === 404) {
            return res.status(400).json({ 
              error: 'NOT_FOUND',
              message: 'This URL could not be found (404 error). Please check the URL and try again, or paste the job description text directly.'
            });
          }
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        html = await response.text();
        
        // Check if the page indicates login/access required
        const loginIndicators = [
          /sign\s*in|log\s*in|login|authentication|access\s*denied|unauthorized|forbidden/i,
          /please\s*log\s*in|sign\s*in\s*to\s*continue|access\s*restricted/i
        ];
        
        const lowerHtml = html.toLowerCase();
        const hasLoginIndicator = loginIndicators.some(pattern => pattern.test(html));
        const hasLoginForm = /<form[^>]*>.*?(?:password|username|email|login).*?<\/form>/is.test(html);
        
        if (hasLoginIndicator || hasLoginForm) {
          // Check if we got meaningful content despite login indicators
          const textCheck = html.replace(/<script[^>]*>.*?<\/script>/gis, '')
                                .replace(/<style[^>]*>.*?<\/style>/gis, '')
                                .replace(/<[^>]+>/g, ' ')
                                .replace(/\s+/g, ' ')
                                .trim();
          
          // If the page is mostly login-related content, it's likely inaccessible
          if (textCheck.length < 200 || (hasLoginForm && textCheck.length < 500)) {
            return res.status(400).json({ 
              error: 'ACCESS_REQUIRED',
              message: 'This URL requires login or special access. Please use one of these alternatives:\n\n1. Copy the job description text from the page and paste it using "Paste Text"\n2. Save the page as a PDF and upload it using "Upload"'
            });
          }
        }
      } else {
        // Fallback: use Node's http/https modules
        const https = require('https');
        const http = require('http');
        const { URL } = require('url');
        
        html = await new Promise((resolve, reject) => {
          const urlObj = new URL(fetchUrl);
          const client = urlObj.protocol === 'https:' ? https : http;
          
          const request = client.get(fetchUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 10000
          }, (response) => {
            // Check for authentication/access issues
            if (response.statusCode === 401 || response.statusCode === 403) {
              reject(new Error('ACCESS_REQUIRED'));
              return;
            }
            if (response.statusCode === 404) {
              reject(new Error('NOT_FOUND'));
              return;
            }
            if (response.statusCode < 200 || response.statusCode >= 300) {
              reject(new Error(`HTTP error! status: ${response.statusCode}`));
              return;
            }
            
            let data = '';
            response.on('data', (chunk) => { data += chunk; });
            response.on('end', () => {
              // Check for login indicators in the HTML
              const loginIndicators = [
                /sign\s*in|log\s*in|login|authentication|access\s*denied|unauthorized|forbidden/i,
                /please\s*log\s*in|sign\s*in\s*to\s*continue|access\s*restricted/i
              ];
              
              const hasLoginIndicator = loginIndicators.some(pattern => pattern.test(data));
              const hasLoginForm = /<form[^>]*>.*?(?:password|username|email|login).*?<\/form>/is.test(data);
              
              if (hasLoginIndicator || hasLoginForm) {
                const textCheck = data.replace(/<script[^>]*>.*?<\/script>/gis, '')
                                      .replace(/<style[^>]*>.*?<\/style>/gis, '')
                                      .replace(/<[^>]+>/g, ' ')
                                      .replace(/\s+/g, ' ')
                                      .trim();
                
                if (textCheck.length < 200 || (hasLoginForm && textCheck.length < 500)) {
                  reject(new Error('ACCESS_REQUIRED'));
                  return;
                }
              }
              resolve(data);
            });
          });
          
          request.on('error', (err) => reject(err));
          request.on('timeout', () => {
            request.destroy();
            reject(new Error('Request timeout'));
          });
        });
      }
    } catch (fetchError) {
      console.error('Fetch error:', fetchError);
      
      // Handle specific error types
      if (fetchError.message === 'ACCESS_REQUIRED') {
        return res.status(400).json({ 
          error: 'ACCESS_REQUIRED',
          message: 'This URL requires login or special access. Please use one of these alternatives:\n\n1. Copy the job description text from the page and paste it using "Paste Text"\n2. Save the page as a PDF and upload it using "Upload"'
        });
      }
      
      if (fetchError.message === 'NOT_FOUND') {
        return res.status(400).json({ 
          error: 'NOT_FOUND',
          message: 'This URL could not be found (404 error). Please check the URL and try again, or paste the job description text directly.'
        });
      }
      
      throw new Error('Failed to fetch URL: ' + fetchError.message);
    }
    
    // Enhanced HTML to text extraction
    const MAX_JOB_POSTING_LENGTH = 10000; // ~2 pages
    
    // First, try to extract from JSON-LD structured data (common in job postings)
    let text = '';
    const jsonLdMatches = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>(.*?)<\/script>/gis);
    if (jsonLdMatches) {
      for (const match of jsonLdMatches) {
        try {
          const jsonContent = match.replace(/<script[^>]*>|<\/script>/gi, '');
          const data = JSON.parse(jsonContent);
          if (data['@type'] === 'JobPosting' || data.jobTitle || data.description) {
            if (data.description) {
              text += data.description + ' ';
            }
            if (data.qualifications) {
              text += (typeof data.qualifications === 'string' ? data.qualifications : JSON.stringify(data.qualifications)) + ' ';
            }
            if (data.responsibilities) {
              text += (typeof data.responsibilities === 'string' ? data.responsibilities : JSON.stringify(data.responsibilities)) + ' ';
            }
          }
        } catch (e) {
          // Ignore JSON parse errors
        }
      }
    }
    
    // Try to extract from meta tags
    const metaDescription = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
    if (metaDescription && metaDescription[1]) {
      text += metaDescription[1] + ' ';
    }
    
    // Try to extract from common job posting class names/IDs
    const jobContentSelectors = [
      /<div[^>]*class=["'][^"']*job[^"']*description[^"']*["'][^>]*>(.*?)<\/div>/gis,
      /<div[^>]*class=["'][^"']*description[^"']*["'][^>]*>(.*?)<\/div>/gis,
      /<div[^>]*id=["'][^"']*job[^"']*description[^"']*["'][^>]*>(.*?)<\/div>/gis,
      /<section[^>]*class=["'][^"']*job[^"']*description[^"']*["'][^>]*>(.*?)<\/section>/gis,
      /<article[^>]*class=["'][^"']*job[^"']*["'][^>]*>(.*?)<\/article>/gis,
    ];
    
    for (const selector of jobContentSelectors) {
      const matches = html.match(selector);
      if (matches) {
        for (const match of matches) {
          const content = match.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
          if (content.length > 100) {
            text += content + ' ';
          }
        }
      }
    }
    
    // If we still don't have enough text, do general extraction
    if (text.trim().length < 100) {
      // Remove scripts and styles first
      let cleanHtml = html
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
        .replace(/<noscript[^>]*>.*?<\/noscript>/gi, '');
      
      // Try to get text from main content areas
      const mainContent = cleanHtml.match(/<main[^>]*>(.*?)<\/main>/gis) || 
                         cleanHtml.match(/<article[^>]*>(.*?)<\/article>/gis) ||
                         cleanHtml.match(/<div[^>]*class=["'][^"']*content[^"']*["'][^>]*>(.*?)<\/div>/gis);
      
      if (mainContent) {
        for (const content of mainContent) {
          const extracted = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
          if (extracted.length > 100) {
            text += extracted + ' ';
          }
        }
      }
      
      // Fallback to general text extraction
      if (text.trim().length < 100) {
        text = cleanHtml
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
      }
    } else {
      // Clean up the extracted text
      text = text
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }

    // Final cleanup
    text = text
      .replace(/\s+/g, ' ')
      .trim();

    if (text.length < 50) {
      return res.status(400).json({ 
        error: 'Could not extract meaningful content from this URL. This website may require JavaScript to load the job description, or the content structure is not supported. Please copy and paste the job description text directly instead.' 
      });
    }

    // Truncate if too long and warn user
    if (text.length > MAX_JOB_POSTING_LENGTH) {
      text = text.substring(0, MAX_JOB_POSTING_LENGTH);
      return res.status(400).json({ 
        error: `The content from this URL is too long (over ${MAX_JOB_POSTING_LENGTH.toLocaleString()} characters). Please paste the job description text directly instead.` 
      });
    }

    res.json({ content: text });
  } catch (error) {
    console.error('URL fetch error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to fetch URL content. Please try pasting the text directly.' 
    });
  }
});

// Optimize ATS Keywords
app.post('/api/optimize-ats', async (req, res) => {
  try {
    const { resume, jobPosting } = req.body;

    if (!resume || !jobPosting) {
      return res.status(400).json({ error: 'Resume and job posting are required.' });
    }

    if (!openai) {
      return res.status(500).json({ error: 'OpenAI API key is not configured.' });
    }

    const prompt = `Analyze the resume and job posting below. Identify all ATS keywords from the job posting that are missing from the resume.

Job Posting:
${jobPosting}

Resume:
${resume}

Return a JSON response with this structure:
{
  "keywords": ["keyword1", "keyword2", "keyword3"],
  "suggestions": "Detailed suggestions on where and how to add these keywords naturally to the resume."
}

Focus on:
- Technical skills mentioned in the job
- Software/tools mentioned
- Certifications required
- Industry-specific terms
- Action verbs that match the job description

Return ONLY valid JSON, no markdown formatting.`;

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4',
      messages: [
        {
          role: 'system',
          content: 'You are an ATS optimization expert. Always respond with valid JSON only, no markdown or code blocks.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 1000
    });

    const responseText = completion.choices[0].message.content.trim();
    let jsonText = responseText;
    if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```json\n?/, '').replace(/^```\n?/, '').replace(/\n?```$/, '');
    }

    const result = JSON.parse(jsonText);
    res.json(result);
  } catch (error) {
    console.error('ATS Optimization error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to optimize ATS keywords.' 
    });
  }
});

// Missing Qualifications
app.post('/api/missing-qualifications', async (req, res) => {
  try {
    const { resume, jobPosting } = req.body;

    if (!resume || !jobPosting) {
      return res.status(400).json({ error: 'Resume and job posting are required.' });
    }

    if (!openai) {
      return res.status(500).json({ error: 'OpenAI API key is not configured.' });
    }

    const prompt = `Analyze the resume and job posting below. Identify all qualifications, certifications, skills, or requirements mentioned in the job posting that are missing from the resume.

Job Posting:
${jobPosting}

Resume:
${resume}

Return a JSON response with this structure:
{
  "qualifications": ["qualification1", "qualification2", "qualification3"],
  "suggestions": "Detailed suggestions on how to address these missing qualifications, including whether they can be added, if they're critical, and alternative ways to demonstrate similar capabilities."
}

Focus on:
- Required certifications
- Required education level
- Required years of experience
- Required technical skills
- Required soft skills
- Industry-specific requirements

Return ONLY valid JSON, no markdown formatting.`;

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4',
      messages: [
        {
          role: 'system',
          content: 'You are a career advisor. Always respond with valid JSON only, no markdown or code blocks.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 1000
    });

    const responseText = completion.choices[0].message.content.trim();
    let jsonText = responseText;
    if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```json\n?/, '').replace(/^```\n?/, '').replace(/\n?```$/, '');
    }

    const result = JSON.parse(jsonText);
    res.json(result);
  } catch (error) {
    console.error('Missing Qualifications error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to analyze missing qualifications.' 
    });
  }
});

// Get detailed fix suggestions for a specific issue
app.post('/api/fix-issue', async (req, res) => {
  try {
    const { issueTitle, issueDescription, resume, jobPosting } = req.body;

    if (!issueTitle || !resume || !jobPosting) {
      return res.status(400).json({ error: 'Issue title, resume, and job posting are required.' });
    }

    if (!openai) {
      return res.status(500).json({ error: 'OpenAI API key is not configured.' });
    }

    const prompt = `You are an expert resume advisor. Provide detailed, actionable fix suggestions for this specific resume issue.

Issue: ${issueTitle}
Description: ${issueDescription || 'Not provided'}

Job Posting:
${jobPosting}

Resume:
${resume}

Provide a JSON response with this structure:
{
  "specificExamples": ["example 1", "example 2", "example 3"],
  "beforeAfterExamples": [
    {
      "before": "weak bullet point",
      "after": "improved bullet point with metrics"
    }
  ],
  "stepByStepGuide": [
    "Step 1: ...",
    "Step 2: ...",
    "Step 3: ..."
  ],
  "keywordsToAdd": ["keyword1", "keyword2"],
  "tips": "Additional helpful tips and best practices"
}

Focus on:
- Specific, actionable suggestions
- Real examples from the resume if possible
- Before/after examples showing improvements
- Step-by-step instructions
- Keywords or phrases to add
- Best practices for this specific issue type

Return ONLY valid JSON, no markdown formatting.`;

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4',
      messages: [
        {
          role: 'system',
          content: 'You are an expert resume advisor. Always respond with valid JSON only, no markdown or code blocks.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 1500
    });

    const responseText = completion.choices[0].message.content.trim();
    let jsonText = responseText;
    if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```json\n?/, '').replace(/^```\n?/, '').replace(/\n?```$/, '');
    }

    const result = JSON.parse(jsonText);
    res.json(result);
  } catch (error) {
    console.error('Fix issue error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to generate fix suggestions.' 
    });
  }
});

// Request Feature - sends email notification
app.post('/api/request-feature', async (req, res) => {
  try {
    const { featureName, userEmail } = req.body;

    if (!featureName) {
      return res.status(400).json({ error: 'Feature name is required.' });
    }

    // Configure email transporter
    // Supports Gmail, Yahoo, and other SMTP providers
    const emailUser = process.env.EMAIL_USER;
    const emailPass = process.env.EMAIL_PASS;
    
    let transporter;
    
    if (emailUser && emailPass) {
      // Determine email service from the email address
      const isGmail = emailUser.includes('@gmail.com');
      const isYahoo = emailUser.includes('@yahoo.com') || emailUser.includes('@yahoo.co.uk');
      
      if (isGmail) {
        transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: {
            user: emailUser,
            pass: emailPass.replace(/\s/g, '') // Remove spaces from app password
          }
        });
        // Verify connection
        transporter.verify(function(error, success) {
          if (error) {
            console.error('❌ Gmail connection error:', error);
          } else {
            console.log('✅ Gmail server is ready to send emails');
          }
        });
      } else if (isYahoo) {
        transporter = nodemailer.createTransport({
          host: 'smtp.mail.yahoo.com',
          port: 587,
          secure: false,
          auth: {
            user: emailUser,
            pass: emailPass
          }
        });
      } else {
        // Generic SMTP (for other providers)
        transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST || 'smtp.gmail.com',
          port: parseInt(process.env.SMTP_PORT || '587'),
          secure: false,
          auth: {
            user: emailUser,
            pass: emailPass
          }
        });
      }
    }

    // Send email (only if email is configured)
    if (emailUser && emailPass && transporter) {
      console.log(`📧 Attempting to send email for feature: ${featureName}`);
      // Email content
      const mailOptions = {
        from: emailUser,
        to: 'khushisingh7205@yahoo.com',
        subject: `Feature Request: ${featureName}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2563eb;">New Feature Request</h2>
            <p><strong>Feature:</strong> ${featureName}</p>
            <p><strong>Requested at:</strong> ${new Date().toLocaleString()}</p>
            <p><strong>User IP:</strong> ${req.ip || req.connection.remoteAddress}</p>
            ${userEmail ? `<p><strong>User Email:</strong> ${userEmail} (wants to be notified when feature is available)</p>` : '<p><strong>User Email:</strong> Not provided</p>'}
            <hr style="border: 1px solid #e0e0e0; margin: 20px 0;">
            <p style="color: #666; font-size: 14px;">Someone has requested that "${featureName}" be released sooner. Consider prioritizing this feature if you receive 5+ requests.</p>
            ${userEmail ? `<p style="color: #2563eb; font-size: 14px; font-weight: 500;">📧 Remember to notify ${userEmail} when this feature is released!</p>` : ''}
          </div>
        `,
        text: `New Feature Request: ${featureName}\n\nRequested at: ${new Date().toLocaleString()}\nUser IP: ${req.ip || req.connection.remoteAddress}\nUser Email: ${userEmail || 'Not provided'}${userEmail ? ' (wants to be notified when feature is available)' : ''}\n\n${userEmail ? `Remember to notify ${userEmail} when this feature is released!` : ''}`
      };

      try {
        await transporter.sendMail(mailOptions);
        console.log(`✅ Feature request email sent for: ${featureName}`);
        console.log(`   From: ${emailUser}`);
        console.log(`   To: khushisingh7205@yahoo.com`);
      } catch (emailError) {
        console.error('❌ Email sending error:', emailError.message);
        console.error('   Full error:', emailError);
        // Still return success to user even if email fails
        // You might want to log this to a database or file instead
      }
    } else {
      console.log(`⚠️  Feature request received for: ${featureName}`);
      console.log(`   Email not configured - EMAIL_USER: ${emailUser ? 'set' : 'not set'}, EMAIL_PASS: ${emailPass ? 'set' : 'not set'}`);
      // Log to console if email isn't configured
    }

    res.json({ 
      success: true, 
      message: 'Feature request submitted successfully.',
      featureName,
      userEmail: userEmail || null
    });
  } catch (error) {
    console.error('Feature request error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to submit feature request.' 
    });
  }
});

// Resume counter functions
// In serverless, use /tmp for writable files, otherwise use project root
const COUNTER_FILE = isServerless 
  ? path.join('/tmp', 'resume_counter.json')
  : path.join(__dirname, 'resume_counter.json');

function getResumeCount() {
  try {
    if (fs.existsSync(COUNTER_FILE)) {
      const data = fs.readFileSync(COUNTER_FILE, 'utf8');
      const counter = JSON.parse(data);
      return counter.count || 0;
    }
    return 0;
  } catch (error) {
    console.error('Error reading resume counter:', error);
    return 0;
  }
}

function incrementResumeCounter() {
  try {
    const currentCount = getResumeCount();
    const newCount = currentCount + 1;
    fs.writeFileSync(COUNTER_FILE, JSON.stringify({ count: newCount, lastUpdated: new Date().toISOString() }), 'utf8');
    console.log(`📊 Resume counter incremented to: ${newCount}`);
    return newCount;
  } catch (error) {
    console.error('Error incrementing resume counter:', error);
    return getResumeCount();
  }
}

// Get resume count
app.get('/api/resume-count', (req, res) => {
  try {
    const count = getResumeCount();
    res.json({ count });
  } catch (error) {
    console.error('Error getting resume count:', error);
    res.status(500).json({ error: 'Failed to get resume count' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Export for Vercel serverless functions
module.exports = app;

// Only listen if not in serverless environment
if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(` Server running on http://0.0.0.0:${PORT}`);
    if (process.env.OPENAI_API_KEY) {
      console.log(`✅ OpenAI API key is configured`);
    } else {
      console.log(`⚠️  WARNING: OPENAI_API_KEY is not set in your .env file`);
    }
  });
}

