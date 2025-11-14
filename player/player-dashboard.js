// Get elements
const playerNameElement = document.getElementById("player-name");
const logoutBtn = document.getElementById("logout-btn");
const markAttendanceBtn = document.getElementById("mark-attendance");
const attendanceMessage = document.getElementById("attendance-message");
const attendanceList = document.getElementById("attendance-list");

// Get user info from localStorage
const email = localStorage.getItem("userEmail");
const role = localStorage.getItem("userRole");
const fullName = localStorage.getItem("userName");

// Helper to capitalize
function capitalize(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1).toLowerCase() : "";
}

// Display welcome message
let displayName = "Player";
if (fullName && role) {
  displayName = `${capitalize(role)} ${fullName}`;
} else if (email && role) {
  const firstPart = email.split("@")[0];
  const firstName = firstPart.charAt(0).toUpperCase() + firstPart.slice(1).toLowerCase();
  displayName = `${capitalize(role)} ${firstName}`;
} else if (email) {
  const firstPart = email.split("@")[0];
  const firstName = firstPart.charAt(0).toUpperCase() + firstPart.slice(1).toLowerCase();
  displayName = `Player ${firstName}`;
}
playerNameElement.textContent = displayName;

// Handball field coordinates (polygon)
const handballField = [
  [-0.5139614631894397, 37.45711996026331],
  [-0.5142979996425096, 37.45759256240965],
  [-0.5142586177180668, 37.45713786185976],
  [-0.5143660229659767, 37.45739922516797]
];

// Check if player is inside polygon
function isPointInPolygon(point, polygon) {
  const [lat, lon] = point;
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [latI, lonI] = polygon[i];
    const [latJ, lonJ] = polygon[j];
    const intersect =
      lonI > lon !== lonJ > lon &&
      lat < ((latJ - latI) * (lon - lonI)) / (lonJ - lonI) + latI;
    if (intersect) inside = !inside;
  }
  return inside;
}

// Load attendance records
function loadAttendance() {
  const attendanceData = JSON.parse(localStorage.getItem("attendanceRecords")) || [];
  attendanceList.innerHTML = "";

  if (attendanceData.length === 0) {
    attendanceList.innerHTML = "<li>No attendance records yet.</li>";
  } else {
    attendanceData.forEach(record => {
      const li = document.createElement("li");
      li.textContent = record;
      attendanceList.appendChild(li);
    });
  }
}

// Mark attendance only inside field
markAttendanceBtn.addEventListener("click", () => {
  if (!navigator.geolocation) {
    attendanceMessage.textContent = "❌ Geolocation not supported.";
    return;
  }

  attendanceMessage.textContent = "📍 Checking your location...";

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const lat = position.coords.latitude;
      const lon = position.coords.longitude;

      if (isPointInPolygon([lat, lon], handballField)) {
        const now = new Date();
        const dateTime = now.toLocaleString();

        const attendanceData = JSON.parse(localStorage.getItem("attendanceRecords")) || [];
        attendanceData.push(dateTime);
        localStorage.setItem("attendanceRecords", JSON.stringify(attendanceData));

        attendanceMessage.textContent = `✅ Attendance marked successfully at ${dateTime}`;
        loadAttendance();
      } else {
        attendanceMessage.textContent = "⚠️ You must be within the handball field to mark attendance.";
      }
    },
    (error) => {
      attendanceMessage.textContent = "❌ Location access denied or unavailable.";
      console.error(error);
    }
  );
});

// Logout
logoutBtn.addEventListener("click", () => {
  localStorage.removeItem("userEmail");
  localStorage.removeItem("userRole");
  localStorage.removeItem("userName");
  window.location.href = "../login.html";
});

// Load attendance on page load
loadAttendance();
