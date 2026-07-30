const pool = require('../config/database');

async function seed() {
  console.log('Seeding data...\n');

  try {
    await pool.query('TRUNCATE TABLE analytics, notifications, certificate_requests, timetable, fee_status, exam_history, cie_marks, attendance, sessions CASCADE');
    await pool.query('DELETE FROM students');

    // Seed students
    const students = [
      { usn: '4MC22CS070', name: 'Rakesh H N', dob: '2004-03-14', dept: 'CSE', section: 'B', sem: 6 },
      { usn: '4MC22CS071', name: 'Priya S', dob: '2004-06-22', dept: 'CSE', section: 'B', sem: 6 },
      { usn: '4MC22CS072', name: 'Arun Kumar', dob: '2003-11-05', dept: 'CSE', section: 'A', sem: 6 },
      { usn: '4MC23CS052', name: 'Gowtham V', dob: '2004-01-15', dept: 'CSE', section: 'A', sem: 4 },
      { usn: '4MC23CS077', name: 'Lakshmi S M', dob: '2004-01-12', dept: 'CSE', section: 'B', sem: 6 },
      { usn: '4MC23CS078', name: 'Lekhana B S', dob: '2004-12-03', dept: 'CSE', section: 'B', sem: 4 }
    ];

    for (const s of students) {
      await pool.query(
        `INSERT INTO students (usn, name, dob, department, section, semester)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [s.usn, s.name, s.dob, s.dept, s.section, s.sem]
      );
    }
    console.log(`${students.length} students seeded`);

    // Get Rakesh's ID
    const rakesh = await pool.query("SELECT id FROM students WHERE usn = '4MC22CS070'");
    const rakeshId = rakesh.rows[0].id;

    // Seed attendance
    const attendanceData = [
      { subject: 'Machine Learning', total: 40, attended: 28 },
      { subject: 'Web Technology', total: 38, attended: 32 },
      { subject: 'Computer Networks', total: 42, attended: 35 },
      { subject: 'Cloud Computing', total: 36, attended: 30 },
      { subject: 'Software Engineering', total: 40, attended: 25 }
    ];

    for (const a of attendanceData) {
      await pool.query(
        `INSERT INTO attendance (student_id, subject_name, total_classes, attended_classes)
         VALUES ($1, $2, $3, $4)`,
        [rakeshId, a.subject, a.total, a.attended]
      );
    }
    console.log('Attendance seeded');

    // Seed CIE marks - UPDATED: 3 tests + 20 assignment/activity = 50 marks
    const cieData = [
      { subject: 'Machine Learning', t1: 12, t2: 10, t3: 14, assignment: 16 },
      { subject: 'Web Technology', t1: 15, t2: 14, t3: 13, assignment: 18 },
      { subject: 'Computer Networks', t1: 11, t2: 12, t3: 10, assignment: 15 },
      { subject: 'Cloud Computing', t1: 14, t2: 13, t3: 15, assignment: 17 },
      { subject: 'Software Engineering', t1: 8, t2: 10, t3: 11, assignment: 14 }
    ];

    for (const c of cieData) {
      const total = c.t1 + c.t2 + c.t3 + c.assignment;
      await pool.query(
        `INSERT INTO cie_marks (student_id, subject_name, test1, test2, test3, assignment_marks, cie_total)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [rakeshId, c.subject, c.t1, c.t2, c.t3, c.assignment, total]
      );
    }
    console.log('CIE marks seeded (3 tests + 20 assignment/activity)');

    // Seed EXAM HISTORY - NEW
    const examHistoryData = [
      // Semester 1
      { sem: 1, code: '18MAT11', name: 'Engineering Mathematics-I', credits: 4, cie: 42, see: 38, total: 80, grade: 'A', gp: 8, sgpa: 7.80, cgpa: 7.80, month: 'Jun', year: 2023 },
      { sem: 1, code: '18PHY12', name: 'Engineering Physics', credits: 4, cie: 38, see: 35, total: 73, grade: 'B', gp: 7, sgpa: 7.80, cgpa: 7.80, month: 'Jun', year: 2023 },
      { sem: 1, code: '18ELE13', name: 'Basic Electrical Engineering', credits: 3, cie: 40, see: 40, total: 80, grade: 'A', gp: 8, sgpa: 7.80, cgpa: 7.80, month: 'Jun', year: 2023 },
      { sem: 1, code: '18CIV14', name: 'Elements of Civil Engineering', credits: 3, cie: 35, see: 32, total: 67, grade: 'B', gp: 7, sgpa: 7.80, cgpa: 7.80, month: 'Jun', year: 2023 },
      { sem: 1, code: '18EGDL15', name: 'Engineering Graphics', credits: 3, cie: 45, see: 42, total: 87, grade: 'S', gp: 10, sgpa: 7.80, cgpa: 7.80, month: 'Jun', year: 2023 },

      // Semester 2
      { sem: 2, code: '18MAT21', name: 'Engineering Mathematics-II', credits: 4, cie: 40, see: 36, total: 76, grade: 'A', gp: 8, sgpa: 7.60, cgpa: 7.70, month: 'Dec', year: 2023 },
      { sem: 2, code: '18CHE22', name: 'Engineering Chemistry', credits: 4, cie: 36, see: 34, total: 70, grade: 'B', gp: 7, sgpa: 7.60, cgpa: 7.70, month: 'Dec', year: 2023 },
      { sem: 2, code: '18CPS23', name: 'C Programming', credits: 3, cie: 44, see: 45, total: 89, grade: 'S', gp: 10, sgpa: 7.60, cgpa: 7.70, month: 'Dec', year: 2023 },
      { sem: 2, code: '18ELN24', name: 'Basic Electronics', credits: 3, cie: 38, see: 35, total: 73, grade: 'B', gp: 7, sgpa: 7.60, cgpa: 7.70, month: 'Dec', year: 2023 },
      { sem: 2, code: '18ME25', name: 'Elements of Mechanical Engineering', credits: 3, cie: 34, see: 30, total: 64, grade: 'C', gp: 6, sgpa: 7.60, cgpa: 7.70, month: 'Dec', year: 2023 },

      // Semester 3
      { sem: 3, code: '18CS31', name: 'Data Structures', credits: 4, cie: 42, see: 40, total: 82, grade: 'S', gp: 10, sgpa: 8.20, cgpa: 7.87, month: 'Jun', year: 2024 },
      { sem: 3, code: '18CS32', name: 'Object Oriented Programming', credits: 4, cie: 40, see: 38, total: 78, grade: 'A', gp: 8, sgpa: 8.20, cgpa: 7.87, month: 'Jun', year: 2024 },
      { sem: 3, code: '18CS33', name: 'Digital Logic Design', credits: 3, cie: 38, see: 36, total: 74, grade: 'B', gp: 7, sgpa: 8.20, cgpa: 7.87, month: 'Jun', year: 2024 },
      { sem: 3, code: '18CS34', name: 'Discrete Mathematics', credits: 3, cie: 41, see: 39, total: 80, grade: 'A', gp: 8, sgpa: 8.20, cgpa: 7.87, month: 'Jun', year: 2024 },
      { sem: 3, code: '18CS35', name: 'Computer Organization', credits: 3, cie: 36, see: 34, total: 70, grade: 'B', gp: 7, sgpa: 8.20, cgpa: 7.87, month: 'Jun', year: 2024 },

      // Semester 4
      { sem: 4, code: '18CS41', name: 'Database Management Systems', credits: 4, cie: 43, see: 41, total: 84, grade: 'S', gp: 10, sgpa: 8.00, cgpa: 7.95, month: 'Dec', year: 2024 },
      { sem: 4, code: '18CS42', name: 'Operating Systems', credits: 4, cie: 39, see: 37, total: 76, grade: 'A', gp: 8, sgpa: 8.00, cgpa: 7.95, month: 'Dec', year: 2024 },
      { sem: 4, code: '18CS43', name: 'Computer Networks', credits: 3, cie: 37, see: 35, total: 72, grade: 'B', gp: 7, sgpa: 8.00, cgpa: 7.95, month: 'Dec', year: 2024 },
      { sem: 4, code: '18CS44', name: 'Automata Theory', credits: 3, cie: 40, see: 38, total: 78, grade: 'A', gp: 8, sgpa: 8.00, cgpa: 7.95, month: 'Dec', year: 2024 },
      { sem: 4, code: '18CS45', name: 'Software Engineering', credits: 3, cie: 35, see: 33, total: 68, grade: 'B', gp: 7, sgpa: 8.00, cgpa: 7.95, month: 'Dec', year: 2024 },

      // Semester 5
      { sem: 5, code: '18CS51', name: 'Machine Learning', credits: 4, cie: 40, see: 38, total: 78, grade: 'A', gp: 8, sgpa: 7.80, cgpa: 7.92, month: 'Jun', year: 2025 },
      { sem: 5, code: '18CS52', name: 'Web Technology', credits: 4, cie: 42, see: 40, total: 82, grade: 'S', gp: 10, sgpa: 7.80, cgpa: 7.92, month: 'Jun', year: 2025 },
      { sem: 5, code: '18CS53', name: 'Cloud Computing', credits: 3, cie: 38, see: 36, total: 74, grade: 'B', gp: 7, sgpa: 7.80, cgpa: 7.92, month: 'Jun', year: 2025 },
      { sem: 5, code: '18CS54', name: 'Cyber Security', credits: 3, cie: 36, see: 34, total: 70, grade: 'B', gp: 7, sgpa: 7.80, cgpa: 7.92, month: 'Jun', year: 2025 },
      { sem: 5, code: '18CS55', name: 'Mobile App Development', credits: 3, cie: 41, see: 39, total: 80, grade: 'A', gp: 8, sgpa: 7.80, cgpa: 7.92, month: 'Jun', year: 2025 }
    ];

    for (const e of examHistoryData) {
      await pool.query(
        `INSERT INTO exam_history (student_id, semester, course_code, course_name, credits, 
         cie_score, see_score, total_score, grade, grade_points, sgpa, cgpa, exam_month, exam_year)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [rakeshId, e.sem, e.code, e.name, e.credits, e.cie, e.see, e.total, e.grade, e.gp, e.sgpa, e.cgpa, e.month, e.year]
      );
    }
    console.log('Exam history seeded (5 semesters, 25 courses)');

    // Seed fee status
    await pool.query(
      `INSERT INTO fee_status (student_id, total_amount, paid_amount, due_amount, last_payment_date, status)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [rakeshId, 85000, 60000, 25000, '2025-08-15', 'partial']
    );
    console.log('Fee status seeded');

    // Seed timetable
    const timetableData = [
      { day: 'Monday', period: 1, subject: 'Machine Learning', room: 'LT-301', time: '9:00-10:00' },
      { day: 'Monday', period: 2, subject: 'Web Technology', room: 'LT-302', time: '10:00-11:00' },
      { day: 'Monday', period: 3, subject: 'Computer Networks', room: 'LT-303', time: '11:00-12:00' },
      { day: 'Monday', period: 4, subject: 'Cloud Computing Lab', room: 'Lab-2', time: '1:00-3:00' },
      { day: 'Tuesday', period: 1, subject: 'Software Engineering', room: 'LT-301', time: '9:00-10:00' },
      { day: 'Tuesday', period: 2, subject: 'Machine Learning', room: 'LT-302', time: '10:00-11:00' },
      { day: 'Tuesday', period: 3, subject: 'Web Technology Lab', room: 'Lab-1', time: '11:00-1:00' },
      { day: 'Wednesday', period: 1, subject: 'Computer Networks', room: 'LT-301', time: '9:00-10:00' },
      { day: 'Wednesday', period: 2, subject: 'Cloud Computing', room: 'LT-302', time: '10:00-11:00' },
      { day: 'Wednesday', period: 3, subject: 'Software Engineering', room: 'LT-303', time: '11:00-12:00' }
    ];

    for (const t of timetableData) {
      await pool.query(
        `INSERT INTO timetable (department, section, semester, day, period, subject_name, room, time_slot)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        ['CSE', 'B', 6, t.day, t.period, t.subject, t.room, t.time]
      );
    }
    console.log('Timetable seeded');

    // Seed notifications
    const notifications = [
      { title: 'CIE-2 Schedule', message: 'CIE-2 exams start from Aug 25. Check timetable.', type: 'academic' },
      { title: 'Fee Payment Reminder', message: 'Last date for fee payment is Aug 15. Late fee applies after.', type: 'urgent' },
      { title: 'Holiday Notice', message: 'Independence Day holiday on Aug 15.', type: 'general' }
    ];

    for (const n of notifications) {
      await pool.query(
        `INSERT INTO notifications (title, message, type)
         VALUES ($1, $2, $3)`,
        [n.title, n.message, n.type]
      );
    }
    console.log('Notifications seeded');

    console.log('\nSeed complete! Test with USN: 4MC22CS070, DOB: 14-03-2004');
    console.log('Features: Attendance, CIE (3 tests + 20 assignment), Exam History (5 sem), Fee, Timetable, Certificates, Notifications');
    process.exit(0);
  } catch (error) {
    console.error('Seed error:', error);
    process.exit(1);
  }
}

seed();
