# ✨ GPTailor

A powerful single-page web application that uses OpenAI GPT-4 to tailor resumes for specific job opportunities with AI precision, helping users optimize their applications.

## ✨ Features

### 📄 Multiple Input Methods
- **Text Input**: Paste job postings and resumes directly into text areas
- **PDF Upload**: Upload PDF files for both job postings and resumes with automatic text extraction
- **Drag & Drop**: Simply drag PDF files onto the upload areas

### 🤖 AI-Powered Analysis
- Uses OpenAI GPT-4 for intelligent resume-job matching
- Provides comprehensive analysis including:
  - Match summary and compatibility score
  - Missing keywords and skills identification
  - Specific suggestions for resume tailoring
  - Optional rewritten bullet points for better alignment

### 📊 User Analytics
- Real-time user count tracking using CountAPI
- Displays total number of users in the footer

### 🎨 Modern UI/UX
- Clean, responsive design that works on all devices
- Beautiful gradient background with card-based layout
- Smooth animations and hover effects
- Mobile-friendly interface
- Loading states and error handling

## 🚀 How to Use

1. **Open the App**: Open `index.html` in any modern web browser

2. **Add Your API Key**: Enter your OpenAI API key in the password field at the top

3. **Input Job Posting**: Choose one of two methods:
   - Click "Paste Text" and paste the job description
   - Click "Upload PDF" and upload a PDF file of the job posting

4. **Input Your Resume**: Choose one of two methods:
   - Click "Paste Text" and paste your resume content
   - Click "Upload PDF" and upload your resume PDF

5. **Get Analysis**: Click "Review Match" to receive AI-powered insights

6. **Review Results**: Read the comprehensive analysis and suggestions

## 🔧 Technical Details

### Dependencies
- **PDF.js**: For client-side PDF text extraction
- **OpenAI API**: For AI-powered resume analysis
- **CountAPI**: For user count tracking

### Browser Support
- Modern browsers with ES6+ support
- Chrome, Firefox, Safari, Edge (latest versions)

### Security Notes
- This is a demo application - API keys are handled client-side
- No data is stored or transmitted to external servers (except OpenAI and CountAPI)
- For production use, implement server-side API key management

## 📋 API Requirements

### OpenAI API Key
You'll need an OpenAI API key with access to GPT-4:
1. Sign up at [OpenAI](https://platform.openai.com/)
2. Generate an API key
3. Ensure you have credits/usage allowance

### Usage Costs
- Each analysis uses approximately 1000-2000 tokens
- Cost varies based on OpenAI's current pricing
- Monitor your usage in the OpenAI dashboard

## 🛠️ Features Breakdown

### Toggle Input Modes
- Switch between text input and file upload seamlessly
- Visual indicators show which mode is active
- Both modes provide the same analysis quality

### PDF Text Extraction
- Supports multi-page PDFs
- Preserves text formatting and structure
- Shows extraction progress and success/error states
- Handles various PDF formats and layouts

### Error Handling
- Comprehensive validation for all inputs
- Clear error messages for missing data
- Network error handling for API calls
- PDF extraction error recovery

### Responsive Design
- Desktop: Side-by-side layout for job posting and resume
- Mobile: Stacked layout with touch-friendly controls
- Tablet: Optimized spacing and button sizes

## 🎯 Use Cases

### Job Seekers
- Optimize resumes for specific job applications
- Identify missing skills and keywords
- Get suggestions for better bullet points
- Improve application success rates

### Career Counselors
- Help clients improve their resumes
- Provide data-driven feedback
- Compare multiple job opportunities
- Track improvement over time

### Recruiters
- Quickly assess candidate fit
- Identify key gaps in applications
- Provide feedback to candidates
- Streamline screening processes

## 🔄 Future Enhancements

- [ ] Support for multiple resume formats (Word, text files)
- [ ] Batch processing for multiple job applications
- [ ] Resume scoring and ranking system
- [ ] Integration with job boards
- [ ] User accounts and history tracking
- [ ] Advanced analytics and reporting

## 🤝 Contributing

This is a demo application, but suggestions and improvements are welcome:
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