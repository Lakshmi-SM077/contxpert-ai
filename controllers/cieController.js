const pool = require('../config/database');
const { sendTextMessage } = require('../services/whatsappService');
const { updateSession } = require('../services/sessionManager');

async function handleCIE(phoneNumber, text, session) {
  const studentId = session.data.studentId;

  try {
    const marks = await pool.query(
      `SELECT subject_name, test1, test2, test3, assignment_marks, cie_total
       FROM cie_marks WHERE student_id = $1 ORDER BY subject_name`,
      [studentId]
    );

    if (marks.rows.length === 0) {
      await sendTextMessage(phoneNumber, "No CIE marks found.");
      return;
    }

    let response = `📝 *CIE Marks Report*

`;
    response += `*Format: 3 CIE Tests + Assignment/Activity (20 marks)*
`;
    response += `*Total CIE: 50 marks | SEE: 50 marks*

`;

    marks.rows.forEach(row => {
      const cieTotal = row.cie_total || (row.test1 + row.test2 + row.test3 + row.assignment_marks);
      const status = cieTotal >= 25 ? '✅' : cieTotal >= 20 ? '⚠️' : '❌';
      response += `${status} *${row.subject_name}*
`;
      response += `   CIE Tests: T1:${row.test1} T2:${row.test2} T3:${row.test3}
`;
      response += `   Assignment/Activity: ${row.assignment_marks}/20
`;
      response += `   *CIE Total: ${cieTotal}/50*

`;
    });

    // Calculate overall CIE average
    const totalCIE = marks.rows.reduce((sum, r) => sum + (r.cie_total || r.test1 + r.test2 + r.test3 + r.assignment_marks), 0);
    const avgCIE = (totalCIE / marks.rows.length).toFixed(1);

    response += `📊 *Overall CIE Average: ${avgCIE}/50*

`;

    // Analysis
    const weakSubjects = marks.rows.filter(r => {
      const total = r.cie_total || r.test1 + r.test2 + r.test3 + r.assignment_marks;
      return total < 25;
    });

    if (weakSubjects.length > 0) {
      response += `⚠️ *Focus Areas:*
`;
      weakSubjects.forEach(s => {
        const total = s.cie_total || s.test1 + s.test2 + s.test3 + s.assignment_marks;
        const needed = 25 - total;
        response += `• ${s.subject_name}: need ${needed} more marks to reach 25/50
`;
      });
    } else {
      response += `✅ All subjects above 25/50 CIE average. Good going!
`;
    }

    response += `
📌 CIE (50) + SEE (50) = 100 marks total
`;
    response += `Minimum passing: 40% overall (40/100)`;

    await sendTextMessage(phoneNumber, response);
    await updateSession(phoneNumber, 'menu_shown', session.data);

  } catch (error) {
    console.error('[CIE] Error:', error);
    await sendTextMessage(phoneNumber, "Couldn't fetch marks. Try again later.");
  }
}

module.exports = { handleCIE };
