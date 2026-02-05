import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyCRa8Wj1LvsZcFXPnex7vjAFkCXdzLSgRc",
  authDomain: "counseling-homework.firebaseapp.com",
  projectId: "counseling-homework",
  storageBucket: "counseling-homework.firebasestorage.app",
  messagingSenderId: "342368091482",
  appId: "1:342368091482:web:6cafae5dd28ecf3dec4763",
  measurementId: "G-LNGGLRPMLK"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export default app;
