const { sendTextMessage, sendInteractiveButtons, sendListMessage } = require('../services/whatsappService');
const { updateSession } = require('../services/sessionManager');
const { detectIntent, generateResponse, retrieveContext } = require('../services/aiEngine');

const MENU_OPTIONS = [
  { id: 'attendance', title: '📊 Attendance', description: 'Check attendance record' },
  { id: 'marks', title: '📝 CIE Marks', description: 'View CIE + Assignment marks' },
  { id: 'exam_history', title: '📚 Exam History', description: 'Semester results, SGPA, CGPA' },
  { id: 'fee', title: '💳 Fee Status', description: 'Check fee payment status' },
  { id: 'timetable', title: '🗓 Timetable', description: 'View class schedule' },
  { id: 'certificate', title: '📄 Certificates', description: 'Request certificates' },
  { id: 'notification', title: '🔔 Notifications', description: 'Latest announcements' }
];

async function showMenu(phoneNumber, studentData) {
  const menuText = "Hi " + studentData.name + "! What would you like to check?\n\n" +
    MENU_OPTIONS.map(o => o.title + " — " + o.description).join("\n");

  await sendTextMessage(phoneNumber, menuText);
  await updateSession(phoneNumber, 'menu_shown', {});
}

async function handleMenuSelection(phoneNumber, text, session) {
  const intentResult = detectIntent(text);
  const studentData = session.data;

  const intent = intentResult.intent;

  switch (intent) {
    case 'attendance':
      await updateSession(phoneNumber, 'viewing_attendance', studentData);
      return 'attendance';

    case 'marks':
      await updateSession(phoneNumber, 'viewing_marks', studentData);
      return 'marks';

    case 'exam_history':
      await updateSession(phoneNumber, 'viewing_exam_history', studentData);
      return 'exam_history';

    case 'fee':
      await updateSession(phoneNumber, 'viewing_fee', studentData);
      return 'fee';

    case 'timetable':
      await updateSession(phoneNumber, 'viewing_timetable', studentData);
      return 'timetable';

    case 'certificate':
      await updateSession(phoneNumber, 'requesting_certificate', studentData);
      return 'certificate';

    case 'notification':
      await updateSession(phoneNumber, 'viewing_notifications', studentData);
      return 'notification';

    case 'help':
      await showMenu(phoneNumber, studentData);
      return 'menu';

    default:
      const context = retrieveContext(text);
      if (context.length > 0) {
        const topic = context[0].topic;
        if (['attendance', 'marks', 'fee', 'timetable', 'certificate', 'exam_history'].includes(topic)) {
          await updateSession(phoneNumber, 'viewing_' + topic, studentData);
          return topic;
        }
      }

      await sendTextMessage(phoneNumber,
        "I am not sure what you need. You can ask about:\n" +
        "• My attendance\n" +
        "• Show my CIE marks\n" +
        "• Exam history / results\n" +
        "• Fee status\n" +
        "• Today\'s timetable\n" +
        "• Request certificate\n" +
        "• Or type menu for options");
      return 'unknown';
  }
}

module.exports = { showMenu, handleMenuSelection, MENU_OPTIONS };
