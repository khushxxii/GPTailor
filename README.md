# ✨ GPTailor - AI Resume Review & Scoring

A powerful web application that uses OpenAI GPT-4 to review and score resumes, providing detailed feedback similar to professional resume review services. Get instant AI-powered analysis with actionable suggestions to improve your resume.

## ✨ Features

### 📊 Resume Scoring
- **Overall Score**: Get a score from 0-100 based on multiple criteria
- **Visual Score Gauge**: Circular progress indicator showing your resume's performance
- **Score Breakdown**: See how your resume compares to top resumes

### 🔍 Comprehensive Analysis
- **Top Fixes**: Prioritized list of issues to address
- **Completed Items**: Areas where your resume excels
- **Detailed Issues**: Specific problems with actionable fix suggestions
- **Category-based Feedback**: Organized by impact, skills, formatting, etc.

### 📄 Multiple Input Methods
- **PDF Upload**: Upload your resume PDF directly
- **Drag & Drop**: Simply drag PDF files onto the upload area
- **Automatic Text Extraction**: PDFs are automatically processed

### 🎨 Professional UI
- **Resume Worded-style Design**: Clean, professional interface
- **Side-by-side Layout**: View your resume and feedback simultaneously
- **Responsive Design**: Works on desktop, tablet, and mobile devices
- **Real-time Updates**: See your score and feedback instantly

## 🚀 Quick Start

### Prerequisites
- Node.js (v14 or higher)
- npm or yarn
- OpenAI API key

### Installation

1. **Clone or download this repository**

2. **Install dependencies**:
```bash
npm install
```

3. **Set up environment variables**:
```bash
cp env.example .env
```

4. **Edit `.env` file** and add your OpenAI API key:
```env
OPENAI_API_KEY=sk-your-openai-api-key-here
OPENAI_MODEL=gpt-4
PORT=3000
```

5. **Start the server**:
```bash
npm start
```

6. **Open your browser** and navigate to:
```
http://localhost:3000
```

### Development Mode

For development with auto-reload:
```bash
npm run dev
```

(Requires `nodemon` - install globally with `npm install -g nodemon` or it will use the local version)

## 📖 How to Use

1. **Upload Your Resume**: 
   - Click the upload area or drag & drop your PDF resume
   - The system will automatically extract text from your PDF

2. **Wait for Analysis**:
   - The AI will analyze your resume (takes 10-30 seconds)
   - You'll see a loading indicator during processing

3. **Review Your Score**:
   - Check your overall score (0-100) in the circular gauge
   - See where you stand compared to top resumes

4. **Review Feedback**:
   - **Top Fixes**: Most important issues to address first
   - **Completed**: Areas you're doing well in
   - **Issues**: Detailed problems with fix suggestions

5. **Make Improvements**:
   - Click "FIX →" buttons to see detailed suggestions
   - Update your resume based on feedback
   - Re-upload to get a new score

6. **Re-score**:
   - Click "Re-score Resume" button to upload an updated version
   - Track your improvement over time

## 🔧 Technical Details

### Architecture
- **Backend**: Node.js with Express
- **Frontend**: Vanilla JavaScript (no framework required)
- **AI**: OpenAI GPT-4 for resume analysis
- **PDF Processing**: pdf-parse library for text extraction

### API Endpoints

- `GET /` - Serve the main application
- `POST /api/analyze` - Analyze uploaded resume
  - Accepts: PDF file or text in request body
  - Returns: Analysis with score, issues, and feedback
- `GET /api/health` - Health check endpoint

### Dependencies
- **express**: Web server framework
- **cors**: Cross-origin resource sharing
- **multer**: File upload handling
- **pdf-parse**: PDF text extraction
- **openai**: OpenAI API client
- **dotenv**: Environment variable management

## 📋 API Requirements

### OpenAI API Key
You'll need an OpenAI API key with access to GPT-4:
1. Sign up at [OpenAI](https://platform.openai.com/)
2. Generate an API key from the dashboard
3. Ensure you have credits/usage allowance
4. Add the key to your `.env` file

### Usage Costs
- Each analysis uses approximately 1500-2500 tokens
- Cost varies based on OpenAI's current pricing (GPT-4)
- Monitor your usage in the OpenAI dashboard
- Consider using GPT-3.5-turbo for lower costs (change `OPENAI_MODEL` in `.env`)

## 🎯 Scoring Criteria

The AI evaluates resumes based on:

- **Content Quality (40%)**: Relevance, clarity, and impact of descriptions
- **Formatting & Structure (20%)**: Organization, readability, and professional appearance
- **ATS Optimization (20%)**: Keyword usage and compatibility with applicant tracking systems
- **Quantified Achievements (20%)**: Use of metrics, numbers, and measurable results

## 🛠️ Configuration

### Environment Variables

See `env.example` for all available options:

- `OPENAI_API_KEY` (required): Your OpenAI API key
- `OPENAI_MODEL` (optional): Model to use (default: `gpt-4`)
- `PORT` (optional): Server port (default: `3000`)
- `CONTEXT7_API_KEY` (optional): For context management features
- `PERPLEXITY_API_KEY` (optional): For research features

## 🎨 Customization

### Changing the Design
- Edit `public/index.html` for layout and styling
- All styles are in the `<style>` section
- Modify colors, fonts, and layout as needed

### Adjusting Analysis
- Edit the prompt in `server.js` (`analyzeResume` function)
- Modify scoring criteria and feedback structure
- Add custom analysis categories

## 🔒 Security Notes

- **API Keys**: Never commit `.env` file to version control
- **File Uploads**: PDFs are processed in memory and not stored
- **CORS**: Configure CORS settings in `server.js` for production
- **Rate Limiting**: Consider adding rate limiting for production use

## 📱 Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

## 🐛 Troubleshooting

### Server won't start
- Check that Node.js is installed: `node --version`
- Verify dependencies are installed: `npm install`
- Check that port 3000 is available

### Analysis fails
- Verify your OpenAI API key is correct in `.env`
- Check you have sufficient API credits
- Ensure the PDF is not corrupted or password-protected
- Check server logs for detailed error messages

### PDF upload issues
- Ensure file is a valid PDF
- Check file size (max 10MB)
- Try a different PDF if extraction fails

## 🔄 Future Enhancements

- [ ] Support for Word documents (.docx)
- [ ] Resume comparison over time
- [ ] Export feedback as PDF
- [ ] Integration with job boards
- [ ] User accounts and history
- [ ] Advanced ATS keyword analysis
- [ ] Industry-specific scoring
- [ ] Resume templates

## 🤝 Contributing

Suggestions and improvements are welcome:
1. Fork the repository
2. Make your changes
3. Test thoroughly
4. Submit a pull request

## 📄 License

This project is provided as-is for demonstration purposes. Feel free to use and modify for your own projects.

## ⚠️ Disclaimer

- GPTailor provides AI-generated suggestions and should not be the sole basis for career decisions
- Always review and customize AI suggestions to match your personal experience and goals
- Ensure compliance with privacy laws when handling personal resume data
- OpenAI API usage is subject to their terms of service and pricing
- Scores are estimates based on AI analysis and may not reflect actual recruiter opinions

## 📞 Support

For issues or questions:
- Check the troubleshooting section
- Review server logs for errors
- Ensure all dependencies are installed correctly
