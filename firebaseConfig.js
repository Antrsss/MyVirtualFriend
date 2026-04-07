const firebaseConfig = {
  apiKey: "AIzaSyAC9BBBiyfiRsiJ6ylw8Tmay5Gs3yCCOrE",
  authDomain: "myvirtualfriend-34453.firebaseapp.com",
  projectId: "myvirtualfriend-34453",
  storageBucket: "myvirtualfriend-34453.firebasestorage.app",
  messagingSenderId: "208647769608",
  appId: "1:208647769608:web:ba0fe33d6eb5620792cbbd",
  measurementId: "G-EZ73RLDGKK",
};

// Инициализация через compat SDK (подключен в index.html)
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();