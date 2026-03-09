import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

export const firebaseConfig = {
    apiKey: "AIzaSyCQ3Ced4Ah2KaNlU6BFa5UfOTfFnXXjY2k",
    authDomain: "gallaryanika.firebaseapp.com",
    projectId: "gallaryanika",
    storageBucket: "gallaryanika.firebasestorage.app",
    messagingSenderId: "97730645039",
    appId: "1:97730645039:web:b215bc4482900bc1a30ada",
    measurementId: "G-M7S49TJP6X"
};

const app = initializeApp(firebaseConfig);
console.log("Firebase app initialized:", app);
export const db = getFirestore(app);