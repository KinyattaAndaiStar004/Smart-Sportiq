import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDocs, collection, query, where } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const signupForm = document.getElementById("signup-form");
const message = document.getElementById("message");

signupForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const fullName = document.getElementById("signup-name").value.trim();
  const email = document.getElementById("signup-email").value.trim();
  const password = document.getElementById("signup-password").value;
  const confirmPassword = document.getElementById("signup-confirm-password").value;
  const role = document.getElementById("signup-role").value;

  if (password !== confirmPassword) {
    message.textContent = "Passwords do not match.";
    message.style.color = "red";
    return;
  }

  if (!role) {
    message.textContent = "Please select your role.";
    message.style.color = "orange";
    return;
  }

  try {
    // Restrict to ONLY ONE coach or captain
    if (role === "coach" || role === "captain") {
      const q = query(collection(db, "users"), where("role", "==", role));
      const snapshot = await getDocs(q);

      if (!snapshot.empty) {
        message.textContent = `Only one ${role} is allowed in the system.`;
        message.style.color = "red";
        return;
      }
    }

    // Create Firebase Auth account
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // Create Firestore record in "users" collection
    await setDoc(doc(db, "users", user.uid), {
      fullName: fullName,
      email: email,
      role: role
    });

    message.textContent = "Account created successfully.";
    message.style.color = "green";

    setTimeout(() => {
      window.location.href = "login.html";
    }, 1500);

  } catch (error) {
    message.textContent = error.message;
    message.style.color = "red";
  }
});
