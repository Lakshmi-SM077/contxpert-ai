const pool = require('../config/database');

async function columnExists(tableName, columnName) {
  const result = await pool.query(
    `SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2`,
    [tableName, columnName]
  );
  return result.rowCount > 0;
}

async function addColumnIfNotExists(tableName, columnName, definition) {
  if (await columnExists(tableName, columnName)) {
    return;
  }

  await pool.query(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
}

async function migrate() {
  console.log('Running migrations...\n');

  try {
    // Students table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS students (
        id SERIAL PRIMARY KEY,
        usn VARCHAR(20) UNIQUE NOT NULL,
        name VARCHAR(100) NOT NULL,
        dob DATE NOT NULL,
        department VARCHAR(50) NOT NULL,
        section VARCHAR(10) NOT NULL,
        semester INTEGER NOT NULL,
        phone_number VARCHAR(20),
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await addColumnIfNotExists('students', 'phone_number', 'VARCHAR(20)');
    // Identity values are canonicalised so a USN or mobile number cannot be
    // registered twice using a different case or formatting.
    await pool.query(`UPDATE students SET usn = UPPER(TRIM(usn))`);
    await pool.query(`UPDATE students SET phone_number = NULLIF(regexp_replace(phone_number, '\\D', '', 'g'), '') WHERE phone_number IS NOT NULL`);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS students_usn_case_insensitive_unique ON students (UPPER(usn))`);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS students_phone_number_unique ON students (phone_number) WHERE phone_number IS NOT NULL`);
    console.log('students');

    // Sessions table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id SERIAL PRIMARY KEY,
        phone_number VARCHAR(20) UNIQUE NOT NULL,
        state VARCHAR(50) DEFAULT 'unregistered',
        data JSONB DEFAULT '{}',
        last_activity TIMESTAMP DEFAULT NOW()
      )
    `);
    await addColumnIfNotExists('sessions', 'last_activity', 'TIMESTAMP DEFAULT NOW()');
    console.log('sessions');

    // Attendance table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS attendance (
        id SERIAL PRIMARY KEY,
        student_id INTEGER REFERENCES students(id),
        subject_name VARCHAR(100) NOT NULL,
        total_classes INTEGER DEFAULT 0,
        attended_classes INTEGER DEFAULT 0,
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await addColumnIfNotExists('attendance', 'subject_name', 'VARCHAR(100) NOT NULL');
    await addColumnIfNotExists('attendance', 'total_classes', 'INTEGER DEFAULT 0');
    await addColumnIfNotExists('attendance', 'attended_classes', 'INTEGER DEFAULT 0');
    await addColumnIfNotExists('attendance', 'updated_at', 'TIMESTAMP DEFAULT NOW()');
    console.log('attendance');

    // CIE marks table - UPDATED: 3 CIE tests + 20 marks assignment/activity
    await pool.query(`
      CREATE TABLE IF NOT EXISTS cie_marks (
        id SERIAL PRIMARY KEY,
        student_id INTEGER REFERENCES students(id),
        subject_name VARCHAR(100) NOT NULL,
        test1 INTEGER DEFAULT 0,
        test2 INTEGER DEFAULT 0,
        test3 INTEGER DEFAULT 0,
        assignment_marks INTEGER DEFAULT 0,
        cie_total INTEGER DEFAULT 0,
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await addColumnIfNotExists('cie_marks', 'subject_name', 'VARCHAR(100) NOT NULL');
    await addColumnIfNotExists('cie_marks', 'test1', 'INTEGER DEFAULT 0');
    await addColumnIfNotExists('cie_marks', 'test2', 'INTEGER DEFAULT 0');
    await addColumnIfNotExists('cie_marks', 'test3', 'INTEGER DEFAULT 0');
    await addColumnIfNotExists('cie_marks', 'assignment_marks', 'INTEGER DEFAULT 0');
    await addColumnIfNotExists('cie_marks', 'cie_total', 'INTEGER DEFAULT 0');
    await addColumnIfNotExists('cie_marks', 'updated_at', 'TIMESTAMP DEFAULT NOW()');
    console.log('cie_marks (with assignment/activity)');

    // Exam History table - NEW
    await pool.query(`
      CREATE TABLE IF NOT EXISTS exam_history (
        id SERIAL PRIMARY KEY,
        student_id INTEGER REFERENCES students(id),
        semester INTEGER NOT NULL,
        course_code VARCHAR(20) NOT NULL,
        course_name VARCHAR(100) NOT NULL,
        credits INTEGER NOT NULL,
        cie_score INTEGER DEFAULT 0,
        see_score INTEGER DEFAULT 0,
        total_score INTEGER DEFAULT 0,
        grade VARCHAR(5) DEFAULT 'F',
        grade_points INTEGER DEFAULT 0,
        sgpa DECIMAL(3,2) DEFAULT 0.00,
        cgpa DECIMAL(3,2) DEFAULT 0.00,
        exam_month VARCHAR(20),
        exam_year INTEGER,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await addColumnIfNotExists('exam_history', 'semester', 'INTEGER NOT NULL');
    await addColumnIfNotExists('exam_history', 'course_code', 'VARCHAR(20) NOT NULL');
    await addColumnIfNotExists('exam_history', 'course_name', 'VARCHAR(100) NOT NULL');
    await addColumnIfNotExists('exam_history', 'credits', 'INTEGER NOT NULL');
    await addColumnIfNotExists('exam_history', 'cie_score', 'INTEGER DEFAULT 0');
    await addColumnIfNotExists('exam_history', 'see_score', 'INTEGER DEFAULT 0');
    await addColumnIfNotExists('exam_history', 'total_score', 'INTEGER DEFAULT 0');
    await addColumnIfNotExists('exam_history', 'grade', "VARCHAR(5) DEFAULT 'F'");
    await addColumnIfNotExists('exam_history', 'grade_points', 'INTEGER DEFAULT 0');
    await addColumnIfNotExists('exam_history', 'sgpa', 'DECIMAL(3,2) DEFAULT 0.00');
    await addColumnIfNotExists('exam_history', 'cgpa', 'DECIMAL(3,2) DEFAULT 0.00');
    await addColumnIfNotExists('exam_history', 'exam_month', 'VARCHAR(20)');
    await addColumnIfNotExists('exam_history', 'exam_year', 'INTEGER');
    await addColumnIfNotExists('exam_history', 'created_at', 'TIMESTAMP DEFAULT NOW()');
    console.log('exam_history');

    // Fee status table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS fee_status (
        id SERIAL PRIMARY KEY,
        student_id INTEGER REFERENCES students(id),
        total_amount INTEGER DEFAULT 0,
        paid_amount INTEGER DEFAULT 0,
        due_amount INTEGER DEFAULT 0,
        last_payment_date DATE,
        status VARCHAR(20) DEFAULT 'unpaid',
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await addColumnIfNotExists('fee_status', 'total_amount', 'INTEGER DEFAULT 0');
    await addColumnIfNotExists('fee_status', 'paid_amount', 'INTEGER DEFAULT 0');
    await addColumnIfNotExists('fee_status', 'due_amount', 'INTEGER DEFAULT 0');
    await addColumnIfNotExists('fee_status', 'last_payment_date', 'DATE');
    await addColumnIfNotExists('fee_status', 'status', "VARCHAR(20) DEFAULT 'unpaid'");
    await addColumnIfNotExists('fee_status', 'updated_at', 'TIMESTAMP DEFAULT NOW()');
    console.log('fee_status');

    // Timetable table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS timetable (
        id SERIAL PRIMARY KEY,
        department VARCHAR(50) NOT NULL,
        section VARCHAR(10) NOT NULL,
        semester INTEGER NOT NULL,
        day VARCHAR(20) NOT NULL,
        period INTEGER NOT NULL,
        subject_name VARCHAR(100) NOT NULL,
        room VARCHAR(20) NOT NULL,
        time_slot VARCHAR(50) NOT NULL
      )
    `);
    await addColumnIfNotExists('timetable', 'department', 'VARCHAR(50) NOT NULL');
    await addColumnIfNotExists('timetable', 'section', 'VARCHAR(10) NOT NULL');
    await addColumnIfNotExists('timetable', 'semester', 'INTEGER NOT NULL');
    await addColumnIfNotExists('timetable', 'day', 'VARCHAR(20) NOT NULL');
    await addColumnIfNotExists('timetable', 'period', 'INTEGER NOT NULL');
    await addColumnIfNotExists('timetable', 'subject_name', 'VARCHAR(100) NOT NULL');
    await addColumnIfNotExists('timetable', 'room', 'VARCHAR(20) NOT NULL');
    await addColumnIfNotExists('timetable', 'time_slot', 'VARCHAR(50) NOT NULL');
    console.log('timetable');

    // Certificate requests table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS certificate_requests (
        id SERIAL PRIMARY KEY,
        student_id INTEGER REFERENCES students(id),
        type VARCHAR(50) NOT NULL,
        amount INTEGER NOT NULL,
        status VARCHAR(50) DEFAULT 'awaiting_payment',
        payment_link_id VARCHAR(100),
        payment_id VARCHAR(100),
        paid_at TIMESTAMP,
        ready_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await addColumnIfNotExists('certificate_requests', 'student_id', 'INTEGER REFERENCES students(id)');
    await addColumnIfNotExists('certificate_requests', 'type', 'VARCHAR(50) NOT NULL');
    await addColumnIfNotExists('certificate_requests', 'amount', 'INTEGER NOT NULL');
    await addColumnIfNotExists('certificate_requests', 'status', "VARCHAR(50) DEFAULT 'awaiting_payment'");
    await addColumnIfNotExists('certificate_requests', 'payment_link_id', 'VARCHAR(100)');
    await addColumnIfNotExists('certificate_requests', 'payment_id', 'VARCHAR(100)');
    await addColumnIfNotExists('certificate_requests', 'paid_at', 'TIMESTAMP');
    await addColumnIfNotExists('certificate_requests', 'ready_at', 'TIMESTAMP');
    await addColumnIfNotExists('certificate_requests', 'created_at', 'TIMESTAMP DEFAULT NOW()');
    console.log('certificate_requests');

    // Notifications table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        title VARCHAR(200) NOT NULL,
        message TEXT NOT NULL,
        type VARCHAR(20) DEFAULT 'general',
        target_student_id INTEGER REFERENCES students(id),
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await addColumnIfNotExists('notifications', 'title', 'VARCHAR(200) NOT NULL');
    await addColumnIfNotExists('notifications', 'message', 'TEXT NOT NULL');
    await addColumnIfNotExists('notifications', 'type', "VARCHAR(20) DEFAULT 'general'");
    await addColumnIfNotExists('notifications', 'target_student_id', 'INTEGER REFERENCES students(id)');
    await addColumnIfNotExists('notifications', 'created_at', 'TIMESTAMP DEFAULT NOW()');
    console.log('notifications');

    // Analytics/logs table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS analytics (
        id SERIAL PRIMARY KEY,
        phone_number VARCHAR(20),
        intent VARCHAR(50),
        confidence FLOAT,
        response_source VARCHAR(20),
        message TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await addColumnIfNotExists('analytics', 'phone_number', 'VARCHAR(20)');
    await addColumnIfNotExists('analytics', 'intent', 'VARCHAR(50)');
    await addColumnIfNotExists('analytics', 'confidence', 'FLOAT');
    await addColumnIfNotExists('analytics', 'response_source', 'VARCHAR(20)');
    await addColumnIfNotExists('analytics', 'message', 'TEXT');
    await addColumnIfNotExists('analytics', 'created_at', 'TIMESTAMP DEFAULT NOW()');
    console.log('analytics');

    console.log('\nAll migrations completed!');
    process.exit(0);
  } catch (error) {
    console.error('Migration error:', error);
    process.exit(1);
  }
}

migrate();
