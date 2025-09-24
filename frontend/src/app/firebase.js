// src/firebase.ts
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyD6vYdHVSi0rkkZj2tcNp7ajdA-tQSOMTs",
  authDomain: "danceperfect-ea532.firebaseapp.com",
  projectId: "danceperfect-ea532",
  storageBucket: "danceperfect-ea532.appspot.com", // fixed typo from ".app"
  messagingSenderId: "669099556167",
  appId: "1:669099556167:web:6c7fe9e0c852fad24b6062"
};

const app = initializeApp(firebaseConfig);

// Export initialized services
export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);

import { db, auth, storage } from '@/firebase'; // or relative path

// Example Firestore usage
import { collection, addDoc } from 'firebase/firestore';

await addDoc(collection(db, "results"), {
  userId: "abc123",
  rmse: 0.234,
  status: "Done"
});
