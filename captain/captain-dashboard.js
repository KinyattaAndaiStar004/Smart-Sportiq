// Firebase imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { 
    getFirestore, 
    addDoc, 
    onSnapshot, 
    collection, 
    query, 
    where, 
    getDoc, 
    doc, 
    Timestamp,
    getDocs  // ADDED
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { firebaseConfig } from "../firebase-config.js";

// --- GLOBAL STATE ---
let db = null;
let auth = null;
let currentUserId = null;
let unsubscribePersonalAttendance = null;
let unsubscribeTeamData = null;

// --- COLLECTION PATHS ---
const TEAM_ATTENDANCE_COLLECTION = "teamAttendance";
const PERFORMANCE_COLLECTION = "playerPerformance";  // ADDED
const PLAYERS_COLLECTION = "users";  // ADDED

// --- ROLE TEXT ---
const RoleMapping = {
    player: "Player",
    captain: "Captain",
    coach: "Coach"
};

// --- DOM ELEMENTS ---
const playerNameElement = document.getElementById("player-name");
const logoutBtn = document.getElementById("logout-btn");
const markAttendanceBtn = document.getElementById("mark-attendance");
const attendanceMessage = document.getElementById("attendance-message");
const personalAttendanceList = document.getElementById("personal-attendance-list");
const teamDataList = document.getElementById("team-data-list");
const loadingOverlay = document.getElementById("loading-view");
const teamLoadingSpinner = document.getElementById("team-loading");

// --- NEW DOM ELEMENTS FOR PERFORMANCE FEATURES ---
const timeFilterElement = document.getElementById("timeFilter");
const sortFilterElement = document.getElementById("sortFilter");
const refreshBtn = document.getElementById("refreshBtn");

// --- HAND BALL FIELD COORDINATES ---
const handballField = [
    [37.45711996026331, -0.5139614631894397],
    [37.45759256240965, -0.5142979996425096],
    [37.45713786185976, -0.5142586177180668],
    [37.45739922516797, -0.5143660229659767]
];

// --- HELPERS ---
function capitalize(str) {
    return str ? str.charAt(0).toUpperCase() + str.slice(1).toLowerCase() : "";
}

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

// --- FETCH USER DETAILS ---
async function getUserDetails(uid) {
    try {
        const ref = doc(db, "users", uid);
        const snap = await getDoc(ref);

        if (!snap.exists()) return { name: "Unknown User", role: "captain" };

        const data = snap.data();
        // Try multiple possible name fields
        const name = data.name || data.fullName || data.displayName || "Unknown";
        const role = data.role || "captain";

        return { name, role };
    } catch (err) {
        console.error("Failed to load user details:", err);
        return { name: "Unknown User", role: "captain" };
    }
}

// --- PERSONAL ATTENDANCE UI ---
function updatePersonalAttendanceList(records) {
    personalAttendanceList.innerHTML = "";
    if (!records.length) {
        personalAttendanceList.innerHTML = `<li class="p-2 bg-gray-100 text-gray-600 rounded-md border-l-4 border-gray-400">No personal records yet.</li>`;
        return;
    }
    records.forEach(rec => {
        const li = document.createElement("li");
        li.innerHTML = `<strong>✅ ${rec.timestamp.toDate().toLocaleString()}</strong>`;
        personalAttendanceList.appendChild(li);
    });
}

// --- PERFORMANCE CALCULATION FUNCTIONS ---
async function calculatePlayerPerformance(userId, timeFilter = "all") {
    try {
        const now = new Date();
        let startDate = new Date(0); // Beginning of time
        
        switch(timeFilter) {
            case "7days":
                startDate = new Date(now.setDate(now.getDate() - 7));
                break;
            case "30days":
                startDate = new Date(now.setDate(now.getDate() - 30));
                break;
            case "90days":
                startDate = new Date(now.setDate(now.getDate() - 90));
                break;
            case "month":
                startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                break;
            // "all" uses default startDate
        }
        
        // Get attendance records
        const attendanceRef = collection(db, TEAM_ATTENDANCE_COLLECTION);
        const attendanceQuery = query(
            attendanceRef, 
            where("userId", "==", userId),
            where("timestamp", ">=", Timestamp.fromDate(startDate))
        );
        
        // Get performance records
        const performanceRef = collection(db, PERFORMANCE_COLLECTION);
        const performanceQuery = query(
            performanceRef,
            where("userId", "==", userId),
            where("date", ">=", startDate)
        );
        
        // Execute queries
        const [attendanceSnap, performanceSnap] = await Promise.all([
            getDocs(attendanceQuery),
            getDocs(performanceQuery)
        ]);
        
        // Calculate attendance
        const totalAttendance = attendanceSnap.size;
        
        // Calculate performance metrics
        let totalGoals = 0;
        let totalAssists = 0;
        let totalRating = 0;
        let performanceCount = 0;
        
        performanceSnap.forEach(doc => {
            const data = doc.data();
            totalGoals += data.goals || 0;
            totalAssists += data.assists || 0;
            totalRating += data.rating || 0;
            performanceCount++;
        });
        
        const avgRating = performanceCount > 0 ? (totalRating / performanceCount).toFixed(1) : 0;
        const lastAttendance = attendanceSnap.docs.length > 0 
            ? attendanceSnap.docs[attendanceSnap.docs.length - 1].data().timestamp.toDate() 
            : null;
        
        return {
            totalAttendance,
            avgRating: parseFloat(avgRating),
            totalGoals,
            totalAssists,
            performanceCount,
            lastAttendance
        };
        
    } catch (error) {
        console.error("Error calculating performance:", error);
        return {
            totalAttendance: 0,
            avgRating: 0,
            totalGoals: 0,
            totalAssists: 0,
            performanceCount: 0,
            lastAttendance: null
        };
    }
}

async function getAllPlayers() {
    try {
        const playersRef = collection(db, PLAYERS_COLLECTION);
        const playersQuery = query(playersRef, where("role", "in", ["player", "captain"]));
        const snapshot = await getDocs(playersQuery);
        
        const players = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            players.push({
                id: doc.id,
                name: data.name || data.fullName || "Unknown",
                role: data.role || "player",
                email: data.email || ""
            });
        });
        
        return players;
    } catch (error) {
        console.error("Error getting players:", error);
        return [];
    }
}

// --- UPDATED TEAM DATA UI ---
async function updateTeamDataList(timeFilter = "all", sortBy = "attendance") {
    try {
        // Show loading state
        const loadingRow = document.querySelector('#team-data-list tr td[colspan="7"]');
        if (loadingRow) {
            loadingRow.innerHTML = `<div class="flex flex-col items-center justify-center">
                <div class="loader mb-4"></div>
                <p class="text-gray-500">Loading team performance data...</p>
            </div>`;
        }
        
        // Get all players
        const players = await getAllPlayers();
        
        if (players.length === 0) {
            teamDataList.innerHTML = `<tr><td colspan="7" class="py-3 text-center text-gray-500">No players found in the team.</td></tr>`;
            updateTeamStats([]);
            return;
        }
        
        // Calculate performance for each player
        const playerPromises = players.map(async (player) => {
            const performance = await calculatePlayerPerformance(player.id, timeFilter);
            return {
                ...player,
                ...performance,
                attendancePercentage: performance.totalAttendance > 0 
                    ? Math.min(100, Math.round((performance.totalAttendance / (timeFilter === "7days" ? 7 : 30)) * 100))
                    : 0
            };
        });
        
        const playerData = await Promise.all(playerPromises);
        
        // Sort the data
        playerData.sort((a, b) => {
            switch(sortBy) {
                case "attendance":
                    return b.attendancePercentage - a.attendancePercentage;
                case "goals":
                    return b.totalGoals - a.totalGoals;
                case "rating":
                    return b.avgRating - a.avgRating;
                case "name":
                    return a.name.localeCompare(b.name);
                default:
                    return b.attendancePercentage - a.attendancePercentage;
            }
        });
        
        // Update the table
        teamDataList.innerHTML = "";
        
        playerData.forEach((player, index) => {
            const tr = document.createElement("tr");
            tr.className = index % 2 === 0 ? "bg-white" : "bg-gray-50 hover:bg-gray-100";
            tr.innerHTML = `
                <td class="py-3 px-4">
                    <div class="font-medium">${player.name}</div>
                    <div class="text-xs ${player.role === 'captain' ? 'text-amber-600 font-semibold' : 'text-gray-500'}">
                        ${RoleMapping[player.role] || player.role}
                        ${player.role === 'captain' ? ' ⭐' : ''}
                    </div>
                </td>
                <td class="py-3 px-4 text-center">
                    <span class="font-bold">${player.totalAttendance}</span>
                    <span class="text-xs text-gray-500 block">sessions</span>
                </td>
                <td class="py-3 px-4 text-center">
                    <div class="relative pt-1">
                        <div class="overflow-hidden h-2 text-xs flex rounded bg-gray-200">
                            <div style="width: ${player.attendancePercentage}%" 
                                 class="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center 
                                        ${player.attendancePercentage >= 80 ? 'bg-green-500' : 
                                          player.attendancePercentage >= 60 ? 'bg-yellow-500' : 'bg-red-500'}">
                            </div>
                        </div>
                        <span class="text-sm font-bold ${player.attendancePercentage >= 80 ? 'text-green-600' : 
                                                         player.attendancePercentage >= 60 ? 'text-yellow-600' : 'text-red-600'}">
                            ${player.attendancePercentage}%
                        </span>
                    </div>
                </td>
                <td class="py-3 px-4 text-center">
                    <span class="font-bold text-blue-600">${player.totalGoals}</span>
                    <span class="text-xs text-gray-500 block">goals</span>
                </td>
                <td class="py-3 px-4 text-center">
                    <span class="font-bold text-purple-600">${player.totalAssists}</span>
                    <span class="text-xs text-gray-500 block">assists</span>
                </td>
                <td class="py-3 px-4 text-center">
                    <div class="inline-flex items-center px-2 py-1 rounded-full 
                                ${player.avgRating >= 8 ? 'bg-green-100 text-green-800' :
                                  player.avgRating >= 6 ? 'bg-yellow-100 text-yellow-800' :
                                  player.avgRating > 0 ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'}">
                        ${player.avgRating > 0 ? player.avgRating + '/10' : 'N/A'}
                    </div>
                </td>
                <td class="py-3 px-4 text-center text-sm text-gray-600">
                    ${player.lastAttendance 
                        ? player.lastAttendance.toLocaleDateString() 
                        : 'Never'}
                </td>
            `;
            teamDataList.appendChild(tr);
        });
        
        // Update team statistics
        updateTeamStats(playerData);
        
    } catch (error) {
        console.error("Error updating team data:", error);
        teamDataList.innerHTML = `<tr><td colspan="7" class="py-3 text-center text-red-500">
            Error loading team data: ${error.message}
        </td></tr>`;
    }
}

// --- TEAM STATISTICS ---
function updateTeamStats(playerData) {
    if (!playerData || playerData.length === 0) {
        document.getElementById('totalPlayers').textContent = '0';
        document.getElementById('avgAttendance').textContent = '0%';
        document.getElementById('avgGoals').textContent = '0';
        document.getElementById('avgRating').textContent = '0.0';
        return;
    }
    
    const totalPlayers = playerData.length;
    const totalAttendance = playerData.reduce((sum, p) => sum + p.attendancePercentage, 0);
    const totalGoals = playerData.reduce((sum, p) => sum + p.totalGoals, 0);
    const totalRating = playerData.filter(p => p.avgRating > 0)
                                  .reduce((sum, p) => sum + p.avgRating, 0);
    const playersWithRating = playerData.filter(p => p.avgRating > 0).length;
    
    document.getElementById('totalPlayers').textContent = totalPlayers;
    document.getElementById('avgAttendance').textContent = Math.round(totalAttendance / totalPlayers) + '%';
    document.getElementById('avgGoals').textContent = playersWithRating > 0 
        ? Math.round(totalGoals / Math.max(playersWithRating, 1))
        : '0';
    document.getElementById('avgRating').textContent = playersWithRating > 0 
        ? (totalRating / playersWithRating).toFixed(1)
        : '0.0';
}

// --- MARK ATTENDANCE ---
async function markAttendance(locationData, userDetails) {
    try {
        const ref = collection(db, TEAM_ATTENDANCE_COLLECTION);
        await addDoc(ref, {
            userId: currentUserId,
            userName: userDetails.name,
            userRole: userDetails.role,
            timestamp: Timestamp.now(),
            lat: locationData.latitude,
            lon: locationData.longitude
        });
        attendanceMessage.textContent = `✅ Attendance marked successfully at ${new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
        attendanceMessage.style.color = "var(--green)";
    } catch (err) {
        attendanceMessage.textContent = "❌ Error saving attendance.";
        attendanceMessage.style.color = "#ef4444";
        console.error(err);
    }
}

function handleMarkAttendanceClick(userDetails) {
    if (!navigator.geolocation) {
        attendanceMessage.textContent = "Geolocation not supported.";
        attendanceMessage.style.color = "#ef4444";
        return;
    }
    markAttendanceBtn.disabled = true;
    markAttendanceBtn.innerHTML = `<span class="loader mr-2"></span>Checking location...`;
    navigator.geolocation.getCurrentPosition(
        pos => {
            const lat = pos.coords.latitude;
            const lon = pos.coords.longitude;
            if (isPointInPolygon([lat, lon], handballField)) {
                markAttendance({ latitude: lat, longitude: lon }, userDetails);
            } else {
                attendanceMessage.textContent = "You are not inside the handball field area.";
                attendanceMessage.style.color = "#ef4444";
            }
            markAttendanceBtn.disabled = false;
            markAttendanceBtn.textContent = "Mark Present";
        },
        err => {
            attendanceMessage.textContent = "Location error. Please allow access.";
            attendanceMessage.style.color = "#ef4444";
            console.error(err);
            markAttendanceBtn.disabled = false;
            markAttendanceBtn.textContent = "Mark Present";
        },
        { enableHighAccuracy: true, timeout: 5000 }
    );
}

// --- LOGOUT ---
function handleLogout() {
    if (unsubscribePersonalAttendance) unsubscribePersonalAttendance();
    if (unsubscribeTeamData) unsubscribeTeamData();
    signOut(auth).finally(() => window.location.reload());
}

// --- INIT DASHBOARD ---
async function initDashboard(uid) {
    const userDetails = await getUserDetails(uid);
    // Display name
    playerNameElement.textContent = `Welcome, ${capitalize(userDetails.role)} ${userDetails.name}`;

    // Set up event listeners
    markAttendanceBtn.addEventListener("click", () => handleMarkAttendanceClick(userDetails));
    logoutBtn.addEventListener("click", handleLogout);
    
    // Set up filter listeners
    if (timeFilterElement && sortFilterElement && refreshBtn) {
        timeFilterElement.addEventListener('change', () => {
            updateTeamDataList(timeFilterElement.value, sortFilterElement.value);
        });
        
        sortFilterElement.addEventListener('change', () => {
            updateTeamDataList(timeFilterElement.value, sortFilterElement.value);
        });
        
        refreshBtn.addEventListener('click', () => {
            updateTeamDataList(timeFilterElement.value, sortFilterElement.value);
        });
    }

    // Load data
    loadPersonalAttendance(uid);
    updateTeamDataList(); // Changed from loadTeamData()

    // Hide loading overlay
    loadingOverlay.classList.add("hidden");
}

// --- LOAD PERSONAL ATTENDANCE ---
function loadPersonalAttendance(uid) {
    if (unsubscribePersonalAttendance) unsubscribePersonalAttendance();
    const ref = collection(db, TEAM_ATTENDANCE_COLLECTION);
    const q = query(ref, where("userId", "==", uid));
    unsubscribePersonalAttendance = onSnapshot(q, snap => {
        const rec = [];
        snap.forEach(doc => rec.push(doc.data()));
        rec.sort((a, b) => b.timestamp.toDate() - a.timestamp.toDate());
        updatePersonalAttendanceList(rec);
    });
}

// --- INITIALIZE APP ---
function initializeCaptainDashboard() {
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);

    onAuthStateChanged(auth, user => {
        if (user) {
            currentUserId = user.uid;
            initDashboard(currentUserId);
        } else {
            document.getElementById("loading-message").textContent = "Please login first.";
            setTimeout(() => window.location.href = "../login.html", 2000);
        }
    }, error => {
        console.error("Auth error:", error);
        document.getElementById("loading-message").textContent = "Authentication error. Redirecting...";
        setTimeout(() => window.location.href = "../login.html", 2000);
    });
}

window.onload = initializeCaptainDashboard;