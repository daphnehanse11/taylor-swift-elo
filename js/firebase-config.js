// Firebase configuration
export const firebaseConfig = {
    apiKey: "AIzaSyBOS3C3YVEKdqJ-_8bvCK-6BukVbYPutzE",
    authDomain: "taylor-swift-elo.firebaseapp.com",
    projectId: "taylor-swift-elo",
    storageBucket: "taylor-swift-elo.firebasestorage.app",
    messagingSenderId: "407729731773",
    appId: "1:407729731773:web:9e5d2284a2b8203e23dfd4",
    measurementId: "G-PSDLZ8QDXJ"
};

// Check if Firebase is properly configured
export function isFirebaseConfigured() {
    return firebaseConfig.apiKey !== "YOUR_API_KEY";
}
