import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// DOM elements
const loginForm = document.getElementById("login-form");
const forgotPassword = document.getElementById("forgot-password");
const message = document.getElementById("message");

// Login event
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value.trim();

  try {
    // Authenticate user
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // Fetch user data from Firestore
    const docRef = doc(db, "users", user.uid);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const userData = docSnap.data();
      const role = userData.role || "player"; // default to player
      const userName = userData.name || email.split("@")[0]; // fallback to email prefix

      // Store user data in localStorage
      localStorage.setItem("userEmail", email);
      localStorage.setItem("userRole", role);
      localStorage.setItem("userName", userName);

      message.textContent = "✅ Login successful! Redirecting...";
      message.style.color = "green";

      // Redirect based on role
      setTimeout(() => {
        if (role === "player") window.location.href = "player-dashboard.html";
        else if (role === "captain") window.location.href = "captain-dashboard.html";
        else if (role === "coach") window.location.href = "coach-dashboard.html";
        else {
          message.textContent = "⚠️ Unknown role. Contact admin.";
          message.style.color = "orange";
        }
      }, 1500);

    } else {
      message.textContent = "⚠️ User data not found. Please sign up again.";
      message.style.color = "orange";
    }
  } catch (error) {
    console.error(error);
    message.textContent = "❌ " + error.message;
    message.style.color = "red";
  }
});

// Forgot Password
forgotPassword.addEventListener("click", async () => {
  const email = document.getElementById("login-email").value.trim();

  if (!email) {
    message.textContent = "⚠️ Please enter your email above first.";
    message.style.color = "orange";
    return;
  }

  try {
    await sendPasswordResetEmail(auth, email);
    message.textContent = "📩 Password reset email sent!";
    message.style.color = "green";
  } catch (error) {
    console.error(error);
    message.textContent = "❌ " + error.message;
    message.style.color = "red";
  }
});
