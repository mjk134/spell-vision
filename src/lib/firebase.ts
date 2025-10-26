import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDdkpvOsb9AxIUQIGC0vbOTkpP9YA4AxYg",
  authDomain: "formal-shadow-365112.firebaseapp.com",
  databaseURL: "https://formal-shadow-365112-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "formal-shadow-365112",
  storageBucket: "formal-shadow-365112.firebasestorage.app",
  messagingSenderId: "1076195883063",
  appId: "1:1076195883063:web:0a28c7426e596fe5b467b2"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);