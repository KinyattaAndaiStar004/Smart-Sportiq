// Firebase imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { firebaseConfig } from "../firebase-config.js";

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// DOM elements
const playerNameElement = document.getElementById("player-name");
const logoutBtn = document.getElementById("logout-btn");
const markAttendanceBtn = document.getElementById("mark-attendance");
const attendanceMessage = document.getElementById("attendance-message");
const attendanceList = document.getElementById("attendance-list");

// Helper: capitalize first letter
function capitalize(str) {
    return str ? str.charAt(0).toUpperCase() + str.slice(1).toLowerCase() : "";
}

// Fetch and display user profile
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = "../login.html";
        return;
    }

    try {
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);

        let roleTitle = "Player";
        let fullName = "Unknown";

        if (userSnap.exists()) {
            const data = userSnap.data();
            roleTitle = capitalize(data.role) || roleTitle;
            // Try multiple possible field names
            fullName = data.name || data.fullName || data.displayName || "Unknown";
        }

        playerNameElement.textContent = `Welcome, ${roleTitle} ${fullName}`;
    } catch (err) {
        console.error("Error fetching user profile:", err);
        playerNameElement.textContent = "Welcome, Player";
    }
});

// Handball field polygon coordinates
const handballField = [
    [-0.5139614631894397, 37.45711996026331],
    [-0.5142979996425096, 37.45759256240965],
    [-0.5142586177180668, 37.45713786185976],
    [-0.5143660229659767, 37.45739922516797]
];

// Check if a point is inside polygon
function isPointInPolygon(point, polygon) {
    const [lat, lon] = point;
    let inside = false;

    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const [latI, lonI] = polygon[i];
        const [latJ, lonJ] = polygon[j];

        const intersect = (lonI > lon) !== (lonJ > lon) &&
            lat < ((latJ - latI) * (lon - lonI)) / (lonJ - lonI) + latI;
        if (intersect) inside = !inside;
    }
    return inside;
}

// Load attendance from localStorage
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

// Mark attendance with location check
markAttendanceBtn.addEventListener("click", () => {
    if (!navigator.geolocation) {
        attendanceMessage.textContent = "❌ Geolocation not supported.";
        return;
    }

    attendanceMessage.textContent = "📍 Checking your location...";
    markAttendanceBtn.disabled = true;

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

            markAttendanceBtn.disabled = false;
        },
        (error) => {
            attendanceMessage.textContent = "❌ Location access denied or unavailable.";
            console.error(error);
            markAttendanceBtn.disabled = false;
        }
    );
});

// Logout
logoutBtn.addEventListener("click", async () => {
    try {
        await signOut(auth);
        localStorage.removeItem("attendanceRecords");
        window.location.href = "../login.html";
    } catch (err) {
        console.error("Logout error:", err);
    }
});

// Load attendance on page load
loadAttendance();
