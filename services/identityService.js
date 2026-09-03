function normalizePhone(phoneNumber = '') {
  return String(phoneNumber).replace(/\D/g, '');
}

function normalizeUsn(usn = '') {
  return String(usn).trim().toUpperCase();
}

function studentSessionData(student) {
  return {
    studentId: student.id,
    usn: student.usn,
    name: student.name,
    dept: student.department,
    section: student.section,
    semester: student.semester
  };
}

module.exports = { normalizePhone, normalizeUsn, studentSessionData };
