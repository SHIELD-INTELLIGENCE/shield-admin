import { initializeApp } from "firebase/app";
import { getFirestore, collection } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_PROJECT_ID,
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

const usersCollection = collection(db, "users");
const invoicesCollection = collection(db, "invoices");
const enterpriseConsultationsCollection = collection(db, "enterpriseConsultations");

export { auth, db, usersCollection, invoicesCollection, enterpriseConsultationsCollection };
