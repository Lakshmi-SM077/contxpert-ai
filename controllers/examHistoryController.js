const pool = require('../config/database');
const { sendTextMessage } = require('../services/whatsappService');
const { updateSession } = require('../services/sessionManager');

async function handleExamHistory(phoneNumber, text, session) {
  const studentId = session.data.studentId;

  try {
    // Get all exam history grouped by semester
    const history = await pool.query(
      `SELECT semester, course_code, course_name, credits, 
              cie_score, see_score, total_score, grade, grade_points,
              sgpa, cgpa, exam_month, exam_year
       FROM exam_history 
       WHERE student_id = $1 
       ORDER BY semester, course_code`,
      [studentId]
    );

    if (history.rows.length === 0) {
      await sendTextMessage(phoneNumber, 
        "No exam history found. Please contact the office if this seems incorrect.");
      return;
    }

    // Group by semester
    const bySemester = {};
    history.rows.forEach(row => {
      if (!bySemester[row.semester]) {
        bySemester[row.semester] = {
          courses: [],
          sgpa: row.sgpa,
          cgpa: row.cgpa,
          exam_month: row.exam_month,
          exam_year: row.exam_year
        };
      }
      bySemester[row.semester].courses.push(row);
    });

    let response = `📚 *Exam History & Results*

`;

    for (const [sem, data] of Object.entries(bySemester)) {
      response += `*Semester ${sem} (${data.exam_month || ''} ${data.exam_year || ''})*
`;
      response += `SGPA: *${data.sgpa}* | CGPA: *${data.cgpa}*

`;

      data.courses.forEach(course => {
        const gradeIcon = ['S', 'A', 'B'].includes(course.grade) ? '✅' : 
                          course.grade === 'C' ? '⚠️' : '❌';
        response += `${gradeIcon} *${course.course_code}* - ${course.course_name}
`;
        response += `   Credits: ${course.credits} | CIE: ${course.cie_score}/50 | SEE: ${course.see_score}/50
`;
        response += `   Total: ${course.total_score}/100 | Grade: *${course.grade}* (${course.grade_points} pts)

`;
      });

      response += `────────────────────

`;
    }

    // Overall summary
    const allCourses = history.rows;
    const totalCredits = allCourses.reduce((sum, c) => sum + c.credits, 0);
    const latestCGPA = allCourses[allCourses.length - 1]?.cgpa || 0;

    response += `📊 *Overall Summary*
`;
    response += `Total Credits Earned: ${totalCredits}
`;
    response += `Current CGPA: *${latestCGPA}*

`;

    // Grade legend
    response += `*Grade Scale:*
`;
    response += `S (90-100) | A (80-89) | B (70-79)
`;
    response += `C (60-69) | D (50-59) | F (<50)
`;

    await sendTextMessage(phoneNumber, response);
    await updateSession(phoneNumber, 'menu_shown', session.data);

  } catch (error) {
    console.error('[ExamHistory] Error:', error);
    await sendTextMessage(phoneNumber, "Couldn't fetch exam history. Try again later.");
  }
}

module.exports = { handleExamHistory };
