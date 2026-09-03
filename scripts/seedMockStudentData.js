const pool = require('../config/database');

const SUBJECTS = [
  'Data Structures', 'Database Management Systems', 'Computer Networks',
  'Web Technology', 'Software Engineering'
];

function score(seed, min, range) {
  return min + ((seed * 17 + 11) % range);
}

async function hasRows(table, studentId) {
  const result = await pool.query(`SELECT 1 FROM ${table} WHERE student_id = $1 LIMIT 1`, [studentId]);
  return result.rowCount > 0;
}

async function seedStudentData(student, index) {
  if (!await hasRows('attendance', student.id)) {
    for (const [subjectIndex, subject] of SUBJECTS.entries()) {
      const total = 34 + ((index + subjectIndex) % 9);
      const attended = Math.min(total, score(index + subjectIndex, 24, 15));
      await pool.query(
        `INSERT INTO attendance (student_id, subject_name, total_classes, attended_classes)
         VALUES ($1, $2, $3, $4)`,
        [student.id, subject, total, attended]
      );
    }
  }

  if (!await hasRows('cie_marks', student.id)) {
    for (const [subjectIndex, subject] of SUBJECTS.entries()) {
      const test1 = score(index + subjectIndex, 9, 8);
      const test2 = score(index + subjectIndex + 2, 9, 8);
      const test3 = score(index + subjectIndex + 4, 9, 8);
      const assignment = score(index + subjectIndex + 1, 12, 8);
      await pool.query(
        `INSERT INTO cie_marks (student_id, subject_name, test1, test2, test3, assignment_marks, cie_total)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [student.id, subject, test1, test2, test3, assignment, test1 + test2 + test3 + assignment]
      );
    }
  }

  if (!await hasRows('exam_history', student.id)) {
    const completedSemester = Math.max(1, student.semester - 1);
    for (const [subjectIndex, subject] of SUBJECTS.slice(0, 3).entries()) {
      const cie = score(index + subjectIndex, 30, 18);
      const see = score(index + subjectIndex + 3, 30, 23);
      const total = cie + see;
      const gradePoints = total >= 85 ? 10 : total >= 75 ? 8 : total >= 65 ? 7 : 6;
      const grade = gradePoints === 10 ? 'S' : gradePoints === 8 ? 'A' : gradePoints === 7 ? 'B' : 'C';
      await pool.query(
        `INSERT INTO exam_history (student_id, semester, course_code, course_name, credits,
         cie_score, see_score, total_score, grade, grade_points, sgpa, cgpa, exam_month, exam_year)
         VALUES ($1, $2, $3, $4, 4, $5, $6, $7, $8, $9, $10, $11, 'Jun', 2025)`,
        [student.id, completedSemester, `CS${completedSemester}${subjectIndex + 1}01`, subject,
          cie, see, total, grade, gradePoints, (gradePoints - 0.2).toFixed(2), (gradePoints - 0.4).toFixed(2)]
      );
    }
  }

  if (!await hasRows('fee_status', student.id)) {
    const total = 85000;
    const paid = index % 3 === 0 ? 85000 : index % 3 === 1 ? 60000 : 40000;
    await pool.query(
      `INSERT INTO fee_status (student_id, total_amount, paid_amount, due_amount, last_payment_date, status)
       VALUES ($1, $2, $3, $4, '2025-08-15', $5)`,
      [student.id, total, paid, total - paid, paid === total ? 'paid' : 'partial']
    );
  }
}

async function seedTimetable(department, section, semester) {
  const exists = await pool.query(
    `SELECT 1 FROM timetable WHERE department = $1 AND section = $2 AND semester = $3 LIMIT 1`,
    [department, section, semester]
  );
  if (exists.rowCount) return;

  for (const [index, subject] of SUBJECTS.entries()) {
    await pool.query(
      `INSERT INTO timetable (department, section, semester, day, period, subject_name, room, time_slot)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [department, section, semester, ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'][index],
        index + 1, subject, `CSE-${201 + index}`, `${9 + index}:00-${10 + index}:00`]
    );
  }
}

async function seedMockStudentData() {
  try {
    const students = await pool.query(
      'SELECT id, usn, department, section, semester FROM students ORDER BY usn LIMIT 20'
    );
    for (const [index, student] of students.rows.entries()) {
      await seedStudentData(student, index + 1);
      await seedTimetable(student.department, student.section, student.semester);
    }
    console.log(`Mock academic data ensured for ${students.rowCount} students.`);
  } catch (error) {
    console.error('Mock data seed error:', error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

seedMockStudentData();
