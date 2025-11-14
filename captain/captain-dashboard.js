import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, addDoc, onSnapshot, collection, query, where, Timestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- ENVIRONMENT AND FIREBASE CONFIG ---
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// --- FIREBASE GLOBALS ---
let db = null;
let auth = null;
let currentUserId = null;
let unsubscribePersonalAttendance = null; 
let unsubscribeTeamData = null; 

// --- FIRESTORE PATHS (Public collection for shared data) ---
const TEAM_ATTENDANCE_COLLECTION = `artifacts/${appId}/public/data/teamAttendance`;

// --- MOCK DATA ---
const mockUserRoles = {
    // Note: These mock UIDs will only match if the platform happens to generate them.
    'player-1': { role: 'player', name: 'Marco' }, 
    'player-2': { role: 'player', name: 'Leo' },
    'captain': { role: 'captain', name: 'Jamie' },
    'coach': { role: 'coach', name: 'Coach Smith' },
    // Default user structure, will use this if no specific UID match is found
    'default': { role: 'player', name: 'Handball Player' }
};

const RoleMapping = {
    player: 'Player',
    captain: 'Captain',
    coach: 'Coach',
};

// Mock performance data, keyed by a simulated shortened UID
const mockPerformance = {
    'playe': { goals: 12, assists: 8, rating: 8.5 }, // player-1
    'playe': { goals: 5, assists: 15, rating: 7.2 }, // player-2
    'capta': { goals: 9, assists: 10, rating: 9.1 }, // captain
    'coac': { goals: 0, assists: 0, rating: 9.9 }, // coach (high score for fun)
    // Fallback performance
    'fallback': { goals: Math.floor(Math.random() * 10), assists: Math.floor(Math.random() * 10), rating: (Math.random() * 2 + 7).toFixed(1) },
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

// --- GEOLOCATION DATA ---
const handballField = [
    [ 37.45711996026331, -0.5139614631894397 ],
    [ 37.45759256240965, -0.5142979996425096 ],
    [ 37.45713786185976, -0.5142586177180668 ],
    [ 37.45739922516797, -0.5143660229659767 ]
];

// --- HELPER FUNCTIONS ---

/** Determines mock role and name based on UID (simulates database lookup) */
function getUserDetails(uid) {
    if (uid.includes('coach')) return mockUserRoles['coach'];
    if (uid.includes('captain')) return mockUserRoles['captain'];
    if (uid.includes('player-1')) return mockUserRoles['player-1'];
    if (uid.includes('player-2')) return mockUserRoles['player-2'];
    
    // Anonymous/Default lookup: Create a unique user object for the environment UID
    const defaultDetails = { ...mockUserRoles['default'] };
    // Assign a unique "pseudo-id" to the default user object for mock performance lookup
    defaultDetails.pseudoId = uid.substring(0, 5); 
    defaultDetails.name = `User-${uid.substring(0, 6)}`;
    return defaultDetails;
}

/** Checks if a point is within a polygon */
function isPointInPolygon(point, polygon) {
    const [lat, lon] = point;
    let inside = false;

    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const [latI, lonI] = polygon[i];
        const [latJ, lonJ] = polygon[j];
        
        const intersect = lonI > lon !== lonJ > lon &&
            lat < ((latJ - latI) * (lon - lonI)) / (lonJ - lonI) + latI;
        if (intersect) inside = !inside;
    }
    return inside;
}

// --- FIREBASE RENDER FUNCTIONS ---

/** Updates the list of the Captain's personal attendance records */
function updatePersonalAttendanceList(records) {
    personalAttendanceList.innerHTML = "";
    if (records.length === 0) {
        personalAttendanceList.innerHTML = `<li class="p-2 bg-gray-100 rounded-md text-gray-600 border-l-4 border-gray-400">No personal records yet.</li>`;
    } else {
        records.forEach(record => {
            const li = document.createElement("li");
            const date = record.timestamp.toDate().toLocaleString();
            li.innerHTML = `<strong>✅ ${date}</strong>`;
            personalAttendanceList.appendChild(li);
        });
    }
}

/** Consolidates and renders the team's attendance and performance */
function updateTeamDataList(allAttendanceRecords) {
    teamLoadingSpinner.classList.add('hidden');
    teamDataList.innerHTML = "";

    if (allAttendanceRecords.length === 0) {
        teamDataList.innerHTML = `<tr class="border-t border-gray-100"><td colspan="4" class="py-3 text-center text-gray-500">No team attendance records found.</td></tr>`;
        return;
    }

    // 1. Group records by userId and count attendance in the last 7 days
    const attendanceByPlayer = {};
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    allAttendanceRecords.forEach(record => {
        const uid = record.userId;
        const recordDate = record.timestamp.toDate();

        if (!attendanceByPlayer[uid]) {
            // Get mock details for the first time
            attendanceByPlayer[uid] = { 
                name: record.userName, 
                role: record.userRole, 
                count: 0,
                // Use the first 5 chars of the UID for the performance lookup
                pseudoId: uid.substring(0, 5), 
            };
        }

        // Only count if the record is within the last 7 days
        if (recordDate > oneWeekAgo) {
            attendanceByPlayer[uid].count++;
        }
    });

    // 2. Render the combined data
    Object.values(attendanceByPlayer).forEach(player => {
        const tr = document.createElement("tr");

        // Get mock performance data based on pseudoId (or fallback)
        const performance = mockPerformance[player.pseudoId] || mockPerformance.fallback;

        tr.innerHTML = `
            <td class="py-3 px-4 font-medium">${player.name} <span class="text-xs text-gray-500">(${RoleMapping[player.role]})</span></td>
            <td class="py-3 px-4 text-center">
                <span class="font-bold text-lg text-green-600">${player.count}</span> / 7
            </td>
            <td class="py-3 px-4 text-center">${performance.goals} goals / ${performance.assists} assists</td>
            <td class="py-3 px-4 text-center font-bold">
                <span class="${performance.rating > 8.0 ? 'text-indigo-600' : 'text-gray-600'}">${performance.rating}</span>
            </td>
        `;
        teamDataList.appendChild(tr);
    });
}

// --- FIREBASE OPERATIONS ---

/** Loads the Captain's personal attendance records */
function loadPersonalAttendance(uid) {
    if (unsubscribePersonalAttendance) unsubscribePersonalAttendance(); 

    if (!db || !uid) return;

    const teamAttendanceRef = collection(db, TEAM_ATTENDANCE_COLLECTION);
    // Query for records matching the current user's ID
    const q = query(teamAttendanceRef, where("userId", "==", uid));

    unsubscribePersonalAttendance = onSnapshot(q, (snapshot) => {
        const records = [];
        snapshot.forEach((doc) => {
            records.push(doc.data());
        });
        
        records.sort((a, b) => b.timestamp.toDate() - a.timestamp.toDate());
        updatePersonalAttendanceList(records);
    }, (error) => {
        console.error("Error loading personal attendance:", error);
        attendanceMessage.textContent = "❌ Error loading personal records.";
    });
}

/** Loads ALL team attendance records (for Captain/Coach view) */
function loadTeamData() {
    if (unsubscribeTeamData) unsubscribeTeamData(); 

    if (!db) return;

    teamLoadingSpinner.classList.remove('hidden');

    const teamAttendanceRef = collection(db, TEAM_ATTENDANCE_COLLECTION);
    // No 'where' clause, fetch everything
    const q = query(teamAttendanceRef);

    unsubscribeTeamData = onSnapshot(q, (snapshot) => {
        const records = [];
        snapshot.forEach((doc) => {
            records.push(doc.data());
        });
        updateTeamDataList(records);
    }, (error) => {
        console.error("Error loading team data:", error);
        teamDataList.innerHTML = `<tr class="border-t border-gray-100"><td colspan="4" class="py-3 text-center text-red-500">Error loading team data.</td></tr>`;
        teamLoadingSpinner.classList.add('hidden');
    });
}

/** Writes a new attendance record to the public collection */
async function markAttendance(locationData, userDetails) {
    if (!db || !currentUserId) {
        attendanceMessage.textContent = "❌ Error: Authentication or database not ready.";
        return;
    }
    
    try {
        const teamAttendanceRef = collection(db, TEAM_ATTENDANCE_COLLECTION);

        await addDoc(teamAttendanceRef, {
            userId: currentUserId,
            userName: userDetails.name,
            userRole: userDetails.role,
            timestamp: Timestamp.now(),
            lat: locationData.latitude,
            lon: locationData.longitude,
        });
        
        attendanceMessage.textContent = `✅ Attendance marked successfully at ${new Date().toLocaleTimeString()}`;

    } catch (error) {
        console.error("Error marking attendance:", error);
        attendanceMessage.textContent = "❌ Failed to mark attendance in the database.";
    }
}

// --- EVENT HANDLERS ---

function handleMarkAttendanceClick(userDetails) {
    if (markAttendanceBtn.disabled) return;

    if (!navigator.geolocation) {
        attendanceMessage.textContent = "Geolocation is not supported by your browser.";
        return;
    }

    markAttendanceBtn.disabled = true;
    markAttendanceBtn.innerHTML = '<span class="loader inline-block mr-2 align-middle"></span> Checking location...';

    navigator.geolocation.getCurrentPosition(
        (position) => {
            const playerLat = position.coords.latitude;
            const playerLon = position.coords.longitude;
            const locationData = { latitude: playerLat, longitude: playerLon };

            if (isPointInPolygon([playerLat, playerLon], handballField)) {
                markAttendance(locationData, userDetails);
            } else {
                attendanceMessage.textContent = "⚠️ You are not within the handball field area!";
            }

            markAttendanceBtn.disabled = false;
            markAttendanceBtn.innerHTML = 'Mark Present';
        },
        (error) => {
            attendanceMessage.textContent = "❌ Unable to get your location. Please allow location access.";
            console.error("Geolocation error:", error);
            markAttendanceBtn.disabled = false;
            markAttendanceBtn.innerHTML = 'Mark Present';
        },
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );
}

function handleLogout() {
    if (unsubscribePersonalAttendance) unsubscribePersonalAttendance(); 
    if (unsubscribeTeamData) unsubscribeTeamData(); 

    signOut(auth).then(() => {
        console.log("Captain signed out. Reloading page.");
        window.location.reload(); 
    }).catch((error) => {
        console.error("Logout failed:", error);
        window.location.reload(); 
    });
}

// --- INITIALIZATION ---

function initDashboard(uid) {
    const userDetails = getUserDetails(uid);
    const roleTitle = RoleMapping[userDetails.role];

    // Set the personalized welcome greeting
    playerNameElement.textContent = `${roleTitle} ${userDetails.name.split(' ').pop()}`;
    
    // Attach event listener, passing userDetails for the attendance record
    markAttendanceBtn.addEventListener("click", () => handleMarkAttendanceClick(userDetails));
    logoutBtn.addEventListener("click", handleLogout);
    
    // Start loading data
    loadPersonalAttendance(uid);
    loadTeamData();

    // Hide loading overlay
    loadingOverlay.classList.add('hidden');
}

async function initializeAppAndAuth() {
    try {
        const app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);
        
        if (initialAuthToken) {
            await signInWithCustomToken(auth, initialAuthToken);
        } else {
            // Sign in anonymously if no token is provided
            await signInAnonymously(auth);
        }

        onAuthStateChanged(auth, (user) => {
            if (user) {
                currentUserId = user.uid;
                initDashboard(currentUserId);
            } else {
                document.getElementById('loading-message').textContent = "Authentication failed.";
                console.error("Authentication failed: User is null.");
            }
        });

    } catch (error) {
        console.error("Initialization error:", error);
        document.getElementById('loading-message').textContent = `App failed to initialize: ${error.message}`;
    }
}

// Start the application setup when the window loads
window.onload = initializeAppAndAuth;