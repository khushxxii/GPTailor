const express = require('express');
const cors = require('cors');
const multer = require('multer');
const pdf = require('pdf-parse');
const OpenAI = require('openai');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes - must be before static to override default index.html
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/landing.html');
});

app.get('/tailor', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

app.use(express.static('public', { index: false }));

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

    if (!resumeText || resumeText.trim().length < 50) {
      return res.status(400).json({ error: 'Resume text is too short. Please provide a valid resume.' });
    }

    if (!jobPostingText || jobPostingText.trim().length < 50) {
      return res.status(400).json({ error: 'Job posting text is too short. Please provide a valid job description.' });
    }

    // Analyze resume against job posting
    const analysis = await analyzeResume(resumeText, jobPostingText);

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

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  if (process.env.OPENAI_API_KEY) {
    console.log(`✅ OpenAI API key is configured`);
  } else {
    console.log(`⚠️  WARNING: OPENAI_API_KEY is not set in your .env file`);
  }
});

