/**
 * Firebase configuration
 *
 * 1. Go to https://console.firebase.google.com and create a project.
 * 2. Enable Realtime Database (start in test mode for development).
 * 3. Copy your web app config below.
 * 4. Set database.rules.json rules before going to production.
 */
import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';

const firebaseConfig = {
  apiKey: "AIzaSyD3QAoojNhdj8LPAYJcNWB-g4hlH1-mF38",
  authDomain: "birdhouse-fb026.firebaseapp.com",
  databaseURL: "https://birdhouse-fb026-default-rtdb.firebaseio.com",
  projectId: "birdhouse-fb026",
  storageBucket: "birdhouse-fb026.firebasestorage.app",
  messagingSenderId: "959460946924",
  appId: "1:959460946924:web:a6738b6651e1171f33c6c9",
  measurementId: "G-6Z04YTEQWW"
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
