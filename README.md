# ContXpert AI — WhatsApp-Based Student Support Chatbot

> **AI-Powered | NLP-Enabled | LLM-Integrated | RAG-Enhanced**

ContXpert AI is a smart WhatsApp chatbot for student support using **NLP**, **LLM**, and **RAG**.

## Features (8 Modules)

| # | Feature | AI Component |
|---|---------|-------------|
| 1 | **Greeting** | NLP intent detection (95% confidence) |
| 2 | **Registration** | NER extracts USN + DOB from natural text |
| 3 | **Attendance** | RAG retrieves college rules + threshold analysis |
| 4 | **CIE Marks** | 3 CIE tests + 20 marks Assignment/Activity = 50 marks total |
| 5 | **Exam History** | Full semester results: CIE, SEE, Grade, SGPA, CGPA |
| 6 | **Fee Status** | Payment tracking + deadline alerts |
| 7 | **Timetable** | Auto-detects "today" by dept/section/semester |
| 8 | **Certificates** | Bonafide, Study, Fee Structure, Migration, Exam History |
| 9 | **Notifications** | General + personalized + urgent alerts |
| 10 | **Admin Dashboard** | Certificate queue + one-click AI notification |

## CIE Marks Structure

```
CIE Total = 50 marks
├── CIE Test 1: 10 marks
├── CIE Test 2: 10 marks
├── CIE Test 3: 10 marks
└── Assignment/Activity: 20 marks

SEE = 50 marks (Semester End Exam)
Total = CIE (50) + SEE (50) = 100 marks

Grade Scale:
S (90-100) = 10 pts | A (80-89) = 8 pts | B (70-79) = 7 pts
C (60-69) = 6 pts | D (50-59) = 5 pts | F (<50) = 0 pts
```

## Exam History Display

```
Semester 1 (Jun 2023)
├── 18MAT11 - Engineering Mathematics-I | 4 credits
│   CIE: 42/50 | SEE: 38/50 | Total: 80/100 | Grade: A (8 pts)
├── 18PHY12 - Engineering Physics | 4 credits
│   CIE: 38/50 | SEE: 35/50 | Total: 73/100 | Grade: B (7 pts)
...
SGPA: 7.80 | CGPA: 7.80
```

## Certificate Types

| Certificate | Fee |
|-------------|-----|
| Bonafide Certificate | ₹150 |
| Study Certificate | ₹100 |
| Fee Structure Certificate | ₹100 |
| Migration Certificate | ₹200 |
| Exam History Certificate | ₹150 |

## Quick Start

```bash
cd contxpert-ai
npm install
cp .env.example .env
# Edit .env with your credentials
npm run migrate
npm run seed
npm run test
npm start
```

## Database Schema

```
students (usn, name, dob, dept, section, semester)
sessions (phone, state, data, history)
attendance (student_id, subject, total, attended)
cie_marks (student_id, subject, test1, test2, test3, assignment_marks, cie_total)
exam_history (student_id, sem, course_code, course_name, credits, cie_score, see_score, total_score, grade, grade_points, sgpa, cgpa)
fee_status (student_id, total, paid, due, status)
timetable (dept, section, sem, day, period, subject, room, time)
certificate_requests (student_id, type, amount, status)
notifications (title, message, type, target)
analytics (phone, intent, confidence, source, message)
```

## AI Components

| Component | Technology | File |
|-----------|-----------|------|
| Intent Detection | compromise.js + natural.js | `services/aiEngine.js` |
| Named Entity Recognition | compromise.js NER | `services/aiEngine.js` |
| Response Generation | Groq LLM API | `services/aiEngine.js` |
| RAG | TF-IDF + knowledge base | `services/aiEngine.js` |
| Context Awareness | Session history | `services/sessionManager.js` |

## Team
- Jagruth B N (4MC22CS070)
- Gowtham V (4MC23CS052)
- Lakshmi S M (4MC23CS077)
- Lekhana B S (4MC23CS078)
- Guide: Dr. Geetha Kiran A
